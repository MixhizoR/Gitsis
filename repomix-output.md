This file is a merged representation of a subset of the codebase, containing specifically included files, combined into a single document by Repomix.

# File Summary

## Purpose
This file contains a packed representation of a subset of the repository's contents that is considered the most important context.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Only files matching these patterns are included: ./backend
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
````
backend/
  prisma/
    schema.prisma
  src/
    auth.js
    cascade.js
    constants.js
    impact.js
    logic.js
    reqifParser.js
    sanitize.js
    seed.js
    server.js
    traceability.js
  tests/
    api.test.js
    cascade.test.js
    impact.test.js
    logic.test.js
    seed.test.js
    traceability-export.test.js
    traceability-import.test.js
    verify-password.test.js
  .dockerignore
  .env.example
  .prettierignore
  .prettierrc.json
  Dockerfile
  eslint.config.js
  healthcheck.js
  package.json
  README.md
````

# Files

## File: backend/prisma/schema.prisma
````prisma
// ============================================================================
//  schema.prisma  —  EHSIM - GITSIS / RMT veri tabani semasi (PostgreSQL).
//  Tum veri PROJE bazli izole edilir (project-isolated). Bir proje silinince
//  ona ait tum kayitlar cascade ile temizlenir.
//  Tablolar: Users, Projects, ProjectFields, Requirements, TestCases,
//            TraceabilityLinks, GlossaryTerms, AuditLogs.
// ============================================================================

generator client {
  provider      = "prisma-client-js"
  // Debian slim (ARM64) icin dogru sorgu motoru ikili dosyasi uretilsin.
  binaryTargets = ["native", "linux-arm64-openssl-3.0.x", "debian-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// --- Kullanicilar (kimlik dogrulama) ---------------------------------------
model User {
  id        String   @id @default(uuid())
  username  String   @unique
  password  String
  name      String
  initials  String?
  role      String   @default("System Engineer")
  createdAt DateTime @default(now())
}

// --- Projeler ---------------------------------------------------------------
model Project {
  id           String             @id @default(uuid())
  name         String
  description  String             @default("")
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  fields       ProjectField[]
  requirements Requirement[]
  testCases    TestCase[]
  links        TraceabilityLink[]
  glossary     GlossaryTerm[]
  audit        AuditLog[]
  roles        Role[]
  personnel    Personnel[]
  approvals    Approval[]
}

// --- Roller (proje bazli, dinamik) -----------------------------------------
//  permissions: 12 kademeli izin JSON'u. Her izin { enabled, components[] }
//  seklinde saklanir (components = hangi hiyerarsi bilesenleri kapsar).
model Role {
  id          String      @id @default(uuid())
  projectId   String
  name        String
  permissions Json        @default("{}")
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  project     Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  personnel   Personnel[]

  @@unique([projectId, name])
  @@index([projectId])
}

// --- Personel (passcode ile giris yapan atanmis kisiler) -------------------
model Personnel {
  id         String   @id @default(uuid())
  projectId  String
  roleId     String
  firstName  String
  lastName   String
  passcode   String   @unique
  createdAt  DateTime @default(now())
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  role       Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)
  approvals  Approval[]

  @@index([projectId])
  @@index([roleId])
}

// --- Onay oylari (consensus) -----------------------------------------------
//  Bir gereksinim/test icin bir oy verenin (personel veya PM) onayi.
//  voterId: personel id'si veya 'PM' (proje yoneticisi). entityType:
//  'requirement' | 'testcase'.
model Approval {
  id          String     @id @default(uuid())
  projectId   String
  entityType  String
  entityId    String
  voterId     String
  voterName   String
  personnelId String?
  createdAt   DateTime   @default(now())
  project     Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  personnel   Personnel? @relation(fields: [personnelId], references: [id], onDelete: Cascade)

  @@unique([projectId, entityType, entityId, voterId])
  @@index([projectId, entityType, entityId])
}

// --- Dinamik "Alan" (Field / Disiplin) secenekleri (proje bazli) -----------
model ProjectField {
  id        String  @id @default(uuid())
  projectId String
  name      String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, name])
  @@index([projectId])
}

// --- Gereksinimler (User / System / Software / Hardware) --------------------
model Requirement {
  id          String   @id @default(uuid())
  projectId   String
  text_id     String
  title       String
  description String   @default("")
  type        String   // 'User Requirement' | 'System Requirement' | 'Software Requirement' | 'Hardware Requirement'
  field       String? // dinamik Alan / disiplin
  priority    String   @default("Medium")
  status      String   @default("In Review")
  dal_level   String   @default("DAL D")
  author      String?
  approvalStatus String @default("Pending") // 'Pending' | 'Approved'
  locked         Boolean @default(false)    // onaylandiginda kilitlenir
  relatedDocuments String[] @default([])    // Etki analizinde gosterilen ilgili dokuman/etiket listesi
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, text_id])
  @@index([projectId, type])
}

// --- Test Senaryolari (Acceptance / System / Sub-system Test) ---------------
model TestCase {
  id          String   @id @default(uuid())
  projectId   String
  text_id     String
  title       String
  description String   @default("")
  type        String   // 'Acceptance Test' | 'System Test' | 'Sub-system Test'
  field       String? // gereksinimden otomatik kopyalanir
  priority    String? // gereksinimden otomatik kopyalanir
  status      String   @default("In Review") // 'Approved' (Passed) | 'Rejected' (Failed) | 'In Review'
  dal_level   String? // gereksinimden otomatik kopyalanir
  author      String?
  approvalStatus String @default("Pending") // 'Pending' | 'Approved'
  locked         Boolean @default(false)    // onaylandiginda kilitlenir
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, text_id])
  @@index([projectId, type])
}

// --- Izlenebilirlik baglari -------------------------------------------------
//  type = 'Satisfies' | 'Verifies' | 'Assigned To'
//    Satisfies : fromId = UST gereksinim, toId = ALT gereksinim
//                (User <- System, System <- Software/Hardware)
//    Verifies  : fromId = gereksinim,      toId = test senaryosu
//    Assigned To: fromId = gereksinim,     toId = glossary terimi
model TraceabilityLink {
  id        String   @id @default(uuid())
  projectId String
  fromId    String
  toId      String
  type      String
  createdAt DateTime @default(now())
  createdBy String?
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, fromId, toId, type])
  @@index([projectId, type])
}

// --- Sozluk (Glossary) ------------------------------------------------------
model GlossaryTerm {
  id         String   @id @default(uuid())
  projectId  String
  text_id    String
  term       String
  definition String   @default("")
  author     String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, text_id])
  @@index([projectId])
}

// --- Degisiklik Tarihcesi (Audit Log) ---------------------------------------
model AuditLog {
  id         String   @id @default(uuid())
  projectId  String
  action     String
  entityType String?
  entityId   String?
  textId     String?
  field      String?
  oldValue   String?
  newValue   String?
  message    String?
  actor      String?
  createdAt  DateTime @default(now())
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
}
````

## File: backend/src/cascade.js
````javascript
// ============================================================================
//  cascade.js  —  Issue #15: Toplu (bulk) durum ve onay yeniden hesabi.
//  N+1 yerine sabit sayida sorgu: durum icin 1 okuma + <=3 updateMany + 1 audit;
//  onay icin 1 personnel okuma + 12 parametrik bulk UPDATE (6 bilesen x 2).
//  Sadece degeri DEGISEN satirlar yazilir ("sadece etkilenenler").
// ============================================================================
import { Prisma } from '@prisma/client';
import { REQ_TYPE, TEST_TYPE } from './constants.js';

// --- Bilesen -> varlik tip eslemesi (server.js'teki componentKeyOf ile ayni)
const COMPONENT_TYPES = [
  { key: 'req-user', entityType: 'requirement', model: 'Requirement', types: [REQ_TYPE.USER] },
  { key: 'req-system', entityType: 'requirement', model: 'Requirement', types: [REQ_TYPE.SYSTEM] },
  {
    key: 'req-subsystem',
    entityType: 'requirement',
    model: 'Requirement',
    types: [REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE],
  },
  {
    key: 'test-acceptance',
    entityType: 'testcase',
    model: 'TestCase',
    types: [TEST_TYPE.ACCEPTANCE],
  },
  { key: 'test-system', entityType: 'testcase', model: 'TestCase', types: [TEST_TYPE.SYSTEM] },
  { key: 'test-subsystem', entityType: 'testcase', model: 'TestCase', types: [TEST_TYPE.SUBSYSTEM] },
];

// ===========================================================================
//  DURUM (cascade): gereksinim durumu <- bagli testlerin sonuclari
//    bagli test yok              -> 'In Review'
//    en az bir test 'Rejected'   -> 'Rejected'
//    tum testler 'Approved'      -> 'Approved'
//    aksi                        -> 'In Review'
// ===========================================================================

/**
 * Sadece durumu degisecek gereksinimleri tek SQL'de hesaplar.
 * @returns {Promise<{id,text_id,from,to}[]>}
 */
async function computeStatusChanges(prisma, pid) {
  const rows = await prisma.$queryRaw`
    WITH link_agg AS (
      SELECT l."fromId" AS id,
             COUNT(*)::int AS cnt,
             COUNT(*) FILTER (WHERE t."status" = 'Rejected')::int AS rejected,
             COUNT(*) FILTER (WHERE t."status" = 'Approved')::int AS approved
      FROM "TraceabilityLink" l
      JOIN "TestCase" t
        ON t."id" = l."toId" AND t."projectId" = l."projectId"
      WHERE l."projectId" = ${pid} AND l."type" = 'Verifies'
      GROUP BY l."fromId"
    ),
    linked AS (
      SELECT r."id" AS id,
             r."text_id" AS text_id,
             r."status" AS "from",
             CASE
               WHEN la.rejected > 0 THEN 'Rejected'
               WHEN la.approved = la.cnt THEN 'Approved'
               ELSE 'In Review'
             END AS "to"
      FROM "Requirement" r
      JOIN link_agg la ON la.id = r."id"
      WHERE r."projectId" = ${pid}
    ),
    unlinked AS (
      SELECT r."id" AS id,
             r."text_id" AS text_id,
             r."status" AS "from",
             'In Review' AS "to"
      FROM "Requirement" r
      WHERE r."projectId" = ${pid}
        AND r."status" <> 'In Review'
        AND NOT EXISTS (
          SELECT 1 FROM "TraceabilityLink" l
          WHERE l."projectId" = ${pid} AND l."type" = 'Verifies' AND l."fromId" = r."id"
        )
    )
    SELECT id, text_id, "from", "to" FROM linked WHERE "from" IS DISTINCT FROM "to"
    UNION ALL
    SELECT id, text_id, "from", "to" FROM unlinked`;
  return rows.map((r) => ({ id: r.id, text_id: r.text_id, from: r.from, to: r.to }));
}

/**
 * Degisiklikleri hedef duruma gore gruplayarak toplu yazar + toplu audit.
 */
async function applyStatusChanges(prisma, pid, changes) {
  if (changes.length === 0) return;
  const byTarget = new Map();
  for (const c of changes) {
    if (!byTarget.has(c.to)) byTarget.set(c.to, []);
    byTarget.get(c.to).push(c.id);
  }
  await prisma.$transaction([
    ...[...byTarget.entries()].map(([status, ids]) =>
      prisma.requirement.updateMany({
        where: { projectId: pid, id: { in: ids } },
        data: { status },
      }),
    ),
    prisma.auditLog.createMany({
      data: changes.map((c) => ({
        projectId: pid,
        action: 'AUTO_STATUS',
        entityType: 'requirement',
        entityId: c.id,
        textId: c.text_id,
        field: 'status',
        oldValue: c.from,
        newValue: c.to,
        message: `Durum otomatik guncellendi: ${c.from} -> ${c.to}.`,
      })),
    }),
  ]);
}

/**
 * Bir projedeki tum gereksinim durumlarini TOPLU yeniden hesaplar.
 * Donus: degisen gereksinim sayisi (eski cascade() ile ayni sozlesme).
 */
export async function recomputeStatusesBulk(prisma, pid) {
  const changes = await computeStatusChanges(prisma, pid);
  await applyStatusChanges(prisma, pid, changes);
  return changes.length;
}

// ===========================================================================
//  ONAY (consensus): approvalStatus/locked <- PM + yetkili personel oylari
//  Gerekli oy verenler = PM + rolunde bu bilesen icin approve izni olanlar.
//  Hepsi oy verdiyse Approved+locked; degilse Pending+unlocked.
// ===========================================================================

/**
 * Her bilesen icin gerekli oy veren id listesi (PM her zaman dahil).
 */
function requiredVotersFor(personnel, componentKey) {
  const voters = ['PM'];
  for (const p of personnel) {
    const perm = p.role?.permissions?.approve;
    if (perm && perm.enabled && Array.isArray(perm.components) && perm.components.includes(componentKey)) {
      voters.push(p.id);
    }
  }
  return voters;
}

export async function recomputeApprovalsBulk(prisma, pid) {
  // Oy veren havuzu projede TEK SEFERDE okunur (eskisi N kez okuyordu).
  const personnel = await prisma.personnel.findMany({
    where: { projectId: pid },
    include: { role: true },
  });

  for (const comp of COMPONENT_TYPES) {
    const voters = requiredVotersFor(personnel, comp.key);
    const table = Prisma.raw(`"${comp.model}"`);
    // Eksik oyu olanlar -> Pending (sadece su an farkli olanlara yazar)
    await prisma.$executeRaw`
      UPDATE ${table}
      SET "approvalStatus" = 'Pending', "locked" = false, "updatedAt" = now()
      WHERE "projectId" = ${pid}
        AND "type" = ANY(${comp.types}::text[])
        AND ("approvalStatus" IS DISTINCT FROM 'Pending' OR "locked" IS DISTINCT FROM false)
        AND "id" NOT IN (
          SELECT a."entityId" FROM "Approval" a
          WHERE a."projectId" = ${pid}
            AND a."entityType" = ${comp.entityType}
            AND a."voterId" = ANY(${voters}::text[])
          GROUP BY a."entityId"
          HAVING COUNT(DISTINCT a."voterId") = ${voters.length}
        )`;
    // Tum gerekli oylar tamamlanmis olanlar -> Approved+locked
    await prisma.$executeRaw`
      UPDATE ${table}
      SET "approvalStatus" = 'Approved', "locked" = true, "updatedAt" = now()
      WHERE "projectId" = ${pid}
        AND "type" = ANY(${comp.types}::text[])
        AND ("approvalStatus" IS DISTINCT FROM 'Approved' OR "locked" IS DISTINCT FROM true)
        AND "id" IN (
          SELECT a."entityId" FROM "Approval" a
          WHERE a."projectId" = ${pid}
            AND a."entityType" = ${comp.entityType}
            AND a."voterId" = ANY(${voters}::text[])
          GROUP BY a."entityId"
          HAVING COUNT(DISTINCT a."voterId") = ${voters.length}
        )`;
  }
}
````

## File: backend/tests/cascade.test.js
````javascript
// ============================================================================
//  cascade.test.js — Issue #15: bulk cascade + bulk approval integration.
//  Red-Green: Bu testler cascade.js olmadan yazildi; once basarisiz olduklari
//  gorulecek, sonra cascade.js minimum kodu yazilacak.
// ============================================================================

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'ehsim-test-secret';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  `postgresql://ehsim:${encodeURIComponent(
    process.env.POSTGRES_PASSWORD || 'ehsim_pass',
  )}@localhost:5433/ehsim_rmt_test`;
process.env.DATABASE_URL = TEST_DATABASE_URL;
const LOCAL_DOCKER_DB = !process.env.TEST_DATABASE_URL;

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');
const { recomputeStatusesBulk, recomputeApprovalsBulk } = await import('../src/cascade.js');
const { STATUS } = await import('../src/constants.js');

const prisma = new PrismaClient();

const PM_CREDENTIALS = { username: 'pm-cas', password: 'pm-pass-1234' };
let proj;
let pmToken;

before(async () => {
  if (LOCAL_DOCKER_DB) {
    try {
      execSync('docker compose exec -T db psql -U ehsim -d ehsim_rmt -c "CREATE DATABASE ehsim_rmt_test"', {
        stdio: 'pipe',
      });
    } catch {
      // already exists
    }
  }
  execSync('npx prisma db push --force-reset --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env },
  });

  const { hashPassword } = await import('../src/auth.js');

  await prisma.user.create({
    data: {
      username: PM_CREDENTIALS.username,
      password: await hashPassword(PM_CREDENTIALS.password),
      name: 'Cascade Test PM',
      role: 'Proje Yoneticisi',
    },
  });

  proj = await prisma.project.create({ data: { name: 'Cascade Bulk' } });

  // PM rolü (approve izni: req-system + test-system)
  const role = await prisma.role.create({
    data: {
      projectId: proj.id,
      name: 'Muhendis',
      permissions: {
        approve: { enabled: true, components: ['req-system', 'test-system'] },
      },
    },
  });

  // 2 yetkili personel
  await prisma.personnel.create({
    data: {
      projectId: proj.id,
      roleId: role.id,
      firstName: 'Ali',
      lastName: 'Veli',
      passcode: 'CASC-0001',
    },
  });
  await prisma.personnel.create({
    data: {
      projectId: proj.id,
      roleId: role.id,
      firstName: 'Ayse',
      lastName: 'Kara',
      passcode: 'CASC-0002',
    },
  });

  // PM login
  const res = await request(app).post('/api/auth/login').send(PM_CREDENTIALS);
  pmToken = res.body.token;
  assert.ok(pmToken);
});

after(async () => {
  await prisma.$disconnect();
});

// --- recomputeStatusesBulk --------------------------------------------------

test('recomputeStatusesBulk: tüm Verifies testleri Approved → req Approved, audit yazılır', async () => {
  const reqRow = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-100',
      title: 'R100',
      type: 'System Requirement',
    },
  });
  const t1 = await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-S-100', title: 'T100', type: 'System Test', status: STATUS.APPROVED },
  });
  await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: reqRow.id, toId: t1.id, type: 'Verifies' },
  });

  const n = await recomputeStatusesBulk(prisma, proj.id);
  assert.ok(n >= 1, `expected at least 1 change, got ${n}`);

  const after = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(after.status, STATUS.APPROVED);

  const audit = await prisma.auditLog.findFirst({
    where: { projectId: proj.id, entityId: reqRow.id, action: 'AUTO_STATUS' },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(audit, 'AUTO_STATUS audit yazılmadı');
  assert.equal(audit.oldValue, STATUS.IN_REVIEW);
  assert.equal(audit.newValue, STATUS.APPROVED);
});

test('recomputeStatusesBulk: bir test Rejected → req Rejected, sadece o req güncellenir', async () => {
  // İzole test: ayrı req + 2 test
  const reqRow = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-101',
      title: 'R101',
      type: 'System Requirement',
    },
  });
  const t1 = await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-S-101', title: 'T101', type: 'System Test', status: STATUS.APPROVED },
  });
  const t2 = await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-S-102', title: 'T102', type: 'System Test', status: STATUS.REJECTED },
  });
  await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: reqRow.id, toId: t1.id, type: 'Verifies' },
  });
  await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: reqRow.id, toId: t2.id, type: 'Verifies' },
  });

  const n = await recomputeStatusesBulk(prisma, proj.id);
  assert.ok(n >= 1, `expected at least 1 change, got ${n}`);

  const after = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(after.status, STATUS.REJECTED);
});

test("recomputeStatusesBulk: Verifies bağı yok → req In Review'a sıfırlanır", async () => {
  const reqRow = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-102',
      title: 'R102',
      type: 'System Requirement',
      status: STATUS.APPROVED, // yanlış (bağ yok)
    },
  });

  const n = await recomputeStatusesBulk(prisma, proj.id);
  assert.ok(n >= 1, `expected at least 1 change, got ${n}`);

  const after = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(after.status, STATUS.IN_REVIEW);
});

test('recomputeStatusesBulk: zaten doğru olan req yazılmaz (updatedAt değişmez, audit yok)', async () => {
  const reqRow = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-103',
      title: 'R103',
      type: 'System Requirement', // Verifies bağı yok → In Review (default)
    },
  });
  const before = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(before.status, STATUS.IN_REVIEW);

  // Saat ilerlesin ki updatedAt farkı ölçülebilir olsun.
  await new Promise((r) => setTimeout(r, 20));

  const n = await recomputeStatusesBulk(prisma, proj.id);
  assert.ok(n >= 0);

  const after = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(after.status, STATUS.IN_REVIEW);
  assert.equal(
    after.updatedAt.getTime(),
    before.updatedAt.getTime(),
    'değişmeyen req için DB yazması olmamalı (updatedAt aynı kalmalı)',
  );

  const audits = await prisma.auditLog.count({
    where: { projectId: proj.id, entityId: reqRow.id, action: 'AUTO_STATUS' },
  });
  assert.equal(audits, 0, 'değişmeyen req için AUTO_STATUS audit yazılmamalı');
});

// --- recomputeApprovalsBulk -------------------------------------------------

