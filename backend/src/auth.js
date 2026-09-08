// ============================================================================
//  auth.js — Kimlik dogrulama yardimcilari.
//    - Parola hash/dogrulama (bcrypt). Eski duz-metin kayitlarla geriye
//      donuk uyumluluk: ilk basarili girisde otomatik hash'e migrate edilir
//      (cagiran taraf `migrated:true` gorunce yeni hash'i kaydetmelidir).
//    - JWT access token imzalama/dogrulama (15dk) + opak refresh token
//      uretimi/hash'leme (Issue #86). Refresh token ASLA ham saklanmaz;
//      yalnizca SHA-256 ozeti RefreshToken tablosuna yazilir.
//    - Passport.js stratejileri (Issue #86): local (kullanici adi/sifre) ve
//      jwt (Bearer). local stratejisi SADECE dogrulama yapar; basarisiz
//      deneme sayaci / hesap kilidi / audit, giris route'unda islenir.
//    - Express middleware'leri: requireAuth (her istekte token zorunlu,
//      birkac genel yol haric), requirePM (yalnizca Proje Yoneticisi),
//      projectAccessGuard (app.param('pid', ...) — personel yalnizca
//      kendi atandigi projeye erisebilir; PM her projeye erisebilir).
// ============================================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { createHmac, timingSafeEqual, createHash, randomBytes } from 'node:crypto';

// Gizli anahtarlar yalnizca ortam degiskenlerinden gelir; fallback YOK.
// Tanimsizsa process acilista durur (fail-fast, guvenli varsayilan).
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}
// Issue #85: refresh-token altyapisi (#86) icin ikinci anahtar hazirlandi.
if (!process.env.REFRESH_TOKEN_SECRET) {
  throw new Error('REFRESH_TOKEN_SECRET is required');
}
const JWT_SECRET = process.env.JWT_SECRET;

// Issue #86: erisim (access) belirteci 15 dk; refresh belirteci 7 gun.
// Brute-force karsiti hesap kilidi: 5 hata -> 15 dk kilit.
const ACCESS_TOKEN_TTL = '15m';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// bcrypt maliyet faktoru (salt rounds). Varsayilan 12; ortamdan override.
// Not: Issue #85 — istenen `bcrypt` yerine `bcryptjs` kullanilir (dogal
// derleme gerektirmez, ayni $2 hashlerini uretir; node:24-slim build
// araclari icermez). SECURITY: SALT_ROUNDS'ı uretimde dusurmeyin.
const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

// Sabit anahtar: yalnizca eski duz-metin kayitlarin timing-sal
// karsilastirmasi icin. Oturum JWT'si (JWT_SECRET) ile
// ayiririz; bu pepper gizli degildir — amacı sadece iki eski
// metnin karsilastirirken ayni uzunlukta hash üretmek.
// Override etmek istersen: LEGACY_PASSWORD_PEPPER env'ine deger ver.
const LEGACY_PEPPER = process.env.LEGACY_PASSWORD_PEPPER || 'legacy-plaintext-compare-pepper';

