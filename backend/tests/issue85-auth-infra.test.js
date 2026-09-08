// ============================================================================
//  issue85-auth-infra.test.js — Issue #85: Auth altyapi dogrulama testleri.
//  Kapsam:
//    1) User reshape: login payload systemRole + clearanceLevel dondurur
//    2) register -> login roundtrip (passwordHash rename sonrasi bcrypt hala calisir)
//    3) Rate limiter XFF'e gore anahtarlanir (iki farkli XFF -> bagimsiz sayaçlar;
//       21. istek 429 doner)
//    4) Request logger req.ip'i XFF'ten turer (AC #1: loglarda gercek istemci IP)
//    5) SystemAuditLog create/read
//    6) RefreshToken create + user silinince cascade delete
//    7) Requirement.clearanceLevel varsayilan 1
//    8) scripts/seed-admin.mjs idempotent (iki kez calisirsa tek ADMIN)
// ============================================================================
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
// Ortak env + DB reset yardimcisi (tek dogruluk kaynagi: tests/_setup.js).
import './_setup.js';
import { resetDb } from './_setup.js';

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

// backend/ klasoru (test dosyasi backend/tests/ icinde).
const BACKEND_DIR = fileURLToPath(new URL('..', import.meta.url));

const PM_CREDENTIALS = { username: 'pm-issue85', password: 'pm-pass-1234' };
const NEW_USER = { username: 'yeni-issue85', password: 'yeni-sifre-1234', name: 'Issue85 Yeni' };

before(async () => {
  resetDb();

  const { hashPassword } = await import('../src/auth.js');
  await prisma.user.create({
    data: {
      username: PM_CREDENTIALS.username,
      passwordHash: await hashPassword(PM_CREDENTIALS.password),
      name: 'Issue85 PM',
      role: 'Proje Yoneticisi',
      systemRole: 'ADMIN',
      clearanceLevel: 5,
      isActive: true,
    },
  });
});

after(async () => {
  await prisma.$disconnect();
});

// --- 1) User reshape: login payload yeni alanlari icerir --------------------
test('POST /api/auth/login — user payload systemRole + clearanceLevel dondurur', async () => {
  const res = await request(app).post('/api/auth/login').send(PM_CREDENTIALS);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.systemRole, 'ADMIN');
  assert.equal(res.body.user.clearanceLevel, 5);
  // Guvenlik: hash asla yazilmamaz.
  assert.equal(res.body.user.passwordHash, undefined);
});

// --- 2) register -> login roundtrip (passwordHash rename) ---------------------
test('POST /api/auth/register -> login — bcrypt hash ile roundtrip calisir', async () => {
  // register KAPALI varsayilan; test icin anahtar tanimla.
  process.env.PM_REGISTRATION_KEY = 'test-registration-key';

  const login = await request(app).post('/api/auth/login').send(PM_CREDENTIALS);
  const pmToken = login.body.accessToken;

  const reg = await request(app)
    .post('/api/auth/register')
    .set('Authorization', `Bearer ${pmToken}`)
    .set('x-registration-key', 'test-registration-key')
    .send(NEW_USER);
  assert.equal(reg.status, 201);
  assert.equal(reg.body.username, NEW_USER.username);
  assert.equal(reg.body.passwordHash, undefined);

  // Yeni kullanici ile giris: hash dogrulanmis olmali (200 = ok).
  const login2 = await request(app)
    .post('/api/auth/login')
    .send({ username: NEW_USER.username, password: NEW_USER.password });
  assert.equal(login2.status, 200);
  assert.ok(login2.body.accessToken);
});