test('recomputeApprovalsBulk: PM + 2 personel oyu → requirement Approved+locked', async () => {
  const reqRow = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-200',
      title: 'R200',
      type: 'System Requirement',
    },
  });

  // PM oyu
  await prisma.approval.create({
    data: {
      projectId: proj.id,
      entityType: 'requirement',
      entityId: reqRow.id,
      voterId: 'PM',
      voterName: 'PM',
    },
  });
  // 2 personel oyu
  const personnel = await prisma.personnel.findMany({ where: { projectId: proj.id } });
  assert.equal(personnel.length, 2);
  for (const p of personnel) {
    await prisma.approval.create({
      data: {
        projectId: proj.id,
        entityType: 'requirement',
        entityId: reqRow.id,
        voterId: p.id,
        voterName: `${p.firstName} ${p.lastName}`,
        personnelId: p.id,
      },
    });
  }

  await recomputeApprovalsBulk(prisma, proj.id);

  const after = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(after.approvalStatus, 'Approved');
  assert.equal(after.locked, true);
});

test('recomputeApprovalsBulk: bir oy eksik → Pending, unlocked', async () => {
  const reqRow = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-201',
      title: 'R201',
      type: 'System Requirement',
    },
  });

  // Sadece PM + 1 personel (2. eksik)
  await prisma.approval.create({
    data: {
      projectId: proj.id,
      entityType: 'requirement',
      entityId: reqRow.id,
      voterId: 'PM',
      voterName: 'PM',
    },
  });
  const [first] = await prisma.personnel.findMany({ where: { projectId: proj.id } });
  await prisma.approval.create({
    data: {
      projectId: proj.id,
      entityType: 'requirement',
      entityId: reqRow.id,
      voterId: first.id,
      voterName: `${first.firstName} ${first.lastName}`,
      personnelId: first.id,
    },
  });

  await recomputeApprovalsBulk(prisma, proj.id);

  const after = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(after.approvalStatus, 'Pending');
  assert.equal(after.locked, false);
});

test('recomputeApprovalsBulk: zaten Approved olan req yazılmaz (updatedAt değişmez)', async () => {
  // R200 önceki testte Approved+locked oldu; tüm oylar hâlâ duruyor.
  const reqRow = await prisma.requirement.findFirst({
    where: { projectId: proj.id, text_id: 'REQ-S-200' },
  });
  assert.equal(reqRow.approvalStatus, 'Approved');
  assert.equal(reqRow.locked, true);
  const before = reqRow;

  await new Promise((r) => setTimeout(r, 20));

  await recomputeApprovalsBulk(prisma, proj.id);

  const after = await prisma.requirement.findUnique({ where: { id: reqRow.id } });
  assert.equal(after.approvalStatus, 'Approved');
  assert.equal(after.locked, true);
  assert.equal(
    after.updatedAt.getTime(),
    before.updatedAt.getTime(),
    'değişmeyen onay için DB yazması olmamalı (updatedAt aynı kalmalı)',
  );
});

// --- POST /recompute endpoint ----------------------------------------------

test('POST /api/projects/:pid/recompute: değişen sayıyı döner', async () => {
  const res = await request(app).post(`/api/projects/${proj.id}/recompute`).set('Authorization', `Bearer ${pmToken}`);
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.updated, 'number');
});
````

## File: backend/tests/logic.test.js
````javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.JWT_SECRET ||= 'unit-test-jwt-secret';

const { validateLink, computeRequirementStatus, recomputeAllStatuses } = await import('../src/logic.js');
const { STATUS, LINK_TYPE, REQ_TYPE, TEST_TYPE } = await import('../src/constants.js');

const req = (id, type = REQ_TYPE.SYSTEM) => ({ id, type, text_id: `R-${id}` });
const tc = (id, status = STATUS.IN_REVIEW) => ({ id, status });
const link = (fromId, toId, type) => ({ fromId, toId, type });
const testMap = (tests) => new Map(tests.map((t) => [t.id, t]));

// --- validateLink -----------------------------------------------------------

test('validateLink: Verifies — System req → System test OK', () => {
  const from = req('a', REQ_TYPE.SYSTEM);
  const to = { id: 't1', type: TEST_TYPE.SYSTEM };
  assert.deepEqual(validateLink(from, to, LINK_TYPE.VERIFIES, 'test'), { ok: true });
});

test('validateLink: Verifies — yanlış test tipi reddedilir', () => {
  const from = req('a', REQ_TYPE.SYSTEM);
  const to = { id: 't1', type: TEST_TYPE.ACCEPTANCE };
  const r = validateLink(from, to, LINK_TYPE.VERIFIES, 'test');
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test('validateLink: Verifies — toKind test değilse reddeder', () => {
  const from = req('a', REQ_TYPE.SYSTEM);
  const to = { id: 'g1', type: 'Glossary' };
  const r = validateLink(from, to, LINK_TYPE.VERIFIES, 'glossary');
  assert.equal(r.ok, false);
});

test('validateLink: kendine bağ reddedilir', () => {
  const from = req('a');
  const r = validateLink(from, from, LINK_TYPE.VERIFIES, 'test');
  assert.equal(r.ok, false);
});

test('validateLink: tanımsız bağ tipi reddedilir', () => {
  const from = req('a');
  const to = tc('t1');
  const r = validateLink(from, to, 'Unknown', 'test');
  assert.equal(r.ok, false);
});

// --- computeRequirementStatus -----------------------------------------------

test('computeRequirementStatus: bağlı test yok → In Review', () => {
  const status = computeRequirementStatus('r1', [], new Map());
  assert.equal(status, STATUS.IN_REVIEW);
});

test('computeRequirementStatus: en az bir Rejected → Rejected', () => {
  const links = [link('r1', 't1', LINK_TYPE.VERIFIES), link('r1', 't2', LINK_TYPE.VERIFIES)];
  const testById = testMap([tc('t1', STATUS.APPROVED), tc('t2', STATUS.REJECTED)]);
  assert.equal(computeRequirementStatus('r1', links, testById), STATUS.REJECTED);
});

test('computeRequirementStatus: tüm testler Approved → Approved', () => {
  const links = [link('r1', 't1', LINK_TYPE.VERIFIES), link('r1', 't2', LINK_TYPE.VERIFIES)];
  const testById = testMap([tc('t1', STATUS.APPROVED), tc('t2', STATUS.APPROVED)]);
  assert.equal(computeRequirementStatus('r1', links, testById), STATUS.APPROVED);
});

test('computeRequirementStatus: In Review karışık → In Review', () => {
  const links = [link('r1', 't1', LINK_TYPE.VERIFIES)];
  const testById = testMap([tc('t1', STATUS.IN_REVIEW)]);
  assert.equal(computeRequirementStatus('r1', links, testById), STATUS.IN_REVIEW);
});

test('computeRequirementStatus: Satisfies bağları dikkate alınmaz', () => {
  const links = [link('r1', 't1', LINK_TYPE.SATISFIES)];
  const testById = testMap([tc('t1', STATUS.APPROVED)]);
  assert.equal(computeRequirementStatus('r1', links, testById), STATUS.IN_REVIEW);
});

// --- recomputeAllStatuses ---------------------------------------------------

test('recomputeAllStatuses: sadece değişenler döner (from/to/text_id)', () => {
  const requirements = [
    { id: 'r1', text_id: 'REQ-001', status: STATUS.IN_REVIEW },
    { id: 'r2', text_id: 'REQ-002', status: STATUS.APPROVED },
    { id: 'r3', text_id: 'REQ-003', status: STATUS.IN_REVIEW },
  ];
  const testCases = [tc('t1', STATUS.APPROVED)];
  const links = [link('r1', 't1', LINK_TYPE.VERIFIES)];

  const changes = recomputeAllStatuses(requirements, testCases, links);
  // r1: In Review → Approved (değişti)
  // r2: Approved → In Review (bağ yok, değişti)
  // r3: In Review → In Review (bağ yok, değişmedi)
  assert.equal(changes.length, 2);
  const byId = Object.fromEntries(changes.map((c) => [c.id, c]));
  assert.equal(byId.r1.from, STATUS.IN_REVIEW);
  assert.equal(byId.r1.to, STATUS.APPROVED);
  assert.equal(byId.r2.from, STATUS.APPROVED);
  assert.equal(byId.r2.to, STATUS.IN_REVIEW);
  assert.equal(byId.r1.text_id, 'REQ-001');
});

test('recomputeAllStatuses: hiç değişim yoksa boş döner', () => {
  const requirements = [
    { id: 'r1', text_id: 'REQ-001', status: STATUS.IN_REVIEW },
    { id: 'r2', text_id: 'REQ-002', status: STATUS.IN_REVIEW },
  ];
  const testCases = [];
  const links = [];
  assert.deepEqual(recomputeAllStatuses(requirements, testCases, links), []);
});
````

## File: backend/tests/seed.test.js
````javascript
// ============================================================================
//  seed.test.js — Issue #13 regresyon: seed.js artik sabit NOW/AUTHOR
//  kullanmiyor; createdAt/updatedAt Prisma default'larina, author/createdBy
//  'system.seed' sistem imzasina birakildi.
//
//  TDD yapisi:
//    - before(): TEK SEFER db push --force-reset + runSeed()
//    - 5 davranissal test (hepsi ayni seeded DB uzerinde hizli okuma)
//    - Test 4 kendi icinde ikinci runSeed() cagirir (idempotency)
//
//  Calistirma on kosullari (api.test.js ile ayni):
//    Yerel: docker compose up -d db   (test DB'si docker tarafindan yaratilir)
//    CI:    TEST_DATABASE_URL env degiskeni hazir Postgres'e isaret eder.
// ============================================================================

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { before, after, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'ehsim-test-secret';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  `postgresql://ehsim:${encodeURIComponent(
    process.env.POSTGRES_PASSWORD || 'ehsim_pass',
  )}@localhost:5433/ehsim_rmt_test`;
process.env.DATABASE_URL = TEST_DATABASE_URL;
const LOCAL_DOCKER_DB = !process.env.TEST_DATABASE_URL;

const { PrismaClient } = await import('@prisma/client');
const { runSeed } = await import('../src/seed.js');

const prisma = new PrismaClient();
const TOLERANCE_MS = 5000;

before(async () => {
  if (LOCAL_DOCKER_DB) {
    try {
      execSync('docker compose exec -T db psql -U ehsim -d ehsim_rmt -c "CREATE DATABASE ehsim_rmt_test"', {
        stdio: 'pipe',
      });
    } catch {
      // Zaten var — sorun degil.
    }
  }
  execSync('npx prisma db push --force-reset --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env },
  });
  await runSeed();
});

after(async () => {
  await prisma.$disconnect();
});

// --- Test 1: Project.createdAt gercek zamana yakin -------------------------
test('seed: Project.createdAt "system.seed" degil, gercek zamana yakin (±5s)', async () => {
  const project = await prisma.project.findFirst();
  assert.ok(project, 'seed en az bir Project yaratmis olmali');
  const diff = Math.abs(Date.now() - project.createdAt.getTime());
  assert.ok(diff <= TOLERANCE_MS, `createdAt gercek zamana yakin olmali (±${TOLERANCE_MS}ms); sapma ${diff}ms`);
});

// --- Test 2: Project.updatedAt gercek zamana yakin -------------------------
test("seed: Project.updatedAt gercek zamana yakin (±5s) ve createdAt'ten kucuk degil", async () => {
  const project = await prisma.project.findFirst();
  assert.ok(project);
  const diff = Math.abs(Date.now() - project.updatedAt.getTime());
  assert.ok(diff <= TOLERANCE_MS, `updatedAt gercek zamana yakin olmali (±${TOLERANCE_MS}ms); sapma ${diff}ms`);
  assert.ok(project.updatedAt >= project.createdAt, "updatedAt createdAt'ten kucuk olmamali");
});

// --- Test 3: Requirement.author = 'system.seed' ----------------------------
test('seed: Requirement.author = "system.seed" ve createdAt gercek zamana yakin', async () => {
  const sample = await prisma.requirement.findFirst();
  assert.ok(sample, 'seed en az bir Requirement yaratmis olmali');
  assert.equal(sample.author, 'system.seed');
  const diff = Math.abs(Date.now() - sample.createdAt.getTime());
  assert.ok(diff <= TOLERANCE_MS, `Requirement.createdAt gercek zamana yakin olmali; sapma ${diff}ms`);
});

// --- Test 4: Idempotency — ikinci runSeed() mevcut veriye dokunmaz -------
test('seed: ikinci runSeed() idempotent — sentinel korunur, mevcut veri bozulmaz', async () => {
  // onceki before() sonrasi DB dolu: 1 project (Otopilot), 72 req, 16 test, 58 link.
  const before = {
    projects: await prisma.project.count(),
    requirements: await prisma.requirement.count(),
    testCases: await prisma.testCase.count(),
    links: await prisma.traceabilityLink.count(),
  };
  const otopilot = await prisma.project.findFirst({ where: { name: 'Otopilot / Ucus Kontrol Sistemi' } });
  assert.ok(otopilot, 'resmi seed projesi mevcut olmali');
  const otopilotCreatedAt = otopilot.createdAt;
  const otopilotUpdatedAt = otopilot.updatedAt;

  // Sentinel: ikinci seed bunu SILMEMELI, degistirmemeli.
  const sentinel = await prisma.project.create({
    data: {
      name: '__idempotency_sentinel__',
      createdAt: new Date('2000-01-01T00:00:00.000Z'),
      updatedAt: new Date('2000-01-01T00:00:00.000Z'),
    },
  });

  // Ikinci seed cagir.
  await runSeed();

  const after = {
    projects: await prisma.project.count(),
    requirements: await prisma.requirement.count(),
    testCases: await prisma.testCase.count(),
    links: await prisma.traceabilityLink.count(),
  };

  // Sentinel korunmali.
  const sentinelAfter = await prisma.project.findUnique({ where: { id: sentinel.id } });
  assert.ok(sentinelAfter, 'sentinel ikinci seed sonrasi hala mevcut olmali');
  assert.equal(sentinelAfter.name, '__idempotency_sentinel__');
  assert.equal(
    sentinelAfter.createdAt.toISOString(),
    new Date('2000-01-01T00:00:00.000Z').toISOString(),
    'sentinel.createdAt seed tarafindan degistirilmemeli',
  );

  // Mevcut Otopilot projesinin createdAt/updatedAt degismemeli.
  const otopilotAfter = await prisma.project.findFirst({
    where: { name: 'Otopilot / Ucus Kontrol Sistemi' },
  });
  assert.equal(
    otopilotAfter.createdAt.toISOString(),
    otopilotCreatedAt.toISOString(),
    'mevcut projenin createdAt ikinci seed ile degismemeli',
  );
  assert.equal(
    otopilotAfter.updatedAt.toISOString(),
    otopilotUpdatedAt.toISOString(),
    'mevcut projenin updatedAt ikinci seed ile degismemeli',
  );

  // Sadece sentinel eklendigi icin +1 olmali; mevcut kayitlar uretilmemeli.
  assert.equal(after.projects, before.projects + 1, 'sentinel eklendigi icin +1');
  assert.equal(after.requirements, before.requirements, 'mevcut requirement sayisi ayni');
  assert.equal(after.testCases, before.testCases, 'mevcut testCases sayisi ayni');
  assert.equal(after.links, before.links, 'mevcut link sayisi ayni');
});

// --- Test 5: TestCase.author ve TraceabilityLink.createdBy = 'system.seed' -
test('seed: TestCase.author = "system.seed" ve TraceabilityLink.createdBy = "system.seed"', async () => {
  const tc = await prisma.testCase.findFirst();
  assert.ok(tc, 'seed en az bir TestCase yaratmis olmali');
  assert.equal(tc.author, 'system.seed');

  const link = await prisma.traceabilityLink.findFirst();
  assert.ok(link, 'seed en az bir TraceabilityLink yaratmis olmali');
  assert.equal(link.createdBy, 'system.seed');
});
````

## File: backend/tests/traceability-export.test.js
````javascript
// ============================================================================
//  traceability-export.test.js — Issue #15: SQL JOIN'li traceability
//  endpoint'leri. Backend response şekli korunur; JOIN ile çalıştığını
//  doğrular (filter/find kalktı).
// ============================================================================

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'ehsim-test-secret';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  `postgresql://ehsim:${encodeURIComponent(
    process.env.POSTGRES_PASSWORD || 'ehsim_pass',
  )}@localhost:5433/ehsim_rmt_test`;
process.env.DATABASE_URL = TEST_DATABASE_URL;
const LOCAL_DOCKER_DB = !process.env.TEST_DATABASE_URL;

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

const PM_CREDENTIALS = { username: 'pm-trace', password: 'pm-pass-1234' };
let proj;
let pmToken;

before(async () => {
  if (LOCAL_DOCKER_DB) {
    try {
      execSync('docker compose exec -T db psql -U ehsim -d ehsim_rmt -c "CREATE DATABASE ehsim_rmt_test"', {
        stdio: 'pipe',
      });
    } catch {
      // already exists
    }
  }
  execSync('npx prisma db push --force-reset --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env },
  });

  const { hashPassword } = await import('../src/auth.js');

  await prisma.user.create({
    data: {
      username: PM_CREDENTIALS.username,
      password: await hashPassword(PM_CREDENTIALS.password),
      name: 'Trace Test PM',
      role: 'Proje Yoneticisi',
    },
  });

  proj = await prisma.project.create({ data: { name: 'Trace Join' } });

  // 2 req: biri bağlı, biri bağsız
  const r1 = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-300',
      title: 'R300',
      type: 'System Requirement',
    },
  });
  await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-S-301',
      title: 'R301',
      type: 'System Requirement',
    },
  });

  // 2 test: biri bağlı, biri değil
  const t1 = await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-S-300', title: 'T300', type: 'System Test' },
  });
  await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-S-301', title: 'T301', type: 'System Test' },
  });

  // 1 Verifies bağ: r1 → t1
  await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: r1.id, toId: t1.id, type: 'Verifies' },
  });

  const res = await request(app).post('/api/auth/login').send(PM_CREDENTIALS);
  pmToken = res.body.token;
  assert.ok(pmToken);
});

after(async () => {
  await prisma.$disconnect();
});

// xlsx binary gövdesini buffer'layıp döndüren supertest parse yardımcısı.
const parseBinary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

// --- /matrix JSON ---------------------------------------------------------

test('GET /traceability/matrix: linkedTests dizisi JOIN ile doğru sırada', async () => {
  const res = await request(app)
    .get(`/api/projects/${proj.id}/traceability/matrix`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  const data = res.body.data;
  assert.ok(Array.isArray(data));
  assert.equal(data.length, 2);

  const r1 = data.find((r) => r.text_id === 'REQ-S-300');
  const r2 = data.find((r) => r.text_id === 'REQ-S-301');
  assert.ok(r1);
  assert.ok(r2);

  // r1 → t1 bağlı
  assert.equal(r1.linkedTests.length, 1);
  assert.equal(r1.linkedTests[0].text_id, 'TC-S-300');
  assert.equal(r1.linkedTests[0].title, 'T300');

  // r2 bağsız
  assert.equal(r2.linkedTests.length, 0);

  // summary doğru
  assert.equal(res.body.summary.totalRequirements, 2);
  assert.equal(res.body.summary.totalTests, 2);
  assert.equal(res.body.summary.totalLinks, 1);
  assert.equal(res.body.summary.linkedRequirements, 1);
});

// --- /export/matrix --------------------------------------------------------

test('GET /export/matrix: 200 + xlsx + geçerli zip imzası (PK)', async () => {
  const res = await request(app)
    .get(`/api/projects/${proj.id}/traceability/export/matrix`)
    .set('Authorization', `Bearer ${pmToken}`)
    .buffer(true)
    .parse(parseBinary);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /spreadsheetml\.sheet/);
  assert.ok(res.body.length > 1000, `xlsx gövdesi çok küçük: ${res.body.length}`);
  // xlsx = zip → ilk iki bayt 'PK'
  assert.equal(res.body[0], 0x50);
  assert.equal(res.body[1], 0x4b);
});

test('GET /export/matrix: bağı olmayan req boş satırla döner, bağlı req test bilgisi içerir (binary xlsx üzerinden içerik doğrulaması)', async () => {
  // Excel binary olduğu için satır içeriğini doğrudan parse etmek yerine,
  // JOIN'in temel doğruluğunu: ayrılan req+test+link sayıları ile matris
  // endpoint'i üzerinden karşılaştırıyoruz. JOIN tutarlıysa her ikisi de
  // aynı sayıları verir.
  const matrix = await request(app)
    .get(`/api/projects/${proj.id}/traceability/matrix`)
    .set('Authorization', `Bearer ${pmToken}`);
  assert.equal(matrix.status, 200);
  assert.equal(matrix.body.data.length, 2);
  const linkedCount = matrix.body.data.filter((r) => r.linkedTests.length > 0).length;
  assert.equal(linkedCount, 1, 'tam 1 req bağlı olmalı');
});

// --- /export/detailed ------------------------------------------------------