// Iki stringi (veya string olmayanlari bos "" olarak kabul edip)
// sabit uzunlukta HMAC-SHA256 ozetine sadecek, ardindan
// crypto.timingSafeEqual ile karsilastirir.
// - Uzunluk farki halinde Node.js exception firlatmaz (ikisi de 32 byte).
// - Karsilastirma girdi degisikliginden bagimsiz calisir (timing attack direnci).
function constantTimeEqualString(a, b) {
  // non-string (undefined/null) girdide eski "a === b" davranisinin
  // false-donmesini taklit ederiz: iki yan da string degilsen false ver.
  // (aksi halde '' === '' -> true olur; olası auth bypass).
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = createHmac('sha256', LEGACY_PEPPER).update(a).digest();
  const hb = createHmac('sha256', LEGACY_PEPPER).update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function verifyPassword(plain, stored) {
  if (typeof stored === 'string' && stored.startsWith('$2')) {
    // Bcrypt hash == zaman-kararli (sabit uretilen byte'lar).
    return { ok: await bcrypt.compare(plain, stored), migrated: false };
  }
  // Eski duz-metin kayit: artik timing saldırısı acıgı yok.
  // Farkli tipler/uzunluklar da exception firlatmaz, false döner.
  return { ok: constantTimeEqualString(plain, stored), migrated: true };
}

// --- JWT access token (15dk) ------------------------------------------------
//  Issue #86: onceki tek 12h belirtecin yerine 15dk'lik erisim tokeni.
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

// --- Opaq refresh token (7 gun) --------------------------------------------
//  Issue #86: ham token ASLA saklanmaz, SHA-256 ozeti DB'ye yazilir (rotasyon
//  + iptal edilebilirlik). Belirtecin kendisi rastgele 384 bit'tir.
export function generateRefreshToken() {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(raw) {
  return createHash('sha256').update(String(raw)).digest('hex');
}

// --- Passport.js stratejileri (Issue #86) -----------------------------------
//  `configurePassport(prisma)` tek bir PrismaClient paylasim icindir
//  (server.js'teki prisma). local stratejisi salt okuma/dogrulama yapar;
//  DB yazma yan etkileri (hata sayaci, kilit, audit) giris route'unda yapilir.
export function configurePassport(prisma) {
  passport.use(
    new LocalStrategy(
      { usernameField: 'username', passwordField: 'password', passReqToCallback: true },
      async (req, username, password, done) => {
        try {
          const uname = (username || '').trim();
          const user = await prisma.user.findUnique({ where: { username: uname } });
          if (!user) {
            return done(null, false, { message: 'invalid', username: uname, ip: req.ip });
          }
          if (user.lockedUntil && user.lockedUntil > new Date()) {
            return done(null, false, { message: 'locked', user, ip: req.ip });
          }
          if (!user.isActive) {
            return done(null, false, { message: 'inactive', user, ip: req.ip });
          }
          const { ok, migrated } = await verifyPassword(password, user.passwordHash);
          if (!ok) {
            return done(null, false, { message: 'invalid', user, ip: req.ip });
          }
          return done(null, user, { migrated });
        } catch (e) {
          return done(e);
        }
      },
    ),
  );

  passport.use(
    new JwtStrategy(
      { jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: JWT_SECRET },
      (payload, done) => {
        // Belirtecin kendisi JWT_SECRET ile dogrulandi; kullaniciyi ayrica
        // DB'den cekmeye gerek yok (stateless) — payload req.auth olur.
        return done(null, payload);
      },
    ),
  );
}

// Token gerektirmeyen tek yollar: saglik kontrolu + auth uclari.
// (refresh ve logout, Bearer yerine body'deki refresh token ile dogrulanir.)
const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/auth/passcode',
  '/api/auth/refresh',
  '/api/auth/logout',
]);

export function requireAuth(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) return next();
  passport.authenticate('jwt', { session: false }, (err, payload) => {
    if (err) return res.status(401).json({ error: 'Gecersiz veya suresi dolmus oturum.' });
    if (!payload) return res.status(401).json({ error: 'Kimlik dogrulama gerekli.' });
    req.auth = payload;
    next();
  })(req, res, next);
}

export function requirePM(req, res, next) {
  if (!req.auth?.isPM) {
    return res.status(403).json({ error: 'Bu islem yalnizca Proje Yoneticisi tarafindan yapilabilir.' });
  }
  next();
}

/** app.param('pid', projectAccessGuard) — proje sinirini asma (IDOR) korumasi. */
export function projectAccessGuard(req, res, next, pid) {
  if (!req.auth) return res.status(401).json({ error: 'Kimlik dogrulama gerekli.' });
  if (req.auth.isPM) return next();
  // PM degilse yalnizca atanmis projeye erisilebilir. Regular User (kind='user')
  // ve passcode personeli (kind='personnel') icin ayni kural: projectId === pid.
  if ((req.auth.kind === 'personnel' || req.auth.kind === 'user') && req.auth.projectId === pid) return next();
  return res.status(403).json({ error: 'Bu projeye erisim yetkiniz yok.' });
}

export { MAX_LOGIN_ATTEMPTS, LOCK_DURATION_MS, REFRESH_TOKEN_TTL_MS, passport };