// --- 3) Rate limiter XFF'e gore anahtarlanir -----------------------------------
test('Rate limiter — XFF bazli bagimsiz sayaçlar; 21. istek 429 doner', async () => {
  const XFF_A = '203.0.113.1';
  const XFF_B = '203.0.113.2';

  // A: max=20 oldugundan ilk 20 istek engellenmez (yanlis sifre -> 401), 21. -> 429.
  for (let i = 1; i <= 20; i++) {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', XFF_A)
      .send({ username: 'kimse-yok', password: 'yanlis' });
    assert.equal(res.status, 401, `istek ${i}: 401 beklenir, 429 alinmamali`);
  }
  const limited = await request(app)
    .post('/api/auth/login')
    .set('X-Forwarded-For', XFF_A)
    .send({ username: 'kimse-yok', password: 'yanlis' });
  assert.equal(limited.status, 429);

  // B: farkli XFF -> bagimsiz sayaç; A'nin limiti B'yi etkilememis olmali.
  const other = await request(app)
    .post('/api/auth/login')
    .set('X-Forwarded-For', XFF_B)
    .send({ username: 'kimse-yok', password: 'yanlis' });
  assert.equal(other.status, 401, 'farkli XFF farkli sayac kullanmali (429 degil)');
});

// --- 4) Request logger: req.ip XFF'ten turer (AC #1) --------------------------
test('Request logger — XFF sonrasi req.ip logda gorunur', async () => {
  const orig = console.log;
  const logs = [];
  console.log = (m) => logs.push(String(m));
  try {
    await request(app).get('/api/health').set('X-Forwarded-For', '198.51.100.7');
    assert.ok(
      logs.some((l) => l.includes('198.51.100.7') && l.includes('GET /api/health')),
      `XFF'ten turetilen req.ip logda olmali. Loglar: ${JSON.stringify(logs)}`,
    );
  } finally {
    console.log = orig;
  }
});

// --- 5) SystemAuditLog create/read --------------------------------------------
test('SystemAuditLog — olusturulur ve okunur (userId null dahil)', async () => {
  const created = await prisma.systemAuditLog.create({
    data: {
      userId: null,
      action: 'login.failed',
      metadata: { username: 'bilinmeyen', ip: '198.51.100.7' },
    },
  });
  assert.ok(created.id);
  assert.equal(created.action, 'login.failed');

  const found = await prisma.systemAuditLog.findMany({ where: { action: 'login.failed' } });
  // Issue #86: basarisiz girisler artik her denemede login.failed yazar; bu
  // yuzden global sayi 1 olmak zorunda degil — olusturdugumuz kayit mevcut olsun.
  assert.ok(found.length >= 1);
  assert.ok(found.some((r) => r.metadata?.username === 'bilinmeyen'));
});

// --- 6) RefreshToken create + user silinince cascade --------------------------
test('RefreshToken — olusur ve kullanici silinince cascade ile silinir', async () => {
  const { hashPassword } = await import('../src/auth.js');
  const user = await prisma.user.create({
    data: {
      username: 'rt-cascade-user',
      passwordHash: await hashPassword('sifre'),
      name: 'RT Cascade',
    },
  });
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: 'hash-bir', expiresAt: new Date(Date.now() + 3600_000) },
  });
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: 'hash-iki', expiresAt: new Date(Date.now() + 3600_000) },
  });

  const beforeDelete = await prisma.refreshToken.count({ where: { userId: user.id } });
  assert.equal(beforeDelete, 2);

  await prisma.user.delete({ where: { id: user.id } });
  const afterDelete = await prisma.refreshToken.count({ where: { userId: user.id } });
  assert.equal(afterDelete, 0, 'user silinince refresh tokenlari cascade ile silinmeli');
});

// --- 7) Requirement.clearanceLevel varsayilan 1 -------------------------------
test('Requirement — clearanceLevel belirtilmezse 1 olur', async () => {
  const project = await prisma.project.create({ data: { name: 'Issue85 Klirens Proje' } });
  const req = await prisma.requirement.create({
    data: {
      projectId: project.id,
      text_id: 'REQ-CL-001',
      title: 'Klirens test gereksinimi',
      type: 'System Requirement',
    },
  });
  assert.equal(req.clearanceLevel, 1);
});

// --- 8) scripts/seed-admin.mjs idempotent -------------------------------------
test('seed-admin.mjs — iki kez calistirilirsa tek ADMIN kalir', async () => {
  const runScript = () =>
    execSync('node scripts/seed-admin.mjs', {
      cwd: BACKEND_DIR,
      env: { ...process.env },
      stdio: 'pipe',
    });

  runScript();
  runScript();

  const admins = await prisma.user.count({ where: { username: 'admin' } });
  assert.equal(Number(admins), 1);
});