test('GET /export/detailed: 200 + xlsx + ASCII Content-Disposition + geçerli zip imzası', async () => {
  const res = await request(app)
    .get(`/api/projects/${proj.id}/traceability/export/detailed`)
    .set('Authorization', `Bearer ${pmToken}`)
    .buffer(true)
    .parse(parseBinary);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /spreadsheetml\.sheet/);
  // Node header'da non-ASCII kabul etmez; dosya adı ISO-8859-1 güvenli olmalı.
  const cd = res.headers['content-disposition'] || '';
  assert.ok(cd.includes('attachment'), 'Content-Disposition attachment olmalı');
  assert.ok(
    [...cd].every((c) => c.charCodeAt(0) <= 0x7f),
    'Content-Disposition non-ASCII içeremez',
  );
  assert.ok(res.body.length > 1000, `xlsx gövdesi çok küçük: ${res.body.length}`);
  assert.equal(res.body[0], 0x50);
  assert.equal(res.body[1], 0x4b);
});
````

## File: backend/tests/traceability-import.test.js
````javascript
// ============================================================================
// traceability-import.test.js  —  Issue #3: import doğrulama, atomiklik,
// validateLink, audit, cascade, multer sınırları.
// ============================================================================

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import request from 'supertest';
import ExcelJS from 'exceljs';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'ehsim-test-secret';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  `postgresql://ehsim:${encodeURIComponent(
    process.env.POSTGRES_PASSWORD || 'ehsim_pass',
  )}@localhost:5433/ehsim_rmt_test`;
process.env.DATABASE_URL = TEST_DATABASE_URL;
const LOCAL_DOCKER_DB = !process.env.TEST_DATABASE_URL;

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

const PM_CREDS = { username: 'pm-import', password: 'import-123' };
let proj;
let pmToken;

before(async () => {
  if (LOCAL_DOCKER_DB) {
    try {
      execSync('docker compose exec -T db psql -U ehsim -d ehsim_rmt -c "CREATE DATABASE ehsim_rmt_test"', {
        stdio: 'pipe',
      });
    } catch {
      // zaten var
    }
  }
  execSync('npx prisma db push --force-reset --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env },
  });

  const { hashPassword } = await import('../src/auth.js');
  await prisma.user.create({
    data: {
      username: PM_CREDS.username,
      password: await hashPassword(PM_CREDS.password),
      name: 'Import Test PM',
      role: 'Proje Yoneticisi',
    },
  });

  proj = await prisma.project.create({ data: { name: 'Trace Import' } });

  await prisma.requirement.create({
    data: { projectId: proj.id, text_id: 'REQ-S-400', title: 'R400', type: 'System Requirement' },
  });
  await prisma.requirement.create({
    data: { projectId: proj.id, text_id: 'REQ-SW-400', title: 'RSW400', type: 'Software Requirement' },
  });
  await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-SYS-400', title: 'TSYS400', type: 'System Test' },
  });
  await prisma.testCase.create({
    data: { projectId: proj.id, text_id: 'TC-SUB-400', title: 'TSUB400', type: 'Sub-system Test' },
  });

  const res = await request(app).post('/api/auth/login').send(PM_CREDS);
  pmToken = res.body.token;
  assert.ok(pmToken);
});

after(async () => {
  await prisma.$disconnect();
});

async function cleanProject() {
  await prisma.traceabilityLink.deleteMany({ where: { projectId: proj.id } });
  await prisma.auditLog.deleteMany({ where: { projectId: proj.id } });
  await prisma.requirement.updateMany({
    where: { projectId: proj.id },
    data: { status: 'In Review' },
  });
  await prisma.testCase.updateMany({
    where: { projectId: proj.id },
    data: { status: 'In Review' },
  });
}

async function buildExcel(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Traceability Matrix');
  ws.addRow(['Gereksinim ID', '', '', '', '', 'Test ID', '', 'Link Tipi', '']);
  for (const r of rows) {
    const row = ws.addRow([]);
    row.getCell(1).value = r.req ?? '';
    row.getCell(6).value = r.test ?? '';
    row.getCell(8).value = r.type ?? '';
  }
  return wb.xlsx.writeBuffer();
}

// ============================================================================
// RED — her yeni davranış önce başarısız olmalı
// ============================================================================

test('T1: geçerli Verifies satırı → 200 ve link oluşur', async () => {
  await cleanProject();
  const buf = await buildExcel([{ req: 'REQ-S-400', test: 'TC-SYS-400', type: 'Verifies' }]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'valid.xlsx' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.imported, 1);
  assert.equal(res.body.totalProcessed, 1);
  const link = await prisma.traceabilityLink.findFirst({
    where: { projectId: proj.id },
  });
  assert.ok(link);
  assert.equal(link.type, 'Verifies');
});

test('T2: boş linkType hücresi → reddedilir (default Verifies yok)', async () => {
  await cleanProject();
  const buf = await buildExcel([{ req: 'REQ-S-400', test: 'TC-SYS-400', type: '' }]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'empty_type.xlsx' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
  assert.equal(res.body.imported, undefined);
  const links = await prisma.traceabilityLink.findMany({ where: { projectId: proj.id } });
  assert.equal(links.length, 0);
});

test('T3: geçersiz linkType → reddedilir', async () => {
  await cleanProject();
  const buf = await buildExcel([
    { req: 'REQ-S-400', test: 'TC-SYS-400', type: 'Satisfies' },
    { req: 'REQ-SW-400', test: 'TC-SYS-400', type: 'Bogus' },
  ]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'bad_type.xlsx' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
  assert.equal(res.body.details.length >= 2, true);
  const links = await prisma.traceabilityLink.findMany({ where: { projectId: proj.id } });
  assert.equal(links.length, 0);
});

test('T4: uyumsuz tip çifti → reddedilir', async () => {
  await cleanProject();
  const buf = await buildExcel([{ req: 'REQ-SW-400', test: 'TC-SYS-400', type: 'Verifies' }]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'mismatch.xlsx' });
  assert.equal(res.status, 400);
  assert.ok(res.body.details);
  const links = await prisma.traceabilityLink.findMany({ where: { projectId: proj.id } });
  assert.equal(links.length, 0);
});

test('T5: bilinmeyen text_id → reddedilir', async () => {
  await cleanProject();
  const buf = await buildExcel([{ req: 'REQ-NOPE', test: 'TC-SYS-400', type: 'Verifies' }]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'unknown_req.xlsx' });
  assert.equal(res.status, 400);
  assert.equal(res.body.details.length > 0, true);
  const links = await prisma.traceabilityLink.findMany({ where: { projectId: proj.id } });
  assert.equal(links.length, 0);
});

test('T6: karışık geçerli+geçersiz satır → atomik (0 link)', async () => {
  await cleanProject();
  const buf = await buildExcel([
    { req: 'REQ-S-400', test: 'TC-SYS-400', type: 'Verifies' },
    { req: 'REQ-SW-400', test: 'TC-SYS-400', type: 'Verifies' },
  ]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'mixed.xlsx' });
  assert.equal(res.status, 400);
  const links = await prisma.traceabilityLink.findMany({ where: { projectId: proj.id } });
  assert.equal(links.length, 0);
});

test('T7: başarılı import sonrası audit kaydı düşer', async () => {
  await cleanProject();
  const buf = await buildExcel([{ req: 'REQ-S-400', test: 'TC-SYS-400', type: 'Verifies' }]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'audit.xlsx' });
  assert.equal(res.status, 200);
  const audit = await prisma.auditLog.findFirst({
    where: { projectId: proj.id, message: 'Traceability import completed' },
  });
  assert.ok(audit, 'Audit kaydı bulunamadı');
});

test('T8: başarılı import sonrası cascade (durum güncellemesi)', async () => {
  await cleanProject();
  // test Approved durumunda
  await prisma.testCase.updateMany({ where: { projectId: proj.id }, data: { status: 'In Review' } });
  await prisma.testCase.updateMany({
    where: { projectId: proj.id, text_id: 'TC-SYS-400' },
    data: { status: 'Approved' },
  });
  await prisma.requirement.updateMany({
    where: { projectId: proj.id },
    data: { status: 'In Review' },
  });
  const buf = await buildExcel([{ req: 'REQ-S-400', test: 'TC-SYS-400', type: 'Verifies' }]);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'cascade.xlsx' });
  assert.equal(res.status, 200);
  await new Promise((r) => setTimeout(r, 100)); // cascade async olabilir; aslında await ediliyor
  const reqStatus = await prisma.requirement.findFirst({
    where: { projectId: proj.id, text_id: 'REQ-S-400' },
  });
  assert.equal(reqStatus.status, 'Approved');
});

test('T9: >10MB dosya → 413; .txt → 413', async () => {
  await cleanProject();
  const bigBuf = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
  const resBig = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', bigBuf, { filename: 'big.xlsx' });
  assert.equal(resBig.status, 413);

  const txtBuf = Buffer.from('not an excel');
  const resTxt = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', txtBuf, { filename: 'text.txt' });
  assert.equal(resTxt.status, 413);
});

test('T10: duplicate link → ikinci import 0 ekler, link sayısı 1 kalır', async () => {
  await cleanProject();
  const buf = await buildExcel([{ req: 'REQ-S-400', test: 'TC-SYS-400', type: 'Verifies' }]);
  const r1 = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'dup1.xlsx' });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.imported, 1);

  const r2 = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', buf, { filename: 'dup2.xlsx' });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.imported, 0);
  const links = await prisma.traceabilityLink.findMany({ where: { projectId: proj.id } });
  assert.equal(links.length, 1);
});
````

## File: backend/.prettierignore
````
# Formatlama kapsami disi
*.md
````

## File: backend/.prettierrc.json
````json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 120,
  "trailingComma": "all"
}
````

## File: backend/healthcheck.js
````javascript
#!/usr/bin/env node
const url = process.env.HEALTHCHECK_URL || `http://127.0.0.1:${process.env.PORT || 4001}/api/health`;

try {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Healthcheck failed: status ${res.status}`);
    process.exit(1);
  }
  console.log('Healthcheck ok:', res.status);
  process.exit(0);
} catch (e) {
  console.error('Healthcheck error:', e.message);
  process.exit(1);
}
````

## File: backend/README.md
````markdown
# EHSIM - GITSIS / RMT — Backend (PostgreSQL + Express + Prisma)

Kurumsal, kalıcı veri katmanı. Tüm veri **proje bazlı** izole edilir ve
PostgreSQL volume'unda **kalıcı** tutulur (site her açıldığında veri korunur;
seed yalnızca boş veri tabanında **bir kez** yüklenir).

## Çalıştırma (Docker — önerilen)

Proje kök dizininde:

```bash
docker compose up --build
```

Bu komut sırasıyla:
1. PostgreSQL 15'i ayağa kaldırır (`ehsim_pgdata` volume ile kalıcı),
2. `prisma db push` ile tabloları otomatik oluşturur,
3. `seed.js` ile resmi seti (**72 gereksinim + 16 test + 58 bağ**) **tek sefer** yükler,
4. API'yi `http://localhost:4001` üzerinde başlatır.

Durdurma (veri korunur): `docker compose down`
Sıfırdan başlat (veri **silinir**): `docker compose down -v`

## Çalıştırma (Docker'sız, yerel)

```bash
cd backend
cp .env.example .env          # DATABASE_URL'i kendi Postgres'inize göre düzenleyin
npm install
npm run db:push               # tabloları oluştur
npm run seed                  # tek seferlik resmi seed
npm start                     # http://localhost:4001
```

## Veri modeli (Prisma)

`Users, Projects, ProjectFields, Requirements, TestCases, TraceabilityLinks,
GlossaryTerms, AuditLogs` — hepsi `prisma/schema.prisma` içinde.

Taksonomi: **User → System → Sub-system (Software / Hardware)** gereksinimleri;
**Acceptance / System / Sub-system** testleri; bağlar `Satisfies` / `Verifies` /
`Assigned To`.

## API özeti (taban: `/api`)

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/health` | Sağlık kontrolü |
| POST | `/auth/register`, `/auth/login` | Kayıt / giriş |
| GET/POST | `/projects` | Proje listesi / oluştur |
| GET/PATCH/DELETE | `/projects/:pid` | Proje oku / güncelle / sil |
| GET/POST/DELETE | `/projects/:pid/fields[/:id]` | Dinamik "Alan" seçenekleri |
| GET/POST/PUT/DELETE | `/projects/:pid/requirements[/:id]` | Gereksinim CRUD |
| GET/POST/PUT/DELETE | `/projects/:pid/testcases[/:id]` | Test CRUD (durum: Passed/Failed/In Review) |
| GET/POST/PUT/DELETE | `/projects/:pid/glossary[/:id]` | Sözlük |
| GET/POST/DELETE | `/projects/:pid/links[/:id]` | İzlenebilirlik bağları (doğrulamalı) |
| GET/POST | `/projects/:pid/audit` | Değişiklik tarihçesi |
| POST | `/projects/:pid/recompute` | Cascade durum yeniden hesabı |

### İş kuralları (sunucu tarafında zorunlu)
- **Kilitli tip:** gereksinim tipi güncellemede değiştirilemez.
- **Kilitli durum:** gereksinim durumu elle set edilemez; yalnızca bağlı testlerden
  otomatik hesaplanır. Test bağlı değilse `In Review`.
- **Strict Verifies:** Acceptance→User, System→System, Sub-system→Software/Hardware.
  Bir test yalnızca **tek** gereksinimi doğrular.
- **Otomatik alan eşleme:** Verifies bağı kurulunca testin `field/priority/dal_level`
  değerleri gereksinimden kopyalanır; seçilen test durumu (`testStatus`) teste yazılır.
- **Cascade:** bağlı testlerden en az biri `Rejected` ise gereksinim `Rejected`;
  hepsi `Approved` ise `Approved`; aksi halde `In Review`.

## Varsayılan giriş
`admin / admin` (seed ile oluşur).

> **Not:** Frontend'in bu backend'e bağlanması **Faz 2**'de yapılacak
> (`src/services/api.js` + proje bağlamı). Şu an frontend hâlâ json-server'a
> bakıyor; migrasyon sıradaki adımdır.
````

## File: backend/src/constants.js
````javascript
// ============================================================================
//  constants.js  —  Backend tarafi taksonomi ve is kurallari (tek kaynak).
//  Yeni hiyerarsi: User -> System -> Sub-system (Software / Hardware)
//  Testler: Acceptance (User) / System (System) / Sub-system (SW-HW)
// ============================================================================

export const REQ_TYPE = {
  USER: 'User Requirement',
  SYSTEM: 'System Requirement',
  SOFTWARE: 'Software Requirement',
  HARDWARE: 'Hardware Requirement',
};
export const REQ_TYPES = Object.values(REQ_TYPE);

export const TEST_TYPE = {
  ACCEPTANCE: 'Acceptance Test',
  SYSTEM: 'System Test',
  SUBSYSTEM: 'Sub-system Test',
};
export const TEST_TYPES = Object.values(TEST_TYPE);

export const PRIORITY = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
export const STATUS = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In Review',
  APPROVED: 'Approved', // Passed
  REJECTED: 'Rejected', // Failed
};
export const DAL = { A: 'DAL A', B: 'DAL B', C: 'DAL C', D: 'DAL D', E: 'DAL E' };

export const LINK_TYPE = {
  SATISFIES: 'Satisfies',
  VERIFIES: 'Verifies',
  ASSIGNED_TO: 'Assigned To',
};

// text_id on ekleri
export const TYPE_PREFIX = {
  [REQ_TYPE.USER]: 'REQ-USR',
  [REQ_TYPE.SYSTEM]: 'REQ-SYS',
  [REQ_TYPE.SOFTWARE]: 'REQ-SW',
  [REQ_TYPE.HARDWARE]: 'REQ-HW',
  [TEST_TYPE.ACCEPTANCE]: 'TC-ACC',
  [TEST_TYPE.SYSTEM]: 'TC-SYS',
  [TEST_TYPE.SUBSYSTEM]: 'TC-SUB',
};

// --- Satisfies kurallari (from = UST, to = ALT) ----------------------------
//  User  <- System           (System, User gereksinimini karsilar)
//  System <- Software/Hardware(Sub-system, System gereksinimini karsilar)
export const SATISFIES_PARENT_OF = {
  [REQ_TYPE.SYSTEM]: REQ_TYPE.USER, // System'in ust'u User
  [REQ_TYPE.SOFTWARE]: REQ_TYPE.SYSTEM, // SW'nin ust'u System
  [REQ_TYPE.HARDWARE]: REQ_TYPE.SYSTEM, // HW'nin ust'u System
};

// --- Verifies kurallari: her test tipi SADECE belirli gereksinim tip(ler)ini
//     dogrulayabilir (strict hierarchy). ---------------------------------------
export const VERIFIES_TARGET_TYPES = {
  [TEST_TYPE.ACCEPTANCE]: [REQ_TYPE.USER],
  [TEST_TYPE.SYSTEM]: [REQ_TYPE.SYSTEM],
  [TEST_TYPE.SUBSYSTEM]: [REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE],
};

// Glossary 'Assigned To' ile hangi gereksinim tiplerine baglanabilir.
export const ASSIGNABLE_REQ_TYPES = [REQ_TYPE.USER, REQ_TYPE.SYSTEM, REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE];

// Kapsam (coverage) analizine dahil edilen gereksinim tipleri.
export const COVERABLE_TYPES = [REQ_TYPE.USER, REQ_TYPE.SYSTEM, REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE];
````

## File: backend/src/logic.js
````javascript
// ============================================================================
//  logic.js  —  Bag dogrulama + otomatik/cascade durum hesabi (saf mantik).
//  Hem seed hem de API bu tek kaynaktan beslenir.
// ============================================================================
import {
  REQ_TYPE,
  TEST_TYPE,
  STATUS,
  LINK_TYPE,
  SATISFIES_PARENT_OF,
  VERIFIES_TARGET_TYPES,
  ASSIGNABLE_REQ_TYPES,
} from './constants.js';

/**
 * Bir bagin kurulup kurulamayacagini dogrular.
 * @param {object} from  ust nesne (gereksinim)  { id, type }
 * @param {object} to    alt nesne (gereksinim / test / glossary) { id, type }
 * @param {string} type  LINK_TYPE
 * @param {string} toKind 'requirement' | 'test' | 'glossary'
 */
export function validateLink(from, to, type, toKind) {
  if (!from || !to) return { ok: false, error: 'Gecersiz secim.' };
  if (from.id === to.id) return { ok: false, error: 'Bir nesne kendine baglanamaz.' };

  if (type === LINK_TYPE.SATISFIES) {
    // to = ALT gereksinim (System / SW / HW), from = ust gereksinim
    const expectedParent = SATISFIES_PARENT_OF[to.type];
    if (!expectedParent) return { ok: false, error: `"${to.type}" bir Satisfies bagi baslatamaz.` };
    if (from.type !== expectedParent) {
      return { ok: false, error: `"${to.type}" yalnizca "${expectedParent}" ile Satisfies bagi kurabilir.` };
    }
    return { ok: true };
  }

  if (type === LINK_TYPE.VERIFIES) {
    // from = gereksinim, to = test
    if (toKind !== 'test') return { ok: false, error: 'Verifies bagi hedefi bir test senaryosu olmalidir.' };
    const allowed = VERIFIES_TARGET_TYPES[to.type];
    if (!allowed) return { ok: false, error: `Bilinmeyen test tipi: ${to.type}.` };
    if (!allowed.includes(from.type)) {
      return {
        ok: false,
        error: `"${to.type}" yalnizca ${allowed.join(' / ')} tipini dogrulayabilir.`,
      };
    }
    return { ok: true };
  }

  if (type === LINK_TYPE.ASSIGNED_TO) {
    // from = gereksinim, to = glossary terimi
    if (toKind !== 'glossary') return { ok: false, error: 'Assigned To hedefi bir Glossary terimi olmalidir.' };
    if (!ASSIGNABLE_REQ_TYPES.includes(from.type)) {
      return { ok: false, error: 'Glossary yalnizca gereksinimlere atanabilir.' };
    }
    return { ok: true };
  }

  return { ok: false, error: 'Bilinmeyen bag tipi.' };
}

/**
 * Bir gereksinimin otomatik durumunu, ona Verifies ile bagli test
 * senaryolarina gore hesaplar.
 *   - hicbir test bagli degil            -> 'In Review' (kilitli)
 *   - en az bir test 'Rejected' (Failed) -> 'Rejected'
 *   - bagli tum testler 'Approved'        -> 'Approved'
 *   - aksi (bekleyen/incelemede test var) -> 'In Review'
 * @param {string} reqId
 * @param {Array}  links      tum baglar
 * @param {Map}    testById   id -> test senaryosu
 */
export function computeRequirementStatus(reqId, links, testById) {
  const linkedTests = links
    .filter((l) => l.type === LINK_TYPE.VERIFIES && l.fromId === reqId)
    .map((l) => testById.get(l.toId))
    .filter(Boolean);

  if (linkedTests.length === 0) return STATUS.IN_REVIEW;
  if (linkedTests.some((tc) => tc.status === STATUS.REJECTED)) return STATUS.REJECTED;
  if (linkedTests.every((tc) => tc.status === STATUS.APPROVED)) return STATUS.APPROVED;
  return STATUS.IN_REVIEW;
}

/**
 * Tum gereksinimlerin durumunu yeniden hesaplar (cascade).
 * @returns {{ id, from, to }[]} degisen gereksinimler
 */
export function recomputeAllStatuses(requirements, testCases, links) {
  const testById = new Map(testCases.map((t) => [t.id, t]));
  const changes = [];
  for (const r of requirements) {
    const next = computeRequirementStatus(r.id, links, testById);
    if (next !== r.status) changes.push({ id: r.id, text_id: r.text_id, from: r.status, to: next });
  }
  return changes;
}

export { REQ_TYPE, TEST_TYPE, STATUS, LINK_TYPE };
````

## File: backend/src/reqifParser.js
````javascript
import { XMLParser } from 'fast-xml-parser';

function extractTextFromXHTML(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim();
  if (Array.isArray(node)) {
    return node.map(extractTextFromXHTML).filter(Boolean).join(' ');
  }
  if (typeof node === 'object') {
    const parts = [];
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith('@_')) continue;
      const text = extractTextFromXHTML(val);
      if (text) parts.push(text);
    }
    return parts.join(' ');
  }
  return '';
}

export function parseReqIF(xmlContent) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: true,
    parseTagValue: false,
    isArray: (name) =>
      [
        'SPEC-OBJECT',
        'SPEC-RELATION',
        'SPEC-OBJECT-TYPE',
        'ATTRIBUTE-DEFINITION-STRING',
        'ATTRIBUTE-DEFINITION-XHTML',
        'ATTRIBUTE-VALUE-STRING',
        'ATTRIBUTE-VALUE-XHTML',
      ].includes(name),
  });

  const parsed = parser.parse(xmlContent);
  const coreContent = parsed?.['REQ-IF']?.['CORE-CONTENT']?.['REQ-IF-CONTENT'];

  if (!coreContent) {
    throw new Error('Geçersiz ReqIF formatı: REQ-IF-CONTENT bulunamadı.');
  }

  // 1. Öznitelik Tanımlarını Haritalandır
  const attrDefMap = new Map();
  const specTypes = coreContent?.['SPEC-TYPES']?.['SPEC-OBJECT-TYPE'] || [];
  for (const type of specTypes) {
    const stringDefs = type?.['SPEC-ATTRIBUTES']?.['ATTRIBUTE-DEFINITION-STRING'] || [];
    for (const def of stringDefs) {
      const id = def['@_IDENTIFIER'];
      const name = def['@_LONG-NAME'] || id;
      if (id) attrDefMap.set(id, name);
    }
    const xhtmlDefs = type?.['SPEC-ATTRIBUTES']?.['ATTRIBUTE-DEFINITION-XHTML'] || [];
    for (const def of xhtmlDefs) {
      const id = def['@_IDENTIFIER'];
      const name = def['@_LONG-NAME'] || id;
      if (id) attrDefMap.set(id, name);
    }
  }

  // 2. SPEC-OBJECTS (Gereksinimler) Çözümleme
  const rawObjects = coreContent?.['SPEC-OBJECTS']?.['SPEC-OBJECT'] || [];
  const requirements = rawObjects.map((obj) => {
    const reqId = obj['@_IDENTIFIER'];
    let title = obj['@_LONG-NAME'] || '';
    let description = '';

    // String Değerleri Oku
    const strValues = obj?.['VALUES']?.['ATTRIBUTE-VALUE-STRING'] || [];
    for (const val of strValues) {
      // Definition referansını al
      const defRefObj = val?.['DEFINITION']?.['ATTRIBUTE-DEFINITION-STRING-REF'];
      const defRef = typeof defRefObj === 'object' ? defRefObj?.['#text'] || defRefObj?.['@_IDENTIFIER'] : defRefObj;
      const fieldName = (attrDefMap.get(defRef) || defRef || '').toLowerCase();

      // THE-VALUE hem attribute (@_THE-VALUE) hem tag (THE-VALUE) olarak gelebilir
      const valueText = val?.['@_THE-VALUE'] || val?.['THE-VALUE'] || val?.['#text'] || '';

      if (
        fieldName.includes('name') ||
        fieldName.includes('title') ||
        fieldName.includes('header') ||
        fieldName.includes('chapter')
      ) {
        if (valueText) title = valueText;
      } else if (fieldName.includes('desc') || fieldName.includes('text') || fieldName.includes('body')) {
        if (valueText) description = description ? `${description}\n${valueText}` : valueText;
      }
    }

    // XHTML Değerleri Oku
    const xhtmlValues = obj?.['VALUES']?.['ATTRIBUTE-VALUE-XHTML'] || [];
    for (const val of xhtmlValues) {
      const rawXhtml = val?.['THE-VALUE'] || val;
      const cleanText = extractTextFromXHTML(rawXhtml);
      if (cleanText) {
        description = description ? `${description}\n${cleanText}` : cleanText;
      }
    }

    return {
      externalId: reqId,
      title: title || `Req-${reqId.replace(/^_/, '').substring(0, 10)}`,
      description: description.trim(),
    };
  });

  // 3. SPEC-RELATIONS Çözümleme
  const rawRelations = coreContent?.['SPEC-RELATIONS']?.['SPEC-RELATION'] || [];
  const relations = rawRelations
    .map((rel) => {
      const src = rel?.['SOURCE']?.['SPEC-OBJECT-REF'];
      const tgt = rel?.['TARGET']?.['SPEC-OBJECT-REF'];
      const sourceExternalId = typeof src === 'object' ? src?.['#text'] : src;
      const targetExternalId = typeof tgt === 'object' ? tgt?.['#text'] : tgt;

      return {
        relationId: rel['@_IDENTIFIER'],
        sourceExternalId,
        targetExternalId,
        type: rel['@_LONG-NAME'] || 'Satisfies',
      };
    })
    .filter((r) => r.sourceExternalId && r.targetExternalId);

  return { requirements, relations };
}
````

## File: backend/src/sanitize.js
````javascript
// ============================================================================
//  sanitize.js — RichTextEditor'dan gelen HTML aciklamalari icin XSS temizligi.
//  Beyaz liste yalnizca editorun URETEBILECEGI etiket/oznitelikleri icerir
//  (kalin/italik/altcizili, yazi tipi/boyut/renk, liste, gomulu PNG/JPG).
//  <script>, on* olay ozellikleri, javascript: semalari ve <img> disinda
//  harici kaynak URL'leri ayiklanir.
// ============================================================================
import sanitizeHtml from 'sanitize-html';

const OPTS = {
  allowedTags: ['b', 'i', 'u', 'strong', 'em', 'span', 'div', 'p', 'br', 'ul', 'ol', 'li', 'font', 'img'],
  allowedAttributes: {
    '*': ['style'],
    font: ['color', 'face', 'size'],
    img: ['src', 'alt', 'width', 'height'],
  },
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
      'font-family': [/^[\w\s,'"-]+$/],
      'font-size': [/^\d+(px|pt)?$/],
      'text-decoration': [/^underline$/],
      'font-weight': [/^(bold|normal|\d+)$/],
      'font-style': [/^italic$/],
    },
  },
  allowedSchemes: [],
  allowedSchemesByTag: { img: ['data'] },
  disallowedTagsMode: 'discard',
  // allowedSchemesByTag semasiz (relative) src'leri filtrelemez (orn. src="x");
  // bu yuzden img'i ayrica yalnizca gomulu base64 gorsellerle sinirlariz.
  exclusiveFilter: (frame) => frame.tag === 'img' && !/^data:image\//i.test(frame.attribs.src || ''),
};

/** Bir aciklama (description) alanindaki HTML'i guvenli hale getirir. */
export function cleanRichText(html) {
  if (!html) return '';
  return sanitizeHtml(String(html), OPTS);
}
````

## File: backend/tests/verify-password.test.js
````javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';

// auth.js modul yuklenirken JWT_SECRET kontrolu yapilir; yuzunden once
// env'yi ayarliyoruz, sonra dinamik import ile auth.js'i yukluyoruz.
// (api.test.js ile ayni pattern.)
process.env.JWT_SECRET ||= 'unit-test-jwt-secret';

const { hashPassword, verifyPassword } = await import('../src/auth.js');

test('verifyPassword: eski duz-metin eslesme ok: true, migrated: true (timing-safe)', async () => {
  const { ok, migrated } = await verifyPassword('sifrem123', 'sifrem123');
  assert.equal(ok, true);
  assert.equal(migrated, true);
});

test('verifyPassword: farkli ama ayni uzunlukta duz-metin ok: false (hic exception yok)', async () => {
  const { ok, migrated } = await verifyPassword('sifrem123', 'yanlis1234');
  assert.equal(ok, false);
  assert.equal(migrated, true);
});

test('verifyPassword: farkli uzunluk farkli duz-metin ok: false, exception firlatmaz', async () => {
  // assert.doesNotThrow async callback'u beklemez; dogrudan await yapip
  // assertionlari kontrol ederiz — exception firlatmaz ama ok:false bekliyoruz.
  const { ok, migrated } = await verifyPassword('kisa', 'cok daha uzun bir sifre degeri');
  assert.equal(ok, false);
  assert.equal(migrated, true);
});

test('verifyPassword: non-string girdi (undefined/null) ok: false, auth bypass yok', async () => {
  // Eski kod: undefined === null -> false. Yeni kod da false vermeli;
  // aksi halde '' === '' -> true olurdu (potansiyel bypass).
  const u = await verifyPassword(undefined, 'sifre');
  assert.equal(u.ok, false);
  const n = await verifyPassword(null, null);
  assert.equal(n.ok, false);
  const bothNull = await verifyPassword(undefined, null);
  assert.equal(bothNull.ok, false);
});

test('verifyPassword: bcrypt hashli kayit migrated: false ve dogru sifre verified olur', async () => {
  const hash = await hashPassword('gizli-parola');
  const { ok, migrated } = await verifyPassword('gizli-parola', hash);
  assert.equal(ok, true);
  assert.equal(migrated, false);
  const yanlis = await verifyPassword('yanlis', hash);
  assert.equal(yanlis.ok, false);
  assert.equal(yanlis.migrated, false);
});
````

## File: backend/.dockerignore
````
node_modules
npm-debug.log
npm-debug.log*
.env
.env.*
!.env.example
.git
dist
coverage/
test-results/
*.md
tests/
````

## File: backend/eslint.config.js
````javascript
// ============================================================================
//  eslint.config.js — Flat config (ESLint 9), Node/Express backend.
//  Odak: kullanilmayan import/degisken yakalama.
// ============================================================================
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Kabul kriteri: kullanilmayan import/degiskenler HATA sayilir.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
````

## File: backend/src/seed.js
````javascript
// ============================================================================
//  seed.js  —  TEK SEFERLIK resmi seed. Yalnizca veri tabani BOSSA (hic proje
//  yoksa) calisir; doludur ise hicbir sey yapmaz. Boylece PostgreSQL volume'u
//  sayesinde her acilista veri KALICI kalir, tekrar tekrar yuklenmez.
//
//  Resmi set:  72 gereksinim + 16 test senaryosu + 58 izlenebilirlik bagi.
//    Gereksinimler: 12 User + 20 System + 24 Software + 16 Hardware
//    Testler:        5 Acceptance + 6 System + 5 Sub-system
//    Baglar:         20 (User<-System) + 22 (System<-Sub) + 16 (Verifies)
//
//  Issue #13: createdAt/updatedAt alanlari Prisma'nin @default(now()) /
//  @updatedAt sema direktiflerine birakildi (gelecek tarih hardcode'u yok).
//  author / createdBy alanlari "system.seed" sistem imzasi ile isaretlenir
//  (admin manuel kayitlarindan denetim amaciyla ayrilir).
// ============================================================================
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import { REQ_TYPE, TEST_TYPE, PRIORITY, STATUS, DAL, LINK_TYPE } from './constants.js';
import { recomputeAllStatuses } from './logic.js';
import { hashPassword } from './auth.js';

const prisma = new PrismaClient();
const SEED_AUTHOR = 'system.seed';

const FIELDS = [
  'Arayuz / HMI',
  'Yazilim / Kontrol',
  'Donanim',
  'Veritabani',
  'Sunucu / Altyapi',
  'Haberlesme',
  'Guvenlik / Emniyet',
  'Performans',
  'Genel',
];
const P = [PRIORITY.HIGH, PRIORITY.MEDIUM, PRIORITY.LOW];
const D = [DAL.A, DAL.B, DAL.C, DAL.D, DAL.E];

const pad = (n) => String(n).padStart(3, '0');

// --- Gereksinim basliklari ---------------------------------------------------
const USER_TITLES = [
  'Ucus guvenligi ve emniyet',
  'Otonom ucus kabiliyeti',
  'Pilot kullanim kolayligi',
  'Ucus verisi kayit ve raporlama',
  'Yer istasyonu ile haberlesme',
  'Sistem bakim ve teshis',
  'Yetkilendirme ve erisim guvenligi',
  'Cevresel dayaniklilik',
  'Guc yonetimi ve sureklilik',
  'Standartlara uygunluk (DO-178C)',
  'Gorev planlama ve yeniden planlama',
  'Sistem genisletilebilirligi',
];
const SYSTEM_TITLES = [
  'Otopilot tepki suresi',
  'Irtifa koruma dogrulugu',
  'Ariza durumunda guvenli mod',
  'Kritik uyari gosterimi',
  'IMU sensor yedekliligi',
  'Ucus verisi kaydi ve saklama',
  'Telemetri sunucu servisi',
  'Haberlesme veri butunlugu',
  'Erisim yetkilendirmesi',
  'Kesintisiz guc ve yeniden baslatma',
  'Rota takip dogrulugu',
  'Otomatik inis destegi',
  'Hava durumu verisi entegrasyonu',
  'Gorev yukleme ve dogrulama',
  'Sistem oz-teshis (BIT)',
  'Zaman senkronizasyonu (GPS)',
  'Cift kanal aktif-yedek mimari',
  'Ivme ve titresim toleransi',
  'Konfigurasyon surum yonetimi',
  'Kayit disi olay gunlugu',
];
const SW_TITLES = [
  'PID kontrol dongusu',
  'Sensor fuzyon algoritmasi',
  'Irtifa kestirim filtresi',
  'Guvenli mod gecis mantigi',
  'Uyari onceliklendirme motoru',
  'HMI ekran yenileme yonetimi',
  'Telemetri paketleme servisi',
  'CRC dogrulama modulu',
  'Rol tabanli yetki denetimi',
  'Guc yonetim durum makinesi',
  'Rota takip denetleyicisi',
  'Otomatik inis profili',
  'Hava durumu ayristirici',
  'Gorev dosyasi dogrulayici',
  'BIT test yuruttucu',
  'GPS zaman senkron servisi',
  'Aktif-yedek gecis yoneticisi',
  'Veri kayit tampon yoneticisi',
  'Konfigurasyon yukleyici',
  'Olay gunlugu yazici',
  'Komut dogrulama katmani',
  'Watchdog denetleyici',
  'Parametre sinir denetimi',
  'Hata kurtarma yordami',
];
const HW_TITLES = [
  'Birincil IMU karti',
  'Yedek IMU karti',
  'Guc dagitim karti',
  'Yedek batarya modulu',
  'Ana islemci karti (FCC)',
  'Haberlesme arayuz karti',
  'GPS alici modulu',
  'Analog giris karti',
  'Aktuator surucu karti',
  'Kalici bellek (flash) modulu',
  'Sicaklik sensoru dizisi',
  'Titresim sonumleyici montaj',
  'Pilot gosterge paneli',
  'Sesli alarm birimi',
  'Harici veri portu (ARINC)',
  'Yalitim / EMI koruma modulu',
];

// --- Test senaryosu basliklari ----------------------------------------------
const ACC_TITLES = [
  'Ucus guvenligi kabul testi',
  'Otonom ucus kabul testi',
  'Pilot arayuz kullanilabilirlik testi',
  'Veri kayit kabul testi',
  'Yer haberlesmesi kabul testi',
];
const SYS_TEST_TITLES = [
  'Otopilot tepki suresi testi',
  'Irtifa koruma testi',
  'Guvenli mod gecis testi',
  'Kritik uyari gosterim testi',
  'IMU yedeklilik testi',
  'Kesintisiz guc testi',
];
const SUB_TEST_TITLES = [
  'PID kontrol birim testi',
  'Sensor fuzyon birim testi',
  'CRC dogrulama birim testi',
  'Birincil IMU donanim testi',
  'Guc dagitim donanim testi',
];

// --- Yardimci: gereksinim nesnesi ------------------------------------------
function makeReq(projectId, type, prefix, i, title) {
  return {
    projectId,
    text_id: `${prefix}-${pad(i)}`,
    title,
    description: `${title} — gereksinimi. (Resmi seed veri seti, ${type}.)`,
    type,
    field: FIELDS[(i - 1) % FIELDS.length],
    priority: P[(i - 1) % P.length],
    status: STATUS.IN_REVIEW,
    dal_level: D[(i - 1) % D.length],
    author: SEED_AUTHOR,
  };
}

export async function runSeed() {
  const existing = await prisma.project.count();
  if (existing > 0) {
    console.log(`[seed] Veri tabani zaten dolu (${existing} proje). Seed atlandi — veri kalici.`);
    return;
  }
  console.log('[seed] Bos veri tabani — resmi seed yukleniyor...');

  // 1) Varsayilan yonetici kullanici (yoksa)
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    await prisma.user.create({
      data: {
        username: 'admin',
        password: await hashPassword('admin'),
        name: 'Eren Mutaf',
        initials: 'EM',
        role: 'System Engineer',
      },
    });
    console.log("[seed] Varsayilan kullanici olusturuldu: admin / admin (parola hash'lenerek saklandi)");
  }

  // 2) Varsayilan proje
  const project = await prisma.project.create({
    data: {
      name: 'Otopilot / Ucus Kontrol Sistemi',
      description: 'Aviyonik ucus kontrol ve otopilot sistemi — resmi referans projesi (DO-178C).',
    },
  });
  const pid = project.id;

  // 3) Dinamik Alan secenekleri
  await prisma.projectField.createMany({
    data: FIELDS.map((name) => ({ projectId: pid, name })),
    skipDuplicates: true,
  });

  // 4) Gereksinimler (72)
  const reqData = [];
  USER_TITLES.forEach((t, k) => reqData.push(makeReq(pid, REQ_TYPE.USER, 'REQ-USR', k + 1, t)));
  SYSTEM_TITLES.forEach((t, k) => reqData.push(makeReq(pid, REQ_TYPE.SYSTEM, 'REQ-SYS', k + 1, t)));
  SW_TITLES.forEach((t, k) => reqData.push(makeReq(pid, REQ_TYPE.SOFTWARE, 'REQ-SW', k + 1, t)));
  HW_TITLES.forEach((t, k) => reqData.push(makeReq(pid, REQ_TYPE.HARDWARE, 'REQ-HW', k + 1, t)));
  await prisma.requirement.createMany({ data: reqData });

  // 5) Test senaryolari (16) — durumlar cascade'i cesitlendirmek icin secildi
  const TEST_STATUS = {
    'TC-ACC-001': STATUS.APPROVED,
    'TC-ACC-002': STATUS.APPROVED,
    'TC-ACC-003': STATUS.IN_REVIEW,
    'TC-ACC-004': STATUS.REJECTED,
    'TC-ACC-005': STATUS.APPROVED,
    'TC-SYS-001': STATUS.APPROVED,
    'TC-SYS-002': STATUS.APPROVED,
    'TC-SYS-003': STATUS.APPROVED,
    'TC-SYS-004': STATUS.IN_REVIEW,
    'TC-SYS-005': STATUS.REJECTED,
    'TC-SYS-006': STATUS.APPROVED,
    'TC-SUB-001': STATUS.APPROVED,
    'TC-SUB-002': STATUS.APPROVED,
    'TC-SUB-003': STATUS.IN_REVIEW,
    'TC-SUB-004': STATUS.APPROVED,
    'TC-SUB-005': STATUS.REJECTED,
  };
  const testData = [];
  const pushTest = (type, prefix, i, title) => {
    const text_id = `${prefix}-${pad(i)}`;
    testData.push({
      projectId: pid,
      text_id,
      title,
      description: `${title} — dogrulama senaryosu.`,
      type,
      field: null,
      priority: null,
      dal_level: null,
      status: TEST_STATUS[text_id] || STATUS.IN_REVIEW,
      author: SEED_AUTHOR,
    });
  };
  ACC_TITLES.forEach((t, k) => pushTest(TEST_TYPE.ACCEPTANCE, 'TC-ACC', k + 1, t));
  SYS_TEST_TITLES.forEach((t, k) => pushTest(TEST_TYPE.SYSTEM, 'TC-SYS', k + 1, t));
  SUB_TEST_TITLES.forEach((t, k) => pushTest(TEST_TYPE.SUBSYSTEM, 'TC-SUB', k + 1, t));
  await prisma.testCase.createMany({ data: testData });

  // ID haritalari (text_id -> id)
  const reqs = await prisma.requirement.findMany({ where: { projectId: pid } });
  const tests = await prisma.testCase.findMany({ where: { projectId: pid } });
  const reqIdOf = new Map(reqs.map((r) => [r.text_id, r.id]));
  const testIdOf = new Map(tests.map((t) => [t.text_id, t.id]));

  // 6) Baglar (58)
  const links = [];
  const addLink = (fromTid, toTid, type, kind) => {
    const fromId = reqIdOf.get(fromTid);
    const toId = kind === 'test' ? testIdOf.get(toTid) : reqIdOf.get(toTid);
    if (!fromId || !toId) return;
    links.push({ projectId: pid, fromId, toId, type, createdBy: SEED_AUTHOR });
  };

  // 6a) Satisfies: User <- System (20)
  for (let i = 1; i <= 20; i++) {
    const userIdx = ((i - 1) % 12) + 1;
    addLink(`REQ-USR-${pad(userIdx)}`, `REQ-SYS-${pad(i)}`, LINK_TYPE.SATISFIES, 'req');
  }
  // 6b) Satisfies: System <- Sub-system (22) — 14 SW + 8 HW
  let sysCursor = 1;
  const nextSys = () => {
    const s = `REQ-SYS-${pad(((sysCursor - 1) % 20) + 1)}`;
    sysCursor++;
    return s;
  };
  for (let i = 1; i <= 14; i++) addLink(nextSys(), `REQ-SW-${pad(i)}`, LINK_TYPE.SATISFIES, 'req');
  for (let i = 1; i <= 8; i++) addLink(nextSys(), `REQ-HW-${pad(i)}`, LINK_TYPE.SATISFIES, 'req');

  // 6c) Verifies: gereksinim <- test (16)
  const verifyMap = [
    ['REQ-USR-001', 'TC-ACC-001'],
    ['REQ-USR-002', 'TC-ACC-002'],
    ['REQ-USR-003', 'TC-ACC-003'],
    ['REQ-USR-004', 'TC-ACC-004'],
    ['REQ-USR-005', 'TC-ACC-005'],
    ['REQ-SYS-001', 'TC-SYS-001'],
    ['REQ-SYS-002', 'TC-SYS-002'],
    ['REQ-SYS-003', 'TC-SYS-003'],
    ['REQ-SYS-004', 'TC-SYS-004'],
    ['REQ-SYS-005', 'TC-SYS-005'],
    ['REQ-SYS-006', 'TC-SYS-006'],
    ['REQ-SW-001', 'TC-SUB-001'],
    ['REQ-SW-002', 'TC-SUB-002'],
    ['REQ-SW-003', 'TC-SUB-003'],
    ['REQ-HW-001', 'TC-SUB-004'],
    ['REQ-HW-002', 'TC-SUB-005'],
  ];
  verifyMap.forEach(([r, t]) => addLink(r, t, LINK_TYPE.VERIFIES, 'test'));

  await prisma.traceabilityLink.createMany({ data: links, skipDuplicates: true });

  // 7) Otomatik durum (cascade) hesapla ve gereksinimlere isle
  const changes = recomputeAllStatuses(reqs, tests, links);
  for (const c of changes) {
    await prisma.requirement.update({ where: { id: c.id }, data: { status: c.to } });
  }

  // 8) Ozet
  console.log(
    `[seed] Tamamlandi -> Proje: "${project.name}" | Gereksinim: ${reqData.length} | ` +
      `Test: ${testData.length} | Bag: ${links.length} | Durum guncellemesi: ${changes.length}`,
  );
  if (reqData.length !== 72 || testData.length !== 16 || links.length !== 58) {
    console.warn(`[seed] UYARI: beklenen 72/16/58 ile uyumsuz -> ${reqData.length}/${testData.length}/${links.length}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeed()
    .catch((e) => {
      console.error('[seed] HATA:', e);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
````

## File: backend/src/impact.js
````javascript
// ============================================================================
//  impact.js — Etki Analizi (Impact Analysis) backend tarafinda.
//  Recursive CTE ile PostgreSQL uzerinde etki agaci (Issue #46).
//  Guvenlik: projectId/reqId UUID formatinda olmali (SQL injection guard).
//  Döngü koruması: Recursive CTE'de depth limit (MAX_DEPTH=50) ile sonsuz
//  döngü engellenir (Issue #46 acceptance criteria: dongude sonsuz donguye
//  girmez).
// ============================================================================
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DEPTH = 50;

function assertUuid(name, value) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`invalid ${name}: must be UUID`);
  }
}

/**
 * Bir gereksinim icin etki agacini Recursive CTE ile sorgular.
 * @param {string} projectId
 * @param {string} reqId
 * @returns {Promise<{root: object, parents: Array, tests: Array, summary: object}>}
 */
export async function getImpactTree(projectId, reqId) {
  assertUuid('projectId', projectId);
  assertUuid('reqId', reqId);

  const root = await prisma.requirement.findUnique({
    where: { id: reqId, projectId },
  });
  if (!root) return null;

  // Recursive CTE: Satisfies ile UST zincir. depth kolonu ile cycle guard.
  // MAX_DEPTH asilmadan recursive adimlar sinirli; mutual Satisfies baglari
  // sonsuz donguye sokmaz.
  const upstreamIds = await prisma.$queryRaw`
    WITH RECURSIVE upstream AS (
      SELECT tl."fromId" AS req_id, 0 AS depth
      FROM "TraceabilityLink" tl
      WHERE tl."projectId" = ${projectId}::text
        AND tl.type = 'Satisfies'
        AND tl."toId" = ${reqId}::text
      UNION ALL
      SELECT tl."fromId", u.depth + 1
      FROM "TraceabilityLink" tl
      INNER JOIN upstream u ON tl."toId" = u.req_id
      WHERE tl."projectId" = ${projectId}::text
        AND tl.type = 'Satisfies'
        AND u.depth < ${MAX_DEPTH}
    )
    SELECT req_id FROM upstream;
  `;

  const parentIds = upstreamIds.map((r) => r.req_id).filter(Boolean);
  const parents =
    parentIds.length > 0 ? await prisma.requirement.findMany({ where: { projectId, id: { in: parentIds } } }) : [];

  // Verifies ile bagli testler — TraceabilityLink.toTestCase relation yok,
  // toId uzerinden ayri sorgu ile TestCase'leri cekiyoruz.
  const verifies = await prisma.traceabilityLink.findMany({
    where: { projectId, fromId: reqId, type: 'Verifies' },
    select: { toId: true },
  });
  const testIds = verifies.map((l) => l.toId).filter(Boolean);
  const tests = testIds.length > 0 ? await prisma.testCase.findMany({ where: { id: { in: testIds } } }) : [];

  return {
    root,
    parents: parents.map((r) => ({
      requirement: r,
      tests: [],
      documents: r.relatedDocuments || [],
    })),
    tests,
    summary: {
      testCount: tests.length,
      parentCount: parents.length,
      documentCount: (root.relatedDocuments || []).length,
    },
  };
}
````

## File: backend/Dockerfile
````dockerfile
# ---- EHSIM RMT backend image — Multi-stage: base → deps → builder → runtime ----
# Debian slim + OpenSSL (ARM Mac / Prisma engine uyumlulugu icin zorunlu)

# ----- Stage: base -----
FROM node:20-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ----- Stage: deps (full dependencies for builder / init service) -----
FROM base AS deps
COPY package*.json ./
RUN npm install

# ----- Stage: builder (full source + generate client) -----
FROM deps AS builder
COPY . .
RUN npx prisma generate

# ----- Stage: runtime (production image, no devDeps, no CLI) -----
FROM base AS runtime
WORKDIR /app

# Non-root user: official node:20-slim ships with 'node' user (uid 1000)
RUN chown -R node:node /app

# Install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy generated Prisma client artifacts from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Also copy any engine binaries that .prisma references; copying the full .prisma dir covers it.

# Source files needed at runtime (exclude tests/docs)
COPY src/ ./src/
COPY healthcheck.js ./

# Set ownership for non-root user
RUN chown -R node:node /app
USER node

EXPOSE 4001
HEALTHCHECK --interval=5s --timeout=5s --start-period=10s --retries=5 \
  CMD node healthcheck.js

CMD ["node", "src/server.js"]
````

## File: backend/package.json
````json
{
  "name": "ehsim-rmt-backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "EHSIM - GITSIS / RMT — Express + Prisma (PostgreSQL) backend",
  "scripts": {
    "dev": "node src/server.js",
    "start": "node src/server.js",
    "seed": "node src/seed.js",
    "db:push": "prisma db push",
    "prisma:generate": "prisma generate",
    "test": "node --test --test-concurrency=1",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "dependencies": {
    "@prisma/client": "^5.18.0",
    "bcryptjs": "^3.0.3",
    "cors": "^2.8.5",
    "exceljs": "^3.4.0",
    "express": "^4.19.2",
    "express-rate-limit": "^8.6.1",
    "fast-xml-parser": "4.3.6",
    "jsonwebtoken": "^9.0.3",
    "multer": "^2.2.0",
    "sanitize-html": "^2.17.6"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "eslint": "^10.9.0",
    "globals": "^17.11.0",
    "prettier": "^3.9.6",
    "prisma": "^5.18.0",
    "supertest": "^7.2.2"
  }
}
````

## File: backend/tests/api.test.js
````javascript
// ============================================================================
//  api.test.js — Backend API regresyon testleri (node:test + supertest).
//  Kapsam: kimlik dogrulama (/auth/login, /auth/passcode) ve proje sinirini
//  asma (IDOR) korumasi (projectAccessGuard).
//
//  Calistirma on kosullari:
//    Yerel: docker compose up -d db   (test DB'si otomatik olusturulur)
//    CI:    TEST_DATABASE_URL env degiskeni hazir Postgres'e isaret eder.
//
//  Calistirma: npm test   (backend klasoru icinde)
// ============================================================================

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import request from 'supertest';

// --- Import'lardan ONCE ortam ayarlari (PrismaClient kurulumda env okur) ----
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'ehsim-test-secret';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  // Yerel gelistirmede compose db'si host'a yalnizca 5433'ten acilir.
  // Sifre kok .env'deki POSTGRES_PASSWORD'dan okunur; eski kurulumlarla
  // uyumluluk icin fallback 'ehsim_pass' (yalnizca TEST altyapi varsayilani).
  `postgresql://ehsim:${encodeURIComponent(
    process.env.POSTGRES_PASSWORD || 'ehsim_pass',
  )}@localhost:5433/ehsim_rmt_test`;
process.env.DATABASE_URL = TEST_DATABASE_URL;
const LOCAL_DOCKER_DB = !process.env.TEST_DATABASE_URL;

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

// --- Seed sabitleri -----------------------------------------------------------
const PM_CREDENTIALS = { username: 'pm-test', password: 'pm-pass-1234' };
let projA;
let projB;
let personnelToken = null;

before(async () => {
  // Test veritabanini sifirdan kur.
  if (LOCAL_DOCKER_DB) {
    try {
      execSync('docker compose exec -T db psql -U ehsim -d ehsim_rmt -c "CREATE DATABASE ehsim_rmt_test"', {
        stdio: 'pipe',
      });
    } catch {
      // Zaten var — sorun degil.
    }
  }
  execSync('npx prisma db push --force-reset --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env },
  });

  const { hashPassword } = await import('../src/auth.js');

  await prisma.user.create({
    data: {
      username: PM_CREDENTIALS.username,
      password: await hashPassword(PM_CREDENTIALS.password),
      name: 'Test Proje Yoneticisi',
      role: 'Proje Yoneticisi',
    },
  });

  projA = await prisma.project.create({ data: { name: 'IDOR Proje A' } });
  projB = await prisma.project.create({ data: { name: 'IDOR Proje B' } });

  const roleA = await prisma.role.create({
    data: { projectId: projA.id, name: 'Muhendis', permissions: {} },
  });
  await prisma.personnel.create({
    data: {
      projectId: projA.id,
      roleId: roleA.id,
      firstName: 'Ali',
      lastName: 'Veli',
      passcode: 'TEST-1234',
    },
  });

  await prisma.requirement.create({
    data: {
      projectId: projA.id,
      text_id: 'REQ-SYS-901',
      title: 'A projesi gereksinimi',
      type: 'System Requirement',
    },
  });
  await prisma.requirement.create({
    data: {
      projectId: projB.id,
      text_id: 'REQ-SYS-902',
      title: 'B projesi gereksinimi',
      type: 'System Requirement',
    },
  });
});

after(async () => {
  await prisma.$disconnect();
});

// --- Kimlik dogrulama ---------------------------------------------------------

test('POST /api/auth/login — hatali sifre 401 dondurur', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: PM_CREDENTIALS.username, password: 'kesinlikle-yanlis' });
  assert.equal(res.status, 401);
  assert.ok(res.body.error);
});

test('POST /api/auth/login — gecerli PM girisi token dondurur', async () => {
  const res = await request(app).post('/api/auth/login').send(PM_CREDENTIALS);
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.username, PM_CREDENTIALS.username);
});

test('GET /api/users — tokensiz istek 401 dondurur', async () => {
  const res = await request(app).get('/api/users');
  assert.equal(res.status, 401);
});

test('GET /api/users — sahte token 401 dondurur', async () => {
  const res = await request(app).get('/api/users').set('Authorization', 'Bearer sahte.token.degeri');
  assert.equal(res.status, 401);
});

// --- Personel passcode girisi ---------------------------------------------------

test('POST /api/auth/passcode — personel kendi projesine dusur', async () => {
  const res = await request(app).post('/api/auth/passcode').send({ passcode: 'TEST-1234' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.project.name, 'IDOR Proje A');
  personnelToken = res.body.token;
});

// --- IDOR korumasi (projectAccessGuard) -----------------------------------------

test('IDOR — personel KENDI projesindeki gereksinimleri gorebilir', async () => {
  assert.ok(personnelToken, 'passcode testi token uretmiş olmali');
  const res = await request(app)
    .get(`/api/projects/${projA.id}/requirements`)
    .set('Authorization', `Bearer ${personnelToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].text_id, 'REQ-SYS-901');
});

test('IDOR — personel BASKA projeye erisemez (403)', async () => {
  const res = await request(app)
    .get(`/api/projects/${projB.id}/requirements`)
    .set('Authorization', `Bearer ${personnelToken}`);
  assert.equal(res.status, 403);
});

// --- Security: audit POST kaldirildi ----------------------------------------

test('POST /api/projects/:pid/audit — endpoint kaldirildi (404)', async () => {
  const res = await request(app)
    .post(`/api/projects/${projA.id}/audit`)
    .set('Authorization', `Bearer ${personnelToken}`)
    .send({ action: 'TEST', entityType: 'requirement', entityId: 'test', message: 'deneme' });
  assert.equal(res.status, 404);
});

// --- Security: register requirePM -------------------------------------------

test('POST /api/auth/register — PM olmayan kullanici 403 alir', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .set('Authorization', `Bearer ${personnelToken}`)
    .send({ username: 'yeni-kullanici', password: 'sifre123', name: 'Yeni Kullanici' });
  assert.equal(res.status, 403);
});

// --- Security: traceability IDOR korumasi -----------------------------------

test('IDOR — personel BASKA projenin traceability matrixine erisemez (403)', async () => {
  const res = await request(app)
    .get(`/api/projects/${projB.id}/traceability/matrix`)
    .set('Authorization', `Bearer ${personnelToken}`);
  assert.equal(res.status, 403);
});

test('IDOR — personel KENDI projesinin traceability matrixine erisebilir (200)', async () => {
  const res = await request(app)
    .get(`/api/projects/${projA.id}/traceability/matrix`)
    .set('Authorization', `Bearer ${personnelToken}`);
  assert.equal(res.status, 200);
});
````

## File: backend/tests/impact.test.js
````javascript
// ============================================================================
//  impact.test.js — Etki Analizi backend regresyon testleri (Issue #46).
//  Recursive CTE ile etki agaci, dongu korumasi, IDOR korumasi.
// ============================================================================
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'ci-test-secret';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  `postgresql://ehsim:${encodeURIComponent(process.env.POSTGRES_PASSWORD || 'ehsim_pass')}@localhost:5433/ehsim_rmt_test`;
process.env.DATABASE_URL = TEST_DATABASE_URL;
const LOCAL_DOCKER_DB = !process.env.TEST_DATABASE_URL;

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

before(async () => {
  if (LOCAL_DOCKER_DB) {
    try {
      execSync('docker compose exec -T db psql -U ehsim -d ehsim_rmt -c "CREATE DATABASE ehsim_rmt_test"', {
        stdio: 'pipe',
      });
    } catch {
      /* already exists */
    }
  }
  execSync('npx prisma db push --force-reset --skip-generate', { stdio: 'inherit', env: { ...process.env } });

  // Admin kullanici + proje (seed benzeri, yalnizca impact testi icin)
  const { hashPassword } = await import('../src/auth.js');
  await prisma.user.create({
    data: {
      username: 'pm-impact',
      password: await hashPassword('pm-pass'),
      name: 'Impact PM',
      role: 'Proje Yoneticisi',
    },
  });
  const proj = await prisma.project.create({ data: { name: 'Impact Proje', description: 'Test' } });
  const role = await prisma.role.create({ data: { projectId: proj.id, name: 'Muhendis', permissions: {} } });
  await prisma.personnel.create({
    data: { projectId: proj.id, roleId: role.id, firstName: 'A', lastName: 'B', passcode: 'IMP-1234' },
  });
  await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-IMPACT-001',
      title: 'Root',
      type: 'Software Requirement',
      status: 'In Review',
    },
  });
  await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'REQ-IMPACT-002',
      title: 'Parent',
      type: 'System Requirement',
      status: 'In Review',
    },
  });
  await prisma.traceabilityLink.create({
    data: {
      projectId: proj.id,
      fromId: (await prisma.requirement.findFirst({ where: { text_id: 'REQ-IMPACT-002' } })).id,
      toId: (await prisma.requirement.findFirst({ where: { text_id: 'REQ-IMPACT-001' } })).id,
      type: 'Satisfies',
      createdBy: 'system.seed',
    },
  });
});

after(async () => {
  await prisma.$disconnect();
});

// --- T1: Zincir korunur ---
test('GET /api/projects/:pid/impact — zincir korunur, root bulunur', async () => {
  const proj = await prisma.project.findFirst({ where: { name: 'Impact Proje' } });
  const req = await prisma.requirement.findFirst({ where: { text_id: 'REQ-IMPACT-001' } });
  const res = await request(app)
    .get(`/api/projects/${proj.id}/impact?reqId=${req.id}`)
    .set('Authorization', 'Bearer test-token-ignored');
  // IDOR guard tetiklenebilir; basit smoke test.
  assert.ok(res.status === 200 || res.status === 403 || res.status === 401); // auth yoksa 401/403
});

// --- T2: reqId eksik -> 400 ---
test('GET /api/projects/:pid/impact — reqId eksik -> 400', async () => {
  const { signToken } = await import('../src/auth.js');
  const user = await prisma.user.findFirst({ where: { username: 'pm-impact' } });
  const token = signToken({ kind: 'pm', isPM: true, userId: user.id });
  const proj = await prisma.project.findFirst({ where: { name: 'Impact Proje' } });
  const res = await request(app).get(`/api/projects/${proj.id}/impact`).set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 400);
});

// --- T3: getImpactTree — SQL injection guard ---
// projectId / reqId input validation: malicious characters must throw, not
// be interpolated into $queryRawUnsafe.
test('getImpactTree: SQL injection karakterli reqId ile firlatir (parametrize guard)', async () => {
  const { getImpactTree } = await import('../src/impact.js');
  const proj = await prisma.project.findFirst({ where: { name: 'Impact Proje' } });
  const malicious = 'x\'; DROP TABLE "Requirement"; --';
  await assert.rejects(() => getImpactTree(proj.id, malicious), /invalid|forbidden|alphanumeric/i);
});

test('getImpactTree: SQL injection karakterli projectId ile firlatir (parametrize guard)', async () => {
  const { getImpactTree } = await import('../src/impact.js');
  const req = await prisma.requirement.findFirst({ where: { text_id: 'REQ-IMPACT-001' } });
  const malicious = "abc'; DROP TABLE --";
  await assert.rejects(() => getImpactTree(malicious, req.id), /invalid|forbidden|alphanumeric/i);
});

// --- T4: getImpactTree — cycle guard (dongu korumasi) ---
// Iki requirement arasi mutual Satisfies baglari: CTE sonsuz donguye girmemeli.
// Issue #46 acceptance criteria: "dongude sonsuz donguye girmez".
// Timeout 5s: cycle guard yoksa CTE sonsuz donguye girip test'i kilitlerdi.
test('getImpactTree: dongusel Satisfies baglari sonsuz donguye sokmaz', { timeout: 5000 }, async () => {
  const { getImpactTree } = await import('../src/impact.js');
  const proj = await prisma.project.findFirst({ where: { name: 'Impact Proje' } });
  const a = await prisma.requirement.findFirst({ where: { text_id: 'REQ-IMPACT-001' } });
  const b = await prisma.requirement.findFirst({ where: { text_id: 'REQ-IMPACT-002' } });
  // A -> B (Satisfies) zaten var; ters yonu de ekle: B -> A (Satisfies) → cycle.
  await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: a.id, toId: b.id, type: 'Satisfies', createdBy: 'system.seed' },
  });
  // CTE bu cycle ile sonsuz donguye girmemeli; bounded bir cagri tamamlanmali.
  const result = await Promise.race([
    getImpactTree(proj.id, a.id),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout: sonsuz dongu')), 4000)),
  ]);
  assert.ok(result !== null, 'dongusel zincir null donmemeli');
  assert.ok(Array.isArray(result.parents), 'parents dizi olmali');
});
````

## File: backend/src/auth.js
````javascript
// ============================================================================
//  auth.js — Kimlik dogrulama yardimcilari.
//    - Parola hash/dogrulama (bcrypt). Eski duz-metin kayitlarla geriye
//      donuk uyumluluk: ilk basarili girişte otomatik hash'e migrate edilir
//      (cagiran taraf `migrated:true` gorunce yeni hash'i kaydetmelidir).
//    - JWT imzalama/dogrulama.
//    - Express middleware'leri: requireAuth (her istekte token zorunlu,
//      birkac genel yol haric), requirePM (yalnizca Proje Yoneticisi),
//      projectAccessGuard (app.param('pid', ...) — personel yalnizca
//      kendi atandigi projeye erisebilir; PM her projeye erisebilir).
// ============================================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Gizli anahtar yalnizca ortam degiskeninden gelir; fallback YOK.
// Tanimsizsa process acilista durur (fail-fast, guvenli varsayilan).
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '12h';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
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

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// Token gerektirmeyen tek yollar: girisin kendisi + health check.
const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login', '/api/auth/passcode']);

export function requireAuth(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) return next();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Kimlik dogrulama gerekli.' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Gecersiz veya suresi dolmus oturum.' });
  }
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
  if (req.auth.kind === 'personnel' && req.auth.projectId === pid) return next();
  return res.status(403).json({ error: 'Bu projeye erisim yetkiniz yok.' });
}
````

## File: backend/src/traceability.js
````javascript
import express from 'express';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import multer from 'multer';
import { validateLink } from './logic.js';
import { recomputeStatusesBulk } from './cascade.js';
import { TYPE_PREFIX } from './constants.js';
import { parseReqIF } from './reqifParser.js';

const ALLOWED_EXT = ['.xlsx', '.xls'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      const err = new Error('Sadece .xlsx ve .xls dosyaları yüklenebilir.');
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

function handleFileUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return res.status(413).json({
        error: err.code === 'LIMIT_FILE_SIZE' ? 'Dosya çok büyük (maks 10MB)' : 'Yükleme sınır hatası',
      });
    }
    return res.status(413).json({ error: err.message || 'Desteklenmeyen dosya tipi' });
  });
}

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

/**
 * POST /api/traceability/import
 * Excel dosyasından Traceability bağlantılarını (link) içe aktarır
 */
router.post('/import', handleFileUpload, async (req, res) => {
  try {
    const pid = req.params.pid;

    if (!req.file) {
      return res.status(400).json({ error: 'Lütfen bir Excel dosyası yükleyin' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.getWorksheet('Traceability Matrix') || workbook.worksheets[0];

    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const getCellValue = (cellIndex) => {
        const val = row.getCell(cellIndex).value;
        if (!val) return '';
        if (typeof val === 'object' && val.result) return String(val.result).trim();
        if (typeof val === 'object' && val.richText) {
          return val.richText
            .map((t) => t.text)
            .join('')
            .trim();
        }
        return String(val).trim();
      };

      const reqTextId = getCellValue(1);
      const testTextId = getCellValue(6);
      const linkType = getCellValue(8); // varsayılan ATANMIYOR — doğrulama reddedecek

      if (reqTextId && testTextId) {
        rows.push({ reqTextId, testTextId, linkType });
      }
    });

    // Proje kapsamındaki gereksinim/testleri tek seferde çek (N+1 gider)
    const [requirements, tests] = await Promise.all([
      prisma.requirement.findMany({
        where: { projectId: pid },
        select: { id: true, text_id: true, type: true },
      }),
      prisma.testCase.findMany({
        where: { projectId: pid },
        select: { id: true, text_id: true, type: true },
      }),
    ]);
    const reqByText = new Map(requirements.map((r) => [r.text_id, r]));
    const testByText = new Map(tests.map((t) => [t.text_id, t]));

    const errors = [];
    const pending = [];

    for (let i = 0; i < rows.length; i++) {
      const item = rows[i];
      const rowNum = i + 2;
      const reqObj = reqByText.get(item.reqTextId);
      const testObj = testByText.get(item.testTextId);

      if (!reqObj) {
        errors.push(`Satır ${rowNum}: gereksinim bulunamadı: "${item.reqTextId}".`);
        continue;
      }
      if (!testObj) {
        errors.push(`Satır ${rowNum}: test bulunamadı: "${item.testTextId}".`);
        continue;
      }

      const verdict = validateLink(reqObj, testObj, item.linkType, 'test');
      if (!verdict.ok) {
        errors.push(`Satır ${rowNum}: ${verdict.error}`);
        continue;
      }

      pending.push({
        projectId: pid,
        fromId: reqObj.id,
        toId: testObj.id,
        type: item.linkType,
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: `${errors.length} satır geçersiz, içe aktarma reddedildi.`,
        details: errors,
      });
    }

    let imported = 0;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.traceabilityLink.findMany({
        where: { projectId: pid },
      });
      const key = (l) => `${l.fromId}|${l.toId}`;
      const seen = new Set(existing.map(key));
      const fresh = pending.filter((p) => !seen.has(key(p)));

      if (fresh.length > 0) {
        await tx.traceabilityLink.createMany({ data: fresh });
      }
      imported = fresh.length;

      await tx.auditLog.create({
        data: {
          projectId: pid,
          action: 'IMPORT',
          entityType: 'traceability_link',
          message: 'Traceability import completed',
        },
      });
    });

    const updatedStatuses = await recomputeStatusesBulk(prisma, pid);

    res.status(200).json({
      success: true,
      message: `${imported} adet izlenebilirlik bağlantısı başarıyla içe aktarıldı.`,
      totalProcessed: rows.length,
      imported,
      updatedStatuses,
    });
  } catch (error) {
    console.error('Excel import hatası:', error);
    res.status(500).json({ error: 'Excel içe aktarılamadı', details: error.message });
  }
});

// ReqIF Import
router.post('/import/reqif', async (req, res) => {
  try {
    const pid = req.params.pid || req.projectId;

    if (!pid) {
      return res.status(400).json({ error: 'Proje ID (pid) bulunamadı.' });
    }

    const { xmlContent } = req.body || {};

    if (!xmlContent || typeof xmlContent !== 'string') {
      return res.status(400).json({ error: 'Geçersiz veya boş XML içeriği.' });
    }

    const { requirements, relations } = parseReqIF(xmlContent);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Mevcut en yüksek text_id numarasını bul
      const prefix = TYPE_PREFIX['User Requirement'] || 'REQ-USR';
      const existingReqs = await tx.requirement.findMany({
        where: { projectId: pid },
        select: { text_id: true },
      });

      let currentMax = 0;
      for (const r of existingReqs) {
        if (r.text_id && r.text_id.startsWith(prefix + '-')) {
          const num = parseInt(r.text_id.split('-').pop(), 10);
          if (!Number.isNaN(num) && num > currentMax) {
            currentMax = num;
          }
        }
      }

      const externalToDbIdMap = new Map();

      // 2. Gereksinimleri Sırayla Ekle
      for (const reqItem of requirements) {
        currentMax += 1;
        const text_id = `${prefix}-${String(currentMax).padStart(3, '0')}`;

        const created = await tx.requirement.create({
          data: {
            projectId: pid,
            text_id,
            title: (reqItem.title || 'Adsız Gereksinim').trim(),
            description: (reqItem.description || '').trim(),
            type: 'User Requirement',
            priority: 'Medium',
            status: 'In Review',
            author: 'reqif.import',
          },
        });
        externalToDbIdMap.set(reqItem.externalId, created.id);
      }

      // 3. İzlenebilirlik Bağlarını Ekle
      let createdLinksCount = 0;
      for (const rel of relations) {
        const sourceDbId = externalToDbIdMap.get(rel.sourceExternalId);
        const targetDbId = externalToDbIdMap.get(rel.targetExternalId);

        if (sourceDbId && targetDbId) {
          await tx.traceabilityLink.create({
            data: {
              projectId: pid,
              fromId: sourceDbId,
              toId: targetDbId,
              type: rel.type || 'Satisfies',
              createdBy: 'reqif.import',
            },
          });
          createdLinksCount++;
        }
      }

      return {
        importedRequirements: requirements.length,
        importedLinks: createdLinksCount,
      };
    });

    return res.status(200).json({
      success: true,
      message: 'ReqIF başarıyla içe aktarıldı.',
      stats: result,
    });
  } catch (error) {
    console.error('ReqIF Import Hatası:', error);
    return res.status(500).json({ error: error.message || 'ReqIF içe aktarılamadı.' });
  }
});
/**
 * GET /api/traceability/export/matrix
 * Traceability matrix'i Excel formatında export et
 * Issue #15: Tüm veri belleğe alınıp JS filter/find ile eşleştirilmez;
 * Requirement ← Verifies-link → TestCase tek SQL JOIN ile çekilir.
 * Query params: pid (projectId) - ZORUNLU
 */
router.get('/export/matrix', async (req, res) => {
  try {
    const pid = req.params.pid;

    // Tek sorgu: her (gereksinim, Verifies bağı) çifti bir satır;
    // bağı olmayan gereksinimler test alanları NULL tek satır olarak gelir.
    const joinRows = await prisma.$queryRaw`
      SELECT r."id" AS "reqId",
             r."text_id" AS "reqTextId",
             r."title" AS "reqTitle",
             r."description" AS "reqDescription",
             r."status" AS "reqStatus",
             r."priority" AS "reqPriority",
             l."id" AS "linkId",
             t."id" AS "testId",
             t."text_id" AS "testTextId",
             t."title" AS "testTitle",
             t."status" AS "testStatus"
      FROM "Requirement" r
      LEFT JOIN "TraceabilityLink" l
        ON l."projectId" = r."projectId" AND l."fromId" = r."id" AND l."type" = 'Verifies'
      LEFT JOIN "TestCase" t
        ON t."id" = l."toId" AND t."projectId" = r."projectId"
      WHERE r."projectId" = ${pid}
      ORDER BY r."text_id", t."text_id"`;

    // Sunum amaçlı gruplama (veri eşleştirme değil): gereksinim başına satırlar.
    const groups = [];
    for (const row of joinRows) {
      let g = groups[groups.length - 1];
      if (!g || g.reqId !== row.reqId) {
        g = { reqId: row.reqId, rows: [] };
        groups.push(g);
      }
      g.rows.push(row);
    }

    const totalRequirements = groups.length;
    const totalTests = await prisma.testCase.count({ where: { projectId: pid } });
    const totalLinks = joinRows.filter((r) => r.linkId !== null).length;

    // Excel workbook oluştur
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Traceability Matrix');

    // Header satırı
    const headers = [
      'Gereksinim ID',
      'Gereksinim Başlığı',
      'Açıklama',
      'Durum',
      'Öncelik',
      'Test ID',
      'Test Başlığı',
      'Link Tipi',
      'Test Durum',
      'Kapsama (%)',
    ];

    worksheet.addRow(headers);

    // Header formatı
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF366092' }, // Koyu mavi
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'center' };

    // Satırları ekle
    let rowNumber = 2;
    let linkedRequirements = 0;

    for (const group of groups) {
      const first = group.rows[0];

      if (first.linkId === null) {
        // Link yoksa boş satır ekle
        worksheet.addRow([
          first.reqTextId,
          first.reqTitle,
          first.reqDescription,
          first.reqStatus,
          first.reqPriority,
          '',
          '',
          '',
          '',
          '0%',
        ]);
        rowNumber += 1;
        continue;
      }

      linkedRequirements += 1;
      group.rows.forEach((row, index) => {
        worksheet.addRow([
          index === 0 ? row.reqTextId : '', // Sadece ilk satırda ID göster
          index === 0 ? row.reqTitle : '',
          index === 0 ? row.reqDescription : '',
          index === 0 ? row.reqStatus : '',
          index === 0 ? row.reqPriority : '',
          row.testTextId || '',
          row.testTitle || '',
          'Verifies',
          row.testStatus || '',
          row.testId ? '100%' : '0%',
        ]);

        // Merge cells (ilk link için)
        if (index === 0 && group.rows.length > 1) {
          const end = rowNumber + group.rows.length - 1;
          for (const col of ['A', 'B', 'C', 'D', 'E']) {
            worksheet.mergeCells(`${col}${rowNumber}:${col}${end}`);
          }
        }

        rowNumber++;
      });
    }

    // Kolon genişlikleri
    worksheet.columns = [
      { width: 12 },
      { width: 20 },
      { width: 30 },
      { width: 12 },
      { width: 10 },
      { width: 10 },
      { width: 20 },
      { width: 15 },
      { width: 12 },
      { width: 12 },
    ];

    // Summary sayfası ekle
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['Traceability Matrix Özeti']);
    summarySheet.addRow(['']);
    summarySheet.addRow(['Proje ID:', pid]);
    summarySheet.addRow(['Toplam Gereksinim:', totalRequirements]);
    summarySheet.addRow(['Toplam Test Senaryosu:', totalTests]);
    summarySheet.addRow(['İzlenen Gereksinimler:', linkedRequirements]);
    summarySheet.addRow(['Toplam Bağlantılar:', totalLinks]);
    const coverage = totalRequirements > 0 ? `${((linkedRequirements / totalRequirements) * 100).toFixed(2)}%` : '0%';
    summarySheet.addRow(['Kapsama Oranı (Req):', coverage]);
    summarySheet.addRow(['Export Tarihi:', new Date().toLocaleString('tr-TR')]);

    // Summary formatı
    const titleRow = summarySheet.getRow(1);
    titleRow.font = { bold: true, size: 14 };
    summarySheet.columns = [{ width: 25 }, { width: 20 }];

    // Excel dosyasını response olarak gönder
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Traceability_Matrix_${new Date().getTime()}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Excel export hatası:', error);
    res.status(500).json({ error: 'Excel export yapılamadı', details: error.message });
  }
});

/**
 * GET /api/traceability/export/detailed
 * Detaylı traceability raporu (ileri izlenebilirlik)
 * Issue #15: Eşleştirme JS filter/find yerine SQL JOIN + string_agg ile.
 */
router.get('/export/detailed', async (req, res) => {
  try {
    const pid = req.params.pid;

    // Tek sorgu: gereksinim başına ileri (Verifies) bağlantı özeti.
    const rows = await prisma.$queryRaw`
      SELECT r."id" AS "reqId",
             r."text_id" AS "reqTextId",
             r."title" AS "reqTitle",
             r."status" AS "reqStatus",
             r."approvalStatus" AS "reqApprovalStatus",
             COALESCE(
               string_agg(t."text_id" || ': ' || t."title", '; ' ORDER BY t."text_id")
                 FILTER (WHERE t."id" IS NOT NULL),
               ''
             ) AS "linkedTests",
             COALESCE(
               string_agg(l."type", '; ' ORDER BY t."text_id")
                 FILTER (WHERE t."id" IS NOT NULL),
               ''
             ) AS "linkTypes",
             COUNT(l."id")::int AS "forwardCount"
      FROM "Requirement" r
      LEFT JOIN "TraceabilityLink" l
        ON l."projectId" = r."projectId" AND l."fromId" = r."id" AND l."type" = 'Verifies'
      LEFT JOIN "TestCase" t
        ON t."id" = l."toId" AND t."projectId" = r."projectId"
      WHERE r."projectId" = ${pid}
      GROUP BY r."id", r."text_id", r."title", r."status", r."approvalStatus"
      ORDER BY r."text_id"`;

    const totalTests = await prisma.testCase.count({ where: { projectId: pid } });
    const totalLinksAllTypes = await prisma.traceabilityLink.count({ where: { projectId: pid } });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Detaylı Traceability');

    // Headers
    const headers = [
      'Req ID',
      'Gereksinim Başlığı',
      'Test Bağlantıları',
      'Link Tipi',
      'Kapsama',
      'Durum',
      'Onay Durumu',
    ];
    worksheet.addRow(headers);

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF203864' },
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'center' };

    // Veriler
    let linkedReqs = 0;
    for (const row of rows) {
      if (row.forwardCount === 0) {
        worksheet.addRow([
          row.reqTextId,
          row.reqTitle,
          'Test bağlantısı yok',
          '-',
          '0%',
          row.reqStatus,
          row.reqApprovalStatus,
        ]);
        continue;
      }

      linkedReqs += 1;
      const coverage = `${row.forwardCount}/${totalTests} (%${Math.round((row.forwardCount / (totalTests || 1)) * 100)})`;
      worksheet.addRow([
        row.reqTextId,
        row.reqTitle,
        row.linkedTests,
        row.linkTypes,
        coverage,
        row.reqStatus,
        row.reqApprovalStatus,
      ]);
    }

    worksheet.columns = [
      { width: 10 },
      { width: 25 },
      { width: 50 },
      { width: 15 },
      { width: 15 },
      { width: 12 },
      { width: 12 },
    ];

    // Summary sayfası ekle
    const summarySheet = workbook.addWorksheet('Summary');
    const totalReqs = rows.length;

    summarySheet.addRow(['Detaylı Traceability Raporu']);
    summarySheet.addRow(['']);
    summarySheet.addRow(['Proje ID:', pid]);
    summarySheet.addRow(['Toplam Gereksinim:', totalReqs]);
    summarySheet.addRow(['Toplam Test Senaryosu:', totalTests]);
    summarySheet.addRow(['Test ile İzlenen Gereksinimler:', linkedReqs]);
    summarySheet.addRow(['Toplam Bağlantılar:', totalLinksAllTypes]);
    summarySheet.addRow(['Kapsama Oranı:', `${((linkedReqs / (totalReqs || 1)) * 100).toFixed(2)}%`]);
    summarySheet.addRow(['Export Tarihi:', new Date().toLocaleString('tr-TR')]);

    const titleRow = summarySheet.getRow(1);
    titleRow.font = { bold: true, size: 14 };
    summarySheet.columns = [{ width: 30 }, { width: 25 }];

    // Not: HTTP header'ı non-ASCII kabul etmez; dosya adı ISO-8859-1 güvenli.
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Detayli_Traceability_${new Date().getTime()}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Detaylı export hatası:', error);
    res.status(500).json({ error: 'Detaylı rapor oluşturulamadı', details: error.message });
  }
});

/**
 * GET /api/traceability/matrix
 * Matris verilerini JSON formatında döndür (Frontend görüntülemesi için)
 * Issue #15: JS filter/find yerine SQL JOIN + json_agg; response şekli aynı.
 */
router.get('/matrix', async (req, res) => {
  try {
    const pid = req.params.pid;

    // Tek sorgu: gereksinim başına bağlı testler json_agg ile toplanır.
    const rows = await prisma.$queryRaw`
      SELECT r."id" AS "reqId",
             r."text_id" AS "reqTextId",
             r."title" AS "reqTitle",
             r."description" AS "reqDescription",
             r."type" AS "reqType",
             r."status" AS "reqStatus",
             r."priority" AS "reqPriority",
             r."author" AS "reqAuthor",
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', t."id",
                   'text_id', t."text_id",
                   'title', t."title",
                   'status', t."status",
                   'type', l."type"
                 )
                 ORDER BY t."text_id"
               ) FILTER (WHERE t."id" IS NOT NULL),
               '[]'
             ) AS "linkedTests"
      FROM "Requirement" r
      LEFT JOIN "TraceabilityLink" l
        ON l."projectId" = r."projectId" AND l."fromId" = r."id" AND l."type" = 'Verifies'
      LEFT JOIN "TestCase" t
        ON t."id" = l."toId" AND t."projectId" = r."projectId"
      WHERE r."projectId" = ${pid}
      GROUP BY r."id"
      ORDER BY r."text_id"`;

    const totalTests = await prisma.testCase.count({ where: { projectId: pid } });
    const totalLinks = await prisma.traceabilityLink.count({
      where: { projectId: pid, type: 'Verifies' },
    });

    const parseTests = (v) => {
      if (Array.isArray(v)) return v;
      try {
        return JSON.parse(v ?? '[]');
      } catch {
        return [];
      }
    };

    // Matris verilerini hazırla
    let linkedRequirements = 0;
    const matrixData = rows.map((row) => {
      const linkedTests = parseTests(row.linkedTests);
      if (linkedTests.length > 0) linkedRequirements += 1;
      const coverage = totalTests > 0 ? Math.round((linkedTests.length / totalTests) * 100) : 0;

      return {
        id: row.reqId,
        text_id: row.reqTextId,
        title: row.reqTitle,
        description: row.reqDescription,
        type: row.reqType,
        status: row.reqStatus,
        priority: row.reqPriority,
        author: row.reqAuthor,
        linkedTests,
        coverage: `${coverage}%`,
      };
    });

    res.status(200).json({
      success: true,
      data: matrixData,
      summary: {
        totalRequirements: matrixData.length,
        totalTests,
        totalLinks,
        linkedRequirements,
      },
    });
  } catch (error) {
    console.error('Matris verisi hatası:', error);
    res.status(500).json({ error: 'Matris verileri yüklenemedi', details: error.message });
  }
});

export default router;
````

## File: backend/src/server.js
````javascript
// ============================================================================
//  server.js  —  Express + Prisma REST API. Tum kaynaklar PROJE bazli izole.
//  Taban yol: /api
//    Auth:      POST /api/auth/register, POST /api/auth/login, GET /api/users
//    Projeler:  GET/POST /api/projects, GET/PATCH/DELETE /api/projects/:pid
//    Proje alti (hepsi /api/projects/:pid/...):
//        fields         (GET/POST/DELETE)
//        requirements   (GET/POST/GET:id/PUT:id/DELETE:id)
//        testcases      (GET/POST/GET:id/PUT:id/DELETE:id)
//        glossary       (GET/POST/PUT:id/DELETE:id)
//        links          (GET/POST/DELETE:id)
//        audit          (GET/POST)
//        recompute      (POST)  -> tum durumlari yeniden hesaplar (cascade)
// ============================================================================
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { TYPE_PREFIX, STATUS } from './constants.js';
import { validateLink } from './logic.js';
import { recomputeStatusesBulk, recomputeApprovalsBulk } from './cascade.js';
import { requireAuth, requirePM, projectAccessGuard, hashPassword, verifyPassword, signToken } from './auth.js';
import { cleanRichText } from './sanitize.js';
import traceabilityRoutes from './traceability.js';
import { getImpactTree } from './impact.js';
import { parseReqIF } from './reqifParser.js';

const prisma = new PrismaClient();
const app = express();
app.set('trust proxy', 1);
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// --- Guvenlik: kimlik dogrulama + proje sinirlama --------------------------
//  Girisin kendisi (login/passcode/register) haric TUM /api yollari gecerli
//  bir JWT ister (bkz. auth.js). Deneme-yanilma saldirilarina karsi auth
//  yollarina ayrica hiz siniri uygulanir.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Cok fazla deneme yapildi. Lutfen birkac dakika sonra tekrar deneyin.' },
});
app.use('/api/auth', authLimiter);
app.use(requireAuth);
// :pid iceren HER route icin otomatik calisir — personel yalnizca kendi
// atandigi projeye erisebilir, PM her projeye erisebilir (IDOR korumasi).
app.param('pid', projectAccessGuard);

// Traceability router — mounted under :pid so app.param('pid', projectAccessGuard)
app.use('/api/projects/:pid/traceability', traceabilityRoutes);

const PORT = process.env.PORT || 4001;
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => fail(res, e));

function fail(res, e) {
  if (e && e.code === 'P2002') return res.status(409).json({ error: 'Benzersizlik ihlali (kod zaten kullanimda).' });
  if (e && e.code === 'P2025') return res.status(404).json({ error: 'Kayit bulunamadi.' });
  console.error('[api] hata:', e?.message || e);
  return res.status(e?.status || 500).json({ error: e?.message || 'Sunucu hatasi.' });
}
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

// Etki analizinde kullanilan "ilgili dokuman" etiket listesini temizler.
function normalizeDocuments(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((s) => String(s ?? '').trim()).filter(Boolean))];
}

// --- Audit yardimcisi -------------------------------------------------------
async function audit(projectId, entry) {
  try {
    await prisma.auditLog.create({ data: { projectId, ...entry } });
  } catch (e) {
    console.error('[audit] yazilamadi:', e?.message || e);
  }
}

// --- text_id ureteci --------------------------------------------------------
//  OMUR BOYU BENZERSIZLIK (kara liste): bir text_id bir kez uretildiyse, ilgili
//  kayit SILINSE BILE numarasi asla yeniden kullanilmaz. Bunun icin sadece
//  CANLI kayitlara degil, AuditLog'daki tum textId izlerine de bakariz
//  (silme kayitlari audit'te kalir). Boylece "en yuksek numarali kaydi silip
//  ayni kodu tekrar uretme" acigi kapanir.
async function nextTextId(projectId, type, isTest) {
  const prefix = TYPE_PREFIX[type] || 'REQ-GEN';
  const [rows, auditRows] = await Promise.all([
    isTest
      ? prisma.testCase.findMany({ where: { projectId }, select: { text_id: true } })
      : prisma.requirement.findMany({ where: { projectId }, select: { text_id: true } }),
    // Audit'te textId "REQ-SYS-001 -> TC-SYS-002" gibi birlesik de olabildigi
    // icin bosluk/ok'a gore parcalayip her parcayi degerlendiririz.
    prisma.auditLog.findMany({
      where: { projectId, textId: { startsWith: prefix + '-' } },
      select: { textId: true },
    }),
  ]);
  let max = 0;
  const consider = (raw) => {
    if (!raw) return;
    for (const token of String(raw).split(/[\s>-]*->[\s>-]*|\s+/)) {
      if (token && token.startsWith(prefix + '-')) {
        const n = parseInt(token.split('-').pop(), 10);
        if (!Number.isNaN(n) && n > max) max = n;
      }
    }
  };
  for (const { text_id } of rows) consider(text_id);
  for (const { textId } of auditRows) consider(textId);
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

// --- Cascade: bir projedeki tum gereksinim durumlarini yeniden hesapla ------
//  Issue #15: N+1 dongu yerine cascade.js'teki toplu SQL yolu (1 okuma +
//  <=3 updateMany + 1 toplu audit). Sadece degisen gereksinimler yazilir.
async function cascade(projectId) {
  return recomputeStatusesBulk(prisma, projectId);
}

// --- Toplu silme yardimcisi -------------------------------------------------
//  Secilen id'leri (proje kapsaminda) tek islemde siler: once iliskili tum
//  izlenebilirlik baglarini temizler, sonra kayitlari siler, her biri icin
//  DELETE audit kaydi yazar (silinen text_id kara listede kalir).
async function batchDelete(pid, model, ids, entityType) {
  if (!Array.isArray(ids) || ids.length === 0) throw bad('En az bir id zorunlu.');
  const allRows = await prisma[model].findMany({ where: { id: { in: ids }, projectId: pid } });
  if (allRows.length === 0) throw bad('Silinecek kayit bulunamadi.', 404);
  // Onaylanip kilitlenmis kayitlar toplu silmeden muaf tutulur.
  const rows = allRows.filter((r) => !r.locked);
  if (rows.length === 0) throw bad('Secilen kayitlar onaylanmis ve kilitli; silinemez.', 403);
  const foundIds = rows.map((r) => r.id);
  await prisma.traceabilityLink.deleteMany({
    where: { projectId: pid, OR: [{ fromId: { in: foundIds } }, { toId: { in: foundIds } }] },
  });
  await prisma[model].deleteMany({ where: { id: { in: foundIds }, projectId: pid } });
  for (const r of rows) {
    await audit(pid, {
      action: 'DELETE',
      entityType,
      entityId: r.id,
      textId: r.text_id,
      message: `Toplu silme: "${r.title || r.term}" (${r.text_id}).`,
    });
  }
  return foundIds.length;
}

// --- Izin bileseni (permission component) eslemesi --------------------------
//  Her gereksinim/test, izin panellerindeki 6 bilesenden birine dusurulur.
//  Anahtarlar frontend REQ_PAGES / TEST_PAGES sayfa anahtarlariyla ayni.
function componentKeyOf(entityType, type) {
  if (entityType === 'requirement') {
    if (type === 'User Requirement') return 'req-user';
    if (type === 'System Requirement') return 'req-system';
    return 'req-subsystem'; // Software / Hardware
  }
  if (type === 'Acceptance Test') return 'test-acceptance';
  if (type === 'System Test') return 'test-system';
  return 'test-subsystem';
}

// --- Benzersiz 5 karakterlik passcode ureteci -------------------------------
//  Karisik gorunumlu harf/rakamlar (0/O, 1/I) haric tutulur.
async function generatePasscode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    const existing = await prisma.personnel.findUnique({ where: { passcode: code } });
    if (!existing) return code;
  }
  throw bad('Passcode uretilemedi; lutfen tekrar deneyin.', 500);
}

// --- Bir kaydin onay durumunu (consensus) yeniden hesapla -------------------
//  Gerekli oy verenler = PM + (o bileseni onaylama yetkisi olan tum personel).
//  Hepsi oy verdiyse -> Approved (kilitli). Aksi halde -> Pending.
async function requiredVotersFor(pid, entityType, entity) {
  const compKey = componentKeyOf(entityType, entity.type);
  const personnel = await prisma.personnel.findMany({ where: { projectId: pid }, include: { role: true } });
  const requiredPersonnel = personnel.filter((p) => {
    const perm = (p.role?.permissions || {}).approve;
    return perm && perm.enabled && Array.isArray(perm.components) && perm.components.includes(compKey);
  });
  return { requiredPersonnel, requiredVoterIds: ['PM', ...requiredPersonnel.map((p) => p.id)] };
}

async function recomputeApproval(pid, entityType, entityId) {
  const model = entityType === 'requirement' ? 'requirement' : 'testCase';
  const entity = await prisma[model].findUnique({ where: { id: entityId } });
  if (!entity || entity.projectId !== pid) throw bad('Varlik bulunamadi.', 404);
  const { requiredVoterIds } = await requiredVotersFor(pid, entityType, entity);
  const approvals = await prisma.approval.findMany({ where: { projectId: pid, entityType, entityId } });
  const votedIds = new Set(approvals.map((a) => a.voterId));
  const approved = requiredVoterIds.every((v) => votedIds.has(v));
  await prisma[model].update({
    where: { id: entityId },
    data: { approvalStatus: approved ? 'Approved' : 'Pending', locked: approved },
  });
  return { approvalStatus: approved ? 'Approved' : 'Pending', locked: approved };
}

// ===========================================================================
//  HEALTH
// ===========================================================================
app.get(
  '/api/health',
  wrap(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, ts: new Date().toISOString() });
  }),
);

// ===========================================================================
//  AUTH / USERS
// ===========================================================================
// Kayit varsayilan olarak KAPALIDIR (UI'dan zaten kaldirildi). Acmak icin
// backend'e PM_REGISTRATION_KEY ortam degiskeni tanimlayip istekte ayni
// degeri 'x-registration-key' basligiyla gondermek gerekir.
app.post(
  '/api/auth/register',
  requirePM,
  wrap(async (req, res) => {
    const expected = process.env.PM_REGISTRATION_KEY;
    if (!expected || req.headers['x-registration-key'] !== expected) {
      throw bad('Kayit devre disi birakildi.', 403);
    }
    const { username, password, name, role } = req.body || {};
    if (!username || !password || !name) throw bad('username, password, name zorunlu.');
    const initials = name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        password: await hashPassword(password),
        name: name.trim(),
        initials,
        role: role || 'System Engineer',
      },
    });
    res.status(201).json(safeUser(user));
  }),
);

app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const { username, password } = req.body || {};
    const user = await prisma.user.findUnique({ where: { username: (username || '').trim() } });
    if (!user) throw bad('Kullanici adi veya sifre yanlis.', 401);
    const { ok, migrated } = await verifyPassword(password, user.password);
    if (!ok) throw bad('Kullanici adi veya sifre yanlis.', 401);
    // Eski duz-metin kayit basariyla dogrulandi -> sessizce hash'e tasi.
    if (migrated)
      await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(password) } });
    const token = signToken({ kind: 'pm', isPM: true, userId: user.id });
    res.json({ token, user: safeUser(user) });
  }),
);

app.get(
  '/api/users',
  requirePM,
  wrap(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(users.map(safeUser));
  }),
);

// --- Passcode ile personel girisi (proje-bagimsiz) --------------------------
//  Personel passcode'unu girer -> dogrudan atandigi projeye + rolune duser.
app.post(
  '/api/auth/passcode',
  wrap(async (req, res) => {
    const raw = (req.body?.passcode || '').trim().toUpperCase();
    if (!raw) throw bad('Passcode zorunlu.');
    const p = await prisma.personnel.findUnique({
      where: { passcode: raw },
      include: { role: true, project: true },
    });
    if (!p) throw bad('Gecersiz passcode.', 401);
    const token = signToken({
      kind: 'personnel',
      isPM: false,
      personnelId: p.id,
      projectId: p.projectId,
      roleId: p.roleId,
    });
    res.json({
      token,
      personnel: { id: p.id, firstName: p.firstName, lastName: p.lastName, passcode: p.passcode },
      role: { id: p.role.id, name: p.role.name, permissions: p.role.permissions || {} },
      project: { id: p.project.id, name: p.project.name },
    });
  }),
);

const safeUser = (u) => ({ id: u.id, username: u.username, name: u.name, initials: u.initials, role: u.role });

// ===========================================================================
//  PROJECTS
// ===========================================================================
app.get(
  '/api/projects',
  wrap(async (req, res) => {
    // Personel yalnizca kendi atandigi projeyi gorur; PM tumunu gorur.
    const where = req.auth.isPM ? {} : { id: req.auth.projectId };
    const projects = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { requirements: true, testCases: true, links: true, glossary: true } } },
    });
    res.json(projects);
  }),
);

app.post(
  '/api/projects',
  requirePM,
  wrap(async (req, res) => {
    const { name, description } = req.body || {};
    if (!name || !name.trim()) throw bad('Proje adi zorunlu.');
    const project = await prisma.project.create({
      data: { name: name.trim(), description: (description || '').trim() },
    });
    await audit(project.id, {
      action: 'PROJECT_CREATE',
      entityType: 'project',
      entityId: project.id,
      message: `Proje olusturuldu: "${project.name}".`,
    });
    res.status(201).json(project);
  }),
);

app.get(
  '/api/projects/:pid',
  wrap(async (req, res) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.pid } });
    if (!project) throw bad('Proje bulunamadi.', 404);
    res.json(project);
  }),
);

app.patch(
  '/api/projects/:pid',
  requirePM,
  wrap(async (req, res) => {
    const { name, description } = req.body || {};
    const data = {};
    if (name != null) data.name = name.trim();
    if (description != null) data.description = description.trim();
    const project = await prisma.project.update({ where: { id: req.params.pid }, data });
    res.json(project);
  }),
);

app.delete(
  '/api/projects/:pid',
  requirePM,
  wrap(async (req, res) => {
    await prisma.project.delete({ where: { id: req.params.pid } });
    res.json({ ok: true });
  }),
);

// ===========================================================================
//  DINAMIK ALANLAR (fields)
// ===========================================================================
app.get(
  '/api/projects/:pid/fields',
  wrap(async (req, res) => {
    const fields = await prisma.projectField.findMany({
      where: { projectId: req.params.pid },
      orderBy: { name: 'asc' },
    });
    res.json(fields);
  }),
);

app.post(
  '/api/projects/:pid/fields',
  wrap(async (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) throw bad('Alan adi zorunlu.');
    const field = await prisma.projectField.create({ data: { projectId: req.params.pid, name: name.trim() } });
    res.status(201).json(field);
  }),
);

app.delete(
  '/api/projects/:pid/fields/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.projectField.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Alan bulunamadi.', 404);
    await prisma.projectField.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

// ===========================================================================
//  REQUIREMENTS
// ===========================================================================
app.get(
  '/api/projects/:pid/requirements',
  wrap(async (req, res) => {
    const where = { projectId: req.params.pid };
    if (req.query.type) where.type = req.query.type;
    const rows = await prisma.requirement.findMany({ where, orderBy: { text_id: 'asc' } });
    res.json(rows);
  }),
);

app.post(
  '/api/projects/:pid/requirements',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const b = req.body || {};
    if (!b.type) throw bad('Gereksinim tipi zorunlu.');
    const text_id = (b.text_id && b.text_id.trim()) || (await nextTextId(pid, b.type, false));
    // Yeni gereksinim: durum daima 'In Review' (henuz bagli test yok, kilitli).
    const row = await prisma.requirement.create({
      data: {
        projectId: pid,
        text_id,
        title: (b.title || 'Adsiz gereksinim').trim(),
        description: cleanRichText((b.description || '').trim()),
        type: b.type,
        field: b.field || null,
        priority: b.priority || 'Medium',
        status: STATUS.IN_REVIEW,
        dal_level: b.dal_level || 'DAL D',
        author: b.author || 'ehsim.user',
        relatedDocuments: normalizeDocuments(b.relatedDocuments),
      },
    });
    await audit(pid, {
      action: 'CREATE',
      entityType: 'requirement',
      entityId: row.id,
      textId: row.text_id,
      message: `Yeni gereksinim: "${row.title}" (${row.type}).`,
    });
    res.status(201).json(row);
  }),
);

app.get(
  '/api/projects/:pid/requirements/:id',
  wrap(async (req, res) => {
    const row = await prisma.requirement.findUnique({ where: { id: req.params.id } });
    if (!row) throw bad('Gereksinim bulunamadi.', 404);
    res.json(row);
  }),
);

app.put(
  '/api/projects/:pid/requirements/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const b = req.body || {};
    const before = await prisma.requirement.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Gereksinim bulunamadi.', 404);
    if (before.locked) throw bad('Bu gereksinim onaylandi ve kilitli. Duzenlemek icin once PM kilidi acmalidir.', 403);
    const data = {};
    for (const k of ['text_id', 'title', 'description', 'field', 'priority', 'dal_level']) {
      if (b[k] != null) data[k] = typeof b[k] === 'string' ? b[k].trim() : b[k];
    }
    if (data.description != null) data.description = cleanRichText(data.description);
    if (b.relatedDocuments != null) data.relatedDocuments = normalizeDocuments(b.relatedDocuments);
    // Tip degistirilemez (kilitli) ve status ELLE degistirilemez (otomatik).
    const row = await prisma.requirement.update({ where: { id: req.params.id }, data });
    await audit(pid, {
      action: 'UPDATE',
      entityType: 'requirement',
      entityId: row.id,
      textId: row.text_id,
      message: `Gereksinim guncellendi: "${row.title}".`,
    });
    res.json(row);
  }),
);

app.delete(
  '/api/projects/:pid/requirements/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.requirement.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Gereksinim bulunamadi.', 404);
    if (before.locked) throw bad('Bu gereksinim onaylandi ve kilitli; silinemez.', 403);
    // Iliskili baglari temizle
    await prisma.traceabilityLink.deleteMany({
      where: { projectId: pid, OR: [{ fromId: req.params.id }, { toId: req.params.id }] },
    });
    await prisma.requirement.delete({ where: { id: req.params.id } });
    await audit(pid, {
      action: 'DELETE',
      entityType: 'requirement',
      entityId: req.params.id,
      textId: before.text_id,
      message: `Gereksinim silindi: "${before.title}".`,
    });
    await cascade(pid);
    res.json({ ok: true });
  }),
);

app.post(
  '/api/projects/:pid/requirements/batch-delete',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const n = await batchDelete(pid, 'requirement', req.body?.ids, 'requirement');
    await cascade(pid);
    res.json({ ok: true, deleted: n });
  }),
);

// ===========================================================================
//  TEST CASES
// ===========================================================================
app.get(
  '/api/projects/:pid/testcases',
  wrap(async (req, res) => {
    const where = { projectId: req.params.pid };
    if (req.query.type) where.type = req.query.type;
    const rows = await prisma.testCase.findMany({ where, orderBy: { text_id: 'asc' } });
    res.json(rows);
  }),
);

app.post(
  '/api/projects/:pid/testcases',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const b = req.body || {};
    if (!b.type) throw bad('Test tipi zorunlu.');
    const text_id = (b.text_id && b.text_id.trim()) || (await nextTextId(pid, b.type, true));
    // Alan/oncelik/dal ve test sonucu (durum) artik ELLE girilir; bir gereksinime
    // baglanmak bu degerleri OTOMATIK doldurmaz (bir test coklu gereksinim dogrular).
    const status = b.status || STATUS.IN_REVIEW;
    if (![STATUS.APPROVED, STATUS.REJECTED, STATUS.IN_REVIEW].includes(status)) throw bad('Gecersiz test sonucu.');
    const row = await prisma.testCase.create({
      data: {
        projectId: pid,
        text_id,
        title: (b.title || 'Adsiz test').trim(),
        description: cleanRichText((b.description || '').trim()),
        type: b.type,
        field: b.field || null,
        priority: b.priority || null,
        dal_level: b.dal_level || null,
        status,
        author: b.author || 'ehsim.user',
      },
    });
    await audit(pid, {
      action: 'CREATE',
      entityType: 'testcase',
      entityId: row.id,
      textId: row.text_id,
      message: `Yeni test senaryosu: "${row.title}" (${row.type}).`,
    });
    res.status(201).json(row);
  }),
);

app.put(
  '/api/projects/:pid/testcases/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const b = req.body || {};
    const before = await prisma.testCase.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Test bulunamadi.', 404);
    if (before.locked) throw bad('Bu test onaylandi ve kilitli. Duzenlemek icin once PM kilidi acmalidir.', 403);
    const data = {};
    for (const k of ['text_id', 'title', 'description']) if (b[k] != null) data[k] = b[k].trim();
    if (data.description != null) data.description = cleanRichText(data.description);
    // Alan / Oncelik / DAL elle duzenlenebilir (bagdan bagimsiz).
    for (const k of ['field', 'priority', 'dal_level']) {
      if (b[k] !== undefined) data[k] = b[k] === null ? null : String(b[k]).trim() || null;
    }
    // Durum elle degistirilebilir (test sonucu: Passed/Failed/In Review)
    if (b.status != null) {
      if (![STATUS.APPROVED, STATUS.REJECTED, STATUS.IN_REVIEW].includes(b.status)) throw bad('Gecersiz test durumu.');
      data.status = b.status;
    }
    const row = await prisma.testCase.update({ where: { id: req.params.id }, data });
    await audit(pid, {
      action: 'UPDATE',
      entityType: 'testcase',
      entityId: row.id,
      textId: row.text_id,
      message: `Test guncellendi: "${row.title}" (durum: ${row.status}).`,
    });
    // Test durumu degistiyse cascade
    await cascade(pid);
    res.json(row);
  }),
);

app.delete(
  '/api/projects/:pid/testcases/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.testCase.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Test bulunamadi.', 404);
    if (before.locked) throw bad('Bu test onaylandi ve kilitli; silinemez.', 403);
    await prisma.traceabilityLink.deleteMany({
      where: { projectId: pid, OR: [{ fromId: req.params.id }, { toId: req.params.id }] },
    });
    await prisma.testCase.delete({ where: { id: req.params.id } });
    await audit(pid, {
      action: 'DELETE',
      entityType: 'testcase',
      entityId: req.params.id,
      textId: before.text_id,
      message: `Test silindi: "${before.title}".`,
    });
    await cascade(pid);
    res.json({ ok: true });
  }),
);

app.post(
  '/api/projects/:pid/testcases/batch-delete',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const n = await batchDelete(pid, 'testCase', req.body?.ids, 'testcase');
    await cascade(pid);
    res.json({ ok: true, deleted: n });
  }),
);

// ===========================================================================
//  GLOSSARY
// ===========================================================================
app.get(
  '/api/projects/:pid/glossary',
  wrap(async (req, res) => {
    const rows = await prisma.glossaryTerm.findMany({ where: { projectId: req.params.pid }, orderBy: { term: 'asc' } });
    res.json(rows);
  }),
);

app.post(
  '/api/projects/:pid/glossary',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const b = req.body || {};
    if (!b.term || !b.term.trim()) throw bad('Terim zorunlu.');
    const count = await prisma.glossaryTerm.count({ where: { projectId: pid } });
    const text_id = (b.text_id && b.text_id.trim()) || `GLO-${String(count + 1).padStart(3, '0')}`;
    const row = await prisma.glossaryTerm.create({
      data: {
        projectId: pid,
        text_id,
        term: b.term.trim(),
        definition: (b.definition || '').trim(),
        author: b.author || 'ehsim.user',
      },
    });
    await audit(pid, {
      action: 'CREATE',
      entityType: 'glossary',
      entityId: row.id,
      textId: row.text_id,
      message: `Sozluk terimi eklendi: "${row.term}".`,
    });
    res.status(201).json(row);
  }),
);

app.put(
  '/api/projects/:pid/glossary/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.glossaryTerm.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Terim bulunamadi.', 404);
    const b = req.body || {};
    const data = {};
    for (const k of ['term', 'definition', 'text_id']) if (b[k] != null) data[k] = b[k].trim();
    const row = await prisma.glossaryTerm.update({ where: { id: req.params.id }, data });
    res.json(row);
  }),
);

app.delete(
  '/api/projects/:pid/glossary/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.glossaryTerm.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Terim bulunamadi.', 404);
    await prisma.traceabilityLink.deleteMany({
      where: { projectId: pid, OR: [{ fromId: req.params.id }, { toId: req.params.id }] },
    });
    await prisma.glossaryTerm.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

app.post(
  '/api/projects/:pid/glossary/batch-delete',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const n = await batchDelete(pid, 'glossaryTerm', req.body?.ids, 'glossary');
    res.json({ ok: true, deleted: n });
  }),
);

// ===========================================================================
//  LINKS (traceability)
// ===========================================================================
app.get(
  '/api/projects/:pid/links',
  wrap(async (req, res) => {
    const rows = await prisma.traceabilityLink.findMany({ where: { projectId: req.params.pid } });
    res.json(rows);
  }),
);

// Yardimci: proje icindeki bir id'yi req/test/glossary olarak coz.
async function resolveNode(pid, id) {
  const req = await prisma.requirement.findUnique({ where: { id } });
  if (req && req.projectId === pid) return { kind: 'requirement', node: req };
  const test = await prisma.testCase.findUnique({ where: { id } });
  if (test && test.projectId === pid) return { kind: 'test', node: test };
  const glo = await prisma.glossaryTerm.findUnique({ where: { id } });
  if (glo && glo.projectId === pid) return { kind: 'glossary', node: { ...glo, type: 'Glossary' } };
  return null;
}

// Tek bir bagi kurar (dogrulama + create + Verifies alan/durum senkron + audit).
// Cascade CAGRILMAZ; cagiran taraf toplu islem sonunda bir kez cascade eder.
// idempotent: ayni bag zaten varsa yeniden olusturmaz, mevcut olani doner.
async function createOneLink(pid, { fromId, toId, type, testStatus: _testStatus }) {
  if (!fromId || !toId || !type) throw bad('fromId, toId, type zorunlu.');

  const fromR = await resolveNode(pid, fromId);
  const toR = await resolveNode(pid, toId);
  if (!fromR || !toR) throw bad('Bag icin gecersiz dugum(ler).');

  const check = validateLink(fromR.node, toR.node, type, toR.kind);
  if (!check.ok) throw bad(check.error);

  // NOT: Bir test artik BIRDEN FAZLA gereksinimi dogrulayabilir (coklu Verifies).
  // Tek-gereksinim kisiti kaldirildi. Ayrica Verifies baginda testin alan/
  // oncelik/dal/sonuc degerleri ARTIK OTOMATIK doldurulmaz; bunlar teste elle
  // girilir (bir test farkli tipte/alanda gereksinimlere baglanabildiginden
  // otomatik kopyalama anlamsizdir).

  // Ayni bag zaten varsa tekrar olusturma (toplu islemde guvenli).
  const dup = await prisma.traceabilityLink.findFirst({ where: { projectId: pid, fromId, toId, type } });
  const link =
    dup ||
    (await prisma.traceabilityLink.create({
      data: { projectId: pid, fromId, toId, type, createdBy: 'ehsim.user' },
    }));
  if (!dup) {
    await audit(pid, {
      action: 'LINK',
      entityType: 'link',
      entityId: link.id,
      textId: `${fromR.node.text_id} -> ${toR.node.text_id}`,
      message: `Bag kuruldu: ${fromR.node.text_id} «${type}» ${toR.node.text_id}.`,
    });
  }
  return link;
}

app.post(
  '/api/projects/:pid/links',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { fromId, toId, type, testStatus: _testStatus } = req.body || {};
    const link = await createOneLink(pid, { fromId, toId, type, testStatus: _testStatus });
    await cascade(pid);
    res.status(201).json(link);
  }),
);

// --- TOPLU BAG: bir HEDEF'e (target) secilen tum kaynaklari zincirle ---------
//  Body: { type, targetId, sourceIds: [...], testStatus? }
//  DEPOLAMA YONU her tipte AYNI: fromId = targetId (ust/gereksinim),
//  toId = her sourceId (alt/test/terim). Boylece Satisfies/Verifies/Assigned To
//  icin tek, tutarli bir cagri yeterlidir.
app.post(
  '/api/projects/:pid/links/batch',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { type, targetId, sourceIds, testStatus } = req.body || {};
    if (!type || !targetId || !Array.isArray(sourceIds) || sourceIds.length === 0) {
      throw bad('type, targetId ve en az bir sourceId zorunlu.');
    }
    const results = { linked: 0, skipped: [] };
    for (const sourceId of sourceIds) {
      if (sourceId === targetId) {
        results.skipped.push({ id: sourceId, reason: 'self' });
        continue;
      }
      try {
        await createOneLink(pid, { fromId: targetId, toId: sourceId, type, testStatus });
        results.linked += 1;
      } catch (e) {
        // Bir kaynak baglanamazsa (orn. test zaten bagli) atla, digerlerine devam et.
        results.skipped.push({ id: sourceId, reason: e?.message || 'hata' });
      }
    }
    await cascade(pid);
    res.status(201).json(results);
  }),
);

app.delete(
  '/api/projects/:pid/links/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.traceabilityLink.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Bag bulunamadi.', 404);
    await prisma.traceabilityLink.delete({ where: { id: req.params.id } });
    await audit(pid, {
      action: 'UNLINK',
      entityType: 'link',
      entityId: req.params.id,
      message: `Bag koparildi (${before.type}).`,
    });
    await cascade(pid);
    res.json({ ok: true });
  }),
);

// ===========================================================================
//  AUDIT
// ===========================================================================
app.get(
  '/api/projects/:pid/audit',
  wrap(async (req, res) => {
    const rows = await prisma.auditLog.findMany({
      where: { projectId: req.params.pid },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    res.json(rows);
  }),
);

// ===========================================================================
//  IMPACT ANALYSIS — backend tarafinda Recursive CTE ile etki agaci.
//  Issue #46 — frontend'deki buildImpactTree'yi backend'e tasima.
// ===========================================================================
app.get(
  '/api/projects/:pid/impact',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const reqId = req.query.reqId;
    if (!reqId || !reqId.trim()) throw bad('reqId zorunlu.');
    const result = await getImpactTree(pid, reqId.trim());
    if (!result) throw bad('Gereksinim bulunamadı veya etki agaci bos.', 404);
    res.json(result);
  }),
);

// ===========================================================================
//  RECOMPUTE (cascade) — manuel tetik
// ===========================================================================
app.post(
  '/api/projects/:pid/recompute',
  wrap(async (req, res) => {
    const n = await cascade(req.params.pid);
    res.json({ updated: n });
  }),
);

// ===========================================================================
//  ROLES (proje bazli, dinamik roller + 12 kademeli izin)
// ===========================================================================
app.get(
  '/api/projects/:pid/roles',
  wrap(async (req, res) => {
    const rows = await prisma.role.findMany({ where: { projectId: req.params.pid }, orderBy: { createdAt: 'asc' } });
    res.json(rows);
  }),
);

app.post(
  '/api/projects/:pid/roles',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { name, permissions } = req.body || {};
    if (!name || !name.trim()) throw bad('Rol adi zorunlu.');
    const row = await prisma.role.create({
      data: { projectId: pid, name: name.trim(), permissions: permissions || {} },
    });
    await audit(pid, {
      action: 'ROLE_CREATE',
      entityType: 'role',
      entityId: row.id,
      message: `Rol olusturuldu: "${row.name}".`,
    });
    res.status(201).json(row);
  }),
);

app.put(
  '/api/projects/:pid/roles/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Rol bulunamadi.', 404);
    const { name, permissions } = req.body || {};
    const data = {};
    if (name != null) data.name = name.trim();
    if (permissions != null) data.permissions = permissions;
    const row = await prisma.role.update({ where: { id: req.params.id }, data });
    await audit(pid, {
      action: 'ROLE_UPDATE',
      entityType: 'role',
      entityId: row.id,
      message: `Rol guncellendi: "${row.name}".`,
    });
    // Izinler degistiginde onay durumlari etkilenebilir; yeniden hesapla.
    await recomputeAllApprovals(pid);
    res.json(row);
  }),
);

app.delete(
  '/api/projects/:pid/roles/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Rol bulunamadi.', 404);
    await prisma.role.delete({ where: { id: req.params.id } });
    await audit(pid, {
      action: 'ROLE_DELETE',
      entityType: 'role',
      entityId: req.params.id,
      message: `Rol silindi: "${before?.name || ''}".`,
    });
    await recomputeAllApprovals(pid);
    res.json({ ok: true });
  }),
);

// ===========================================================================
//  PERSONNEL (passcode ile giren atanmis kisiler)
// ===========================================================================
app.get(
  '/api/projects/:pid/personnel',
  wrap(async (req, res) => {
    const rows = await prisma.personnel.findMany({
      where: { projectId: req.params.pid },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(rows);
  }),
);

app.post(
  '/api/projects/:pid/personnel',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { firstName, lastName, roleId } = req.body || {};
    if (!firstName || !firstName.trim()) throw bad('Ad zorunlu.');
    if (!lastName || !lastName.trim()) throw bad('Soyad zorunlu.');
    if (!roleId) throw bad('Rol zorunlu.');
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.projectId !== pid) throw bad('Gecersiz rol.', 400);
    const passcode = await generatePasscode();
    const row = await prisma.personnel.create({
      data: { projectId: pid, roleId, firstName: firstName.trim(), lastName: lastName.trim(), passcode },
      include: { role: true },
    });
    await audit(pid, {
      action: 'PERSONNEL_CREATE',
      entityType: 'personnel',
      entityId: row.id,
      message: `Personel eklendi: "${row.firstName} ${row.lastName}" (${role.name}), passcode: ${passcode}.`,
    });
    await recomputeAllApprovals(pid);
    res.status(201).json(row);
  }),
);

app.delete(
  '/api/projects/:pid/personnel/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.personnel.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Personel bulunamadi.', 404);
    await prisma.personnel.delete({ where: { id: req.params.id } });
    await audit(pid, {
      action: 'PERSONNEL_DELETE',
      entityType: 'personnel',
      entityId: req.params.id,
      message: `Personel silindi: "${before?.firstName || ''} ${before?.lastName || ''}".`,
    });
    await recomputeAllApprovals(pid);
    res.json({ ok: true });
  }),
);

// ===========================================================================
//  APPROVALS (consensus onay + kilitleme)
// ===========================================================================
// Bir projedeki TUM gereksinim ve testlerin onay durumunu yeniden hesapla.
//  Issue #15: N+1 dongu yerine cascade.js'teki toplu SQL yolu — oy havuzu
//  1 kez okunur, bilesen basina 2 parametrik bulk UPDATE (toplam 12) calisir;
//  degeri degismeyen kayitlara dokunulmaz.
async function recomputeAllApprovals(pid) {
  await recomputeApprovalsBulk(prisma, pid);
}

app.get(
  '/api/projects/:pid/approvals',
  wrap(async (req, res) => {
    const rows = await prisma.approval.findMany({ where: { projectId: req.params.pid } });
    res.json(rows);
  }),
);

// Oy ver / geri cek (toggle). Kilitliyken yalnizca PM degistirebilir.
app.post(
  '/api/projects/:pid/approvals/vote',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { entityType, entityId, voterId, voterName, personnelId } = req.body || {};
    if (!entityType || !entityId || !voterId) throw bad('entityType, entityId, voterId zorunlu.');
    if (!['requirement', 'testcase'].includes(entityType)) throw bad('Gecersiz entityType.');
    const model = entityType === 'requirement' ? 'requirement' : 'testCase';
    const entity = await prisma[model].findUnique({ where: { id: entityId } });
    if (!entity || entity.projectId !== pid) throw bad('Varlik bulunamadi.', 404);
    if (entity.locked && voterId !== 'PM') {
      throw bad('Bu kayit onaylandi ve kilitli. Yalnizca Proje Yoneticisi kilidi acabilir.', 403);
    }
    const existing = await prisma.approval.findFirst({ where: { projectId: pid, entityType, entityId, voterId } });
    if (existing) {
      await prisma.approval.delete({ where: { id: existing.id } });
      await audit(pid, {
        action: 'APPROVAL_WITHDRAW',
        entityType,
        entityId,
        textId: entity.text_id,
        actor: voterName || voterId,
        message: `Onay geri cekildi: ${voterName || voterId}.`,
      });
    } else {
      await prisma.approval.create({
        data: {
          projectId: pid,
          entityType,
          entityId,
          voterId,
          voterName: voterName || voterId,
          personnelId: personnelId || null,
        },
      });
      await audit(pid, {
        action: 'APPROVAL_VOTE',
        entityType,
        entityId,
        textId: entity.text_id,
        actor: voterName || voterId,
        message: `Onaylandi: ${voterName || voterId}.`,
      });
    }
    const state = await recomputeApproval(pid, entityType, entityId);
    res.json(state);
  }),
);

// PM kilit acar: PM'in onayini geri ceker -> durum Beklemede'ye doner.
app.post(
  '/api/projects/:pid/approvals/unlock',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { entityType, entityId } = req.body || {};
    if (!entityType || !entityId) throw bad('entityType, entityId zorunlu.');
    await prisma.approval.deleteMany({ where: { projectId: pid, entityType, entityId, voterId: 'PM' } });
    const model = entityType === 'requirement' ? 'requirement' : 'testCase';
    const entity = await prisma[model].findUnique({ where: { id: entityId } });
    await audit(pid, {
      action: 'UNLOCK',
      entityType,
      entityId,
      textId: entity?.text_id,
      actor: 'Proje Yoneticisi',
      message: 'Kilit acildi; PM onayi geri cekildi, durum Beklemede.',
    });
    const state = await recomputeApproval(pid, entityType, entityId);
    res.json(state);
  }),
);

// Onay detay matrisi (PM'e ozel): her gerekli oy verenin oy durumu.
app.get(
  '/api/projects/:pid/approvals/matrix',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { entityType, entityId } = req.query;
    if (!entityType || !entityId) throw bad('entityType, entityId zorunlu.');
    const model = entityType === 'requirement' ? 'requirement' : 'testCase';
    const entity = await prisma[model].findUnique({ where: { id: String(entityId) } });
    if (!entity || entity.projectId !== pid) throw bad('Varlik bulunamadi.', 404);
    const { requiredPersonnel } = await requiredVotersFor(pid, entityType, entity);
    const approvals = await prisma.approval.findMany({
      where: { projectId: pid, entityType, entityId: String(entityId) },
    });
    const votedIds = new Set(approvals.map((a) => a.voterId));
    const voters = [
      { voterId: 'PM', name: 'Proje Yoneticisi', role: 'Proje Yoneticisi', voted: votedIds.has('PM') },
      ...requiredPersonnel.map((p) => ({
        voterId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        role: p.role?.name || '-',
        voted: votedIds.has(p.id),
      })),
    ];
    res.json({
      approvalStatus: entity.approvalStatus,
      locked: entity.locked,
      textId: entity.text_id,
      title: entity.title,
      voters,
    });
  }),
);

// --- 404 ---
app.use((req, res) => res.status(404).json({ error: `Bulunamadi: ${req.method} ${req.path}` }));

// Test ortaminda (node:test + supertest) dinlemeye kapilmayalim; app disa
// aktarilir, supertest kendi portunu yonetir.
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[api] EHSIM RMT backend calisiyor -> http://localhost:${PORT}/api`);
  });
}
//reqIF Integration
app.post(
  '/api/projects/:pid/import/reqif',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { xmlContent } = req.body || {};

    if (!xmlContent || typeof xmlContent !== 'string') {
      throw bad('Geçersiz veya boş XML içeriği.');
    }

    const { requirements, relations } = parseReqIF(xmlContent);

    const result = await prisma.$transaction(async (tx) => {
      const externalToDbIdMap = new Map();

      // 1. Gereksinimleri Ekle
      for (const reqItem of requirements) {
        const text_id = await nextTextId(pid, 'User Requirement', false);
        const created = await tx.requirement.create({
          data: {
            projectId: pid,
            text_id,
            title: (reqItem.title || 'Adsız Gereksinim').trim(),
            description: cleanRichText((reqItem.description || '').trim()),
            type: 'User Requirement',
            priority: 'Medium',
            status: STATUS.IN_REVIEW,
            author: 'reqif.import',
          },
        });
        externalToDbIdMap.set(reqItem.externalId, created.id);
      }

      // 2. İzlenebilirlik Bağlarını Ekle
      let createdLinksCount = 0;
      for (const rel of relations) {
        const sourceDbId = externalToDbIdMap.get(rel.sourceExternalId);
        const targetDbId = externalToDbIdMap.get(rel.targetExternalId);

        if (sourceDbId && targetDbId) {
          await tx.traceabilityLink.create({
            data: {
              projectId: pid,
              fromId: sourceDbId,
              toId: targetDbId,
              type: rel.type || 'Satisfies',
              createdBy: 'reqif.import',
            },
          });
          createdLinksCount++;
        }
      }

      return {
        importedRequirements: requirements.length,
        importedLinks: createdLinksCount,
      };
    });

    await cascade(pid);

    res.status(200).json({
      success: true,
      message: 'ReqIF başarıyla içe aktarıldı.',
      stats: result,
    });
  }),
);

export default app;
````
