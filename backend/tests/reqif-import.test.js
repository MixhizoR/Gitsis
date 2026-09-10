// ============================================================================
// reqif-import.test.js — ReqIF/.reqifz/.xml içe aktarma: tip seçimi, ZIP
// desteği, tekrar-içe-aktarmada güncelleme (idempotency), çok-modüllü
// (DOORS tarzı) çapraz-referans bağ kurma, ENUMERATION çözümleme.
// ============================================================================
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import request from 'supertest';
import './_setup.js';
import { resetDb } from './_setup.js';
import { buildReqIF } from '../src/reqifExporter.js';

const { default: app } = await import('../src/server.js');
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

const PM_CREDS = { username: 'pm-reqif', password: 'reqif-123' };
let proj;
let pmToken;

before(async () => {
  resetDb();
  const { hashPassword } = await import('../src/auth.js');
  await prisma.user.create({
    data: {
      username: PM_CREDS.username,
      passwordHash: await hashPassword(PM_CREDS.password),
      name: 'ReqIF Test PM',
      role: 'Proje Yoneticisi',
    },
  });
  const res = await request(app).post('/api/auth/login').send(PM_CREDS);
  pmToken = res.body.token;
  assert.ok(pmToken);
});

after(async () => {
  await prisma.$disconnect();
});

// --- Kucuk, bagimliliksiz ZIP olusturucu (STORE yontemi) --------------------
// zipUtil.js'nin CRC dogrulamasi yapmadigi manuel olarak dogrulandi; testler
// icin gercek bir ZIP arsivi uretmek amaciyla kullanilir (npm bagimliligi
// eklemeden — bkz. backend/src/zipUtil.js ust bilgisi).
function buildZipStore(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const localEntry = Buffer.concat([local, nameBuf, data]);
    localParts.push(localEntry);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([central, nameBuf]));

    offset += localEntry.length;
  }
  const localBuf = Buffer.concat(localParts);
  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

// --- Ortak ReqIF XML üretici --------------------------------------------------
function reqifModule({ objects, relations = [] }) {
  const objectsXml = objects
    .map(
      (o) => `
        <SPEC-OBJECT IDENTIFIER="${o.id}">
          <TYPE><SPEC-OBJECT-TYPE-REF>SOT-1</SPEC-OBJECT-TYPE-REF></TYPE>
          <VALUES>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${o.name}">
              <DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>AD-NAME</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION>
            </ATTRIBUTE-VALUE-STRING>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${o.text}">
              <DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>AD-TEXT</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION>
            </ATTRIBUTE-VALUE-STRING>
            ${
              o.enumRef
                ? `<ATTRIBUTE-VALUE-ENUMERATION>
                     <DEFINITION><ATTRIBUTE-DEFINITION-ENUMERATION-REF>AD-PRIO</ATTRIBUTE-DEFINITION-ENUMERATION-REF></DEFINITION>
                     <VALUES><ENUM-VALUE-REF>${o.enumRef}</ENUM-VALUE-REF></VALUES>
                   </ATTRIBUTE-VALUE-ENUMERATION>`
                : ''
            }
          </VALUES>
        </SPEC-OBJECT>`,
    )
    .join('');

  const relationsXml = relations
    .map(
      (r) => `
        <SPEC-RELATION IDENTIFIER="${r.id}">
          <TYPE><SPEC-RELATION-TYPE-REF>SRT-1</SPEC-RELATION-TYPE-REF></TYPE>
          <SOURCE><SPEC-OBJECT-REF>${r.source}</SPEC-OBJECT-REF></SOURCE>
          <TARGET><SPEC-OBJECT-REF>${r.target}</SPEC-OBJECT-REF></TARGET>
        </SPEC-RELATION>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF>
  <CORE-CONTENT>
    <REQ-IF-CONTENT>
      <DATATYPES>
        <DATATYPE-DEFINITION-STRING IDENTIFIER="DT-STR" LONG-NAME="String"/>
        <DATATYPE-DEFINITION-ENUMERATION IDENTIFIER="DT-ENUM" LONG-NAME="Priority">
          <SPECIFIED-VALUES>
            <ENUM-VALUE IDENTIFIER="EV-HIGH" LONG-NAME="High"/>
            <ENUM-VALUE IDENTIFIER="EV-LOW" LONG-NAME="Low"/>
          </SPECIFIED-VALUES>
        </DATATYPE-DEFINITION-ENUMERATION>
      </DATATYPES>
      <SPEC-TYPES>
        <SPEC-OBJECT-TYPE IDENTIFIER="SOT-1" LONG-NAME="Requirement">
          <SPEC-ATTRIBUTES>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="AD-NAME" LONG-NAME="ReqIF.Name">
              <TYPE><DATATYPE-DEFINITION-STRING-REF>DT-STR</DATATYPE-DEFINITION-STRING-REF></TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="AD-TEXT" LONG-NAME="ReqIF.Text">
              <TYPE><DATATYPE-DEFINITION-STRING-REF>DT-STR</DATATYPE-DEFINITION-STRING-REF></TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
            <ATTRIBUTE-DEFINITION-ENUMERATION IDENTIFIER="AD-PRIO" LONG-NAME="Custom Priority">
              <TYPE><DATATYPE-DEFINITION-ENUMERATION-REF>DT-ENUM</DATATYPE-DEFINITION-ENUMERATION-REF></TYPE>
            </ATTRIBUTE-DEFINITION-ENUMERATION>
          </SPEC-ATTRIBUTES>
        </SPEC-OBJECT-TYPE>
        <SPEC-RELATION-TYPE IDENTIFIER="SRT-1" LONG-NAME="Satisfies"/>
      </SPEC-TYPES>
      <SPEC-OBJECTS>${objectsXml}
      </SPEC-OBJECTS>
      <SPEC-RELATIONS>${relationsXml}
      </SPEC-RELATIONS>
    </REQ-IF-CONTENT>
  </CORE-CONTENT>
</REQ-IF>`;
}

async function cleanProject(pid) {
  await prisma.traceabilityLink.deleteMany({ where: { projectId: pid } });
  await prisma.auditLog.deleteMany({ where: { projectId: pid } });
  await prisma.requirement.deleteMany({ where: { projectId: pid } });
  await prisma.testCase.deleteMany({ where: { projectId: pid } });
}

test('setup: proje olustur', async () => {
  proj = await prisma.project.create({ data: { name: 'ReqIF Import Test' } });
});

test('R1: temel .reqif ice aktarma — dogru tip, ReqIF.Name/Text, externalId saklanir', async () => {
  await cleanProject(proj.id);
  const xml = reqifModule({
    objects: [
      {
        id: 'U-1',
        name: 'Vehicle shall stop safely',
        text: 'The vehicle shall come to a complete stop within a safe distance.',
      },
    ],
  });
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .field('importType', 'User Requirement')
    .attach('file', Buffer.from(xml, 'utf8'), { filename: 'module.reqif' });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.stats.importedRequirements, 1);

  const row = await prisma.requirement.findFirst({ where: { projectId: proj.id } });
  assert.equal(row.type, 'User Requirement');
  assert.equal(row.title, 'Vehicle shall stop safely');
  assert.equal(row.description, 'The vehicle shall come to a complete stop within a safe distance.');
  assert.equal(row.attributes.reqifExternalId, 'U-1');
});

test('R2: .reqifz (ZIP) import — .reqif ile ayni sonucu verir', async () => {
  await cleanProject(proj.id);
  const xml = reqifModule({
    objects: [{ id: 'U-1', name: 'Zip import test', text: 'Description from zip.' }],
  });
  const zipBuf = buildZipStore([{ name: 'module.reqif', data: Buffer.from(xml, 'utf8') }]);

  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', zipBuf, { filename: 'module.reqifz' });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.stats.importedRequirements, 1);
  const row = await prisma.requirement.findFirst({ where: { projectId: proj.id } });
  assert.equal(row.title, 'Zip import test');
});

test('R3: ayni externalId ile tekrar ice aktarma — cogaltmaz, GUNCELLER', async () => {
  await cleanProject(proj.id);
  const xmlV1 = reqifModule({ objects: [{ id: 'U-1', name: 'Original title', text: 'Original text.' }] });
  const r1 = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', Buffer.from(xmlV1, 'utf8'), { filename: 'v1.reqif' });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.stats.importedRequirements, 1);

  const xmlV2 = reqifModule({ objects: [{ id: 'U-1', name: 'Updated title', text: 'Updated text.' }] });
  const r2 = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', Buffer.from(xmlV2, 'utf8'), { filename: 'v2.reqif' });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.stats.importedRequirements, 0, 'yeni kayit olusturulmamali');
  assert.equal(r2.body.stats.updatedRequirements, 1);

  const rows = await prisma.requirement.findMany({ where: { projectId: proj.id } });
  assert.equal(rows.length, 1, 'cogaltma olmamali');
  assert.equal(rows[0].title, 'Updated title');
});

test('R4: cok-modullu ice aktarma — System modulu, daha once ice aktarilan User nesnesine Satisfies bagi kurar', async () => {
  await cleanProject(proj.id);
  const userXml = reqifModule({ objects: [{ id: 'U-1', name: 'User level req', text: 'User text.' }] });
  const rUser = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .field('importType', 'User Requirement')
    .attach('file', Buffer.from(userXml, 'utf8'), { filename: 'user.reqif' });
  assert.equal(rUser.status, 200);

  const sysXml = reqifModule({
    objects: [{ id: 'S-1', name: 'System level req', text: 'System text.' }],
    relations: [{ id: 'REL-1', source: 'S-1', target: 'U-1' }],
  });
  const rSys = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .field('importType', 'System Requirement')
    .attach('file', Buffer.from(sysXml, 'utf8'), { filename: 'system.reqif' });
  assert.equal(rSys.status, 200, JSON.stringify(rSys.body));
  assert.equal(rSys.body.stats.importedLinks, 1, JSON.stringify(rSys.body));

  const userRow = await prisma.requirement.findFirst({ where: { projectId: proj.id, type: 'User Requirement' } });
  const sysRow = await prisma.requirement.findFirst({ where: { projectId: proj.id, type: 'System Requirement' } });
  const link = await prisma.traceabilityLink.findFirst({ where: { projectId: proj.id, type: 'Satisfies' } });
  assert.ok(link, 'Satisfies bagi olusmali');
  // fromId = UST (User), toId = ALT (System) — SPEC-RELATION yonu ters olsa
  // bile validateLink her iki yonu de deneyerek dogru yonu bulmali.
  assert.equal(link.fromId, userRow.id);
  assert.equal(link.toId, sysRow.id);
});

test('R5: ENUMERATION oznitelik degeri okunabilir metne cozulur ve custom attribute olarak saklanir', async () => {
  await cleanProject(proj.id);
  const xml = reqifModule({
    objects: [{ id: 'U-1', name: 'Enum test', text: 'Enum text.', enumRef: 'EV-HIGH' }],
  });
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', Buffer.from(xml, 'utf8'), { filename: 'enum.reqif' });
  assert.equal(res.status, 200);
  const row = await prisma.requirement.findFirst({ where: { projectId: proj.id } });
  assert.equal(row.attributes.custom_priority, 'High', JSON.stringify(row.attributes));
});

test('R6: gecersiz importType -> varsayilan User Requirement kullanilir', async () => {
  await cleanProject(proj.id);
  const xml = reqifModule({ objects: [{ id: 'U-1', name: 'Fallback type test', text: 'x' }] });
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .field('importType', 'Not A Real Type')
    .attach('file', Buffer.from(xml, 'utf8'), { filename: 'x.reqif' });
  assert.equal(res.status, 200);
  const row = await prisma.requirement.findFirst({ where: { projectId: proj.id } });
  assert.equal(row.type, 'User Requirement');
});

test('R7: bozuk ZIP -> 400 (500 degil)', async () => {
  await cleanProject(proj.id);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]), { filename: 'broken.reqifz' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('R8: gecersiz uzanti -> 413 (multer fileFilter reddeder)', async () => {
  await cleanProject(proj.id);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', Buffer.from('not reqif'), { filename: 'notes.txt' });
  assert.equal(res.status, 413);
});

test('R9: bos SPEC-OBJECTS -> 400 acik hata mesaji', async () => {
  await cleanProject(proj.id);
  const xml = reqifModule({ objects: [] });
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', Buffer.from(xml, 'utf8'), { filename: 'empty.reqif' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

// --- RIF (HIS 1.2) — ReqIF'in selefi; GERCEK IBM DOORS classic ".xml"
// exportundan (kullanicinin gonderdigi dosyadan) turetilmis kucuk bir
// fixture. DOORS'un gercek sozdizimi ReqIF'ten iki onemli noktada FARKLI:
//   1) IDENTIFIER/LONG-NAME birer XML ATTRIBUTE DEGIL, CHILD ELEMENT'tir.
//   2) Kapsayici/deger etiketleri farkli adlar tasir: SPEC-TYPE (SPEC-
//      OBJECT-TYPE degil), ATTRIBUTE-DEFINITION-SIMPLE (String/Integer/
//      Date icin ortak) + ATTRIBUTE-DEFINITION-COMPLEX (zengin metin icin),
//      ATTRIBUTE-VALUE-SIMPLE + ATTRIBUTE-VALUE-EMBEDDED-DOCUMENT (icerik
//      THE-VALUE yerine XHTML-CONTENT altinda). Kok, ReqIF ile AYNI
//      CORE-CONTENT sargisini kullanir ama ic icerik adi RIF-CONTENT'tir.
// Bir onceki (attribute-bazli varsayimla yazilmis) fixture bu gercek
// yapiyi yakalayamiyordu; bu yuzden testi gercek dosyayla degistirdik.
const DOORS_RIF_XML = `<?xml version="1.0" encoding="UTF-8"?>
<RIF xmlns="http://automotive-his.de/200807/rif">
  <CORE-CONTENT>
    <RIF-CONTENT>
      <DATATYPES>
        <DATATYPE-DEFINITION-ENUMERATION>
          <IDENTIFIER>DT-ENUM-1</IDENTIFIER>
          <LONG-NAME>Created Thru</LONG-NAME>
          <SPECIFIED-VALUES>
            <ENUM-VALUE>
              <IDENTIFIER>EV-MANUAL</IDENTIFIER>
              <LONG-NAME>Manual Input</LONG-NAME>
            </ENUM-VALUE>
          </SPECIFIED-VALUES>
        </DATATYPE-DEFINITION-ENUMERATION>
      </DATATYPES>
      <SPEC-TYPES>
        <SPEC-TYPE>
          <IDENTIFIER>ST-1</IDENTIFIER>
          <SPEC-ATTRIBUTES>
            <ATTRIBUTE-DEFINITION-SIMPLE>
              <IDENTIFIER>AD-HEADING</IDENTIFIER>
              <LONG-NAME>Object Heading</LONG-NAME>
            </ATTRIBUTE-DEFINITION-SIMPLE>
            <ATTRIBUTE-DEFINITION-ENUMERATION>
              <IDENTIFIER>AD-CREATEDTHRU</IDENTIFIER>
              <LONG-NAME>Created Thru</LONG-NAME>
              <TYPE><DATATYPE-DEFINITION-ENUMERATION-REF>DT-ENUM-1</DATATYPE-DEFINITION-ENUMERATION-REF></TYPE>
            </ATTRIBUTE-DEFINITION-ENUMERATION>
            <ATTRIBUTE-DEFINITION-COMPLEX>
              <IDENTIFIER>AD-OBJECTTEXT</IDENTIFIER>
              <LONG-NAME>Object Text</LONG-NAME>
            </ATTRIBUTE-DEFINITION-COMPLEX>
          </SPEC-ATTRIBUTES>
        </SPEC-TYPE>
      </SPEC-TYPES>
      <SPEC-OBJECTS>
        <SPEC-OBJECT>
          <IDENTIFIER>_1_obj-with-heading</IDENTIFIER>
          <TYPE><SPEC-TYPE-REF>ST-1</SPEC-TYPE-REF></TYPE>
          <VALUES>
            <ATTRIBUTE-VALUE-SIMPLE>
              <DEFINITION><ATTRIBUTE-DEFINITION-SIMPLE-REF>AD-HEADING</ATTRIBUTE-DEFINITION-SIMPLE-REF></DEFINITION>
              <THE-VALUE>KAPSAM</THE-VALUE>
            </ATTRIBUTE-VALUE-SIMPLE>
            <ATTRIBUTE-VALUE-ENUMERATION>
              <DEFINITION><ATTRIBUTE-DEFINITION-ENUMERATION-REF>AD-CREATEDTHRU</ATTRIBUTE-DEFINITION-ENUMERATION-REF></DEFINITION>
              <VALUES><ENUM-VALUE-REF>EV-MANUAL</ENUM-VALUE-REF></VALUES>
            </ATTRIBUTE-VALUE-ENUMERATION>
            <ATTRIBUTE-VALUE-EMBEDDED-DOCUMENT>
              <DEFINITION><ATTRIBUTE-DEFINITION-COMPLEX-REF>AD-OBJECTTEXT</ATTRIBUTE-DEFINITION-COMPLEX-REF></DEFINITION>
              <XHTML-CONTENT><div></div></XHTML-CONTENT>
            </ATTRIBUTE-VALUE-EMBEDDED-DOCUMENT>
          </VALUES>
        </SPEC-OBJECT>
        <SPEC-OBJECT>
          <IDENTIFIER>_2_obj-body-only</IDENTIFIER>
          <TYPE><SPEC-TYPE-REF>ST-1</SPEC-TYPE-REF></TYPE>
          <VALUES>
            <ATTRIBUTE-VALUE-SIMPLE>
              <DEFINITION><ATTRIBUTE-DEFINITION-SIMPLE-REF>AD-HEADING</ATTRIBUTE-DEFINITION-SIMPLE-REF></DEFINITION>
              <THE-VALUE></THE-VALUE>
            </ATTRIBUTE-VALUE-SIMPLE>
            <ATTRIBUTE-VALUE-EMBEDDED-DOCUMENT>
              <DEFINITION><ATTRIBUTE-DEFINITION-COMPLEX-REF>AD-OBJECTTEXT</ATTRIBUTE-DEFINITION-COMPLEX-REF></DEFINITION>
              <XHTML-CONTENT><div>Sistem, fren mesafesini asgari seviyede tutmalidir.<br /></div></XHTML-CONTENT>
            </ATTRIBUTE-VALUE-EMBEDDED-DOCUMENT>
          </VALUES>
        </SPEC-OBJECT>
      </SPEC-OBJECTS>
      <SPEC-RELATIONS>
      </SPEC-RELATIONS>
    </RIF-CONTENT>
  </CORE-CONTENT>
</RIF>`;

test('R10: gercek IBM DOORS classic RIF 1.2 .xml exportu (child-element IDENTIFIER/LONG-NAME, SPEC-TYPE, ATTRIBUTE-DEFINITION-SIMPLE/COMPLEX) ice aktarilir', async () => {
  await cleanProject(proj.id);
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', Buffer.from(DOORS_RIF_XML, 'utf8'), { filename: 'doors-export.xml' });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.stats.importedRequirements, 2, JSON.stringify(res.body));

  const rows = await prisma.requirement.findMany({ where: { projectId: proj.id }, orderBy: { text_id: 'asc' } });
  assert.equal(rows.length, 2);

  const withHeading = rows.find((r) => r.title === 'KAPSAM');
  assert.ok(withHeading, `"KAPSAM" basligina sahip satir bulunamadi: ${JSON.stringify(rows.map((r) => r.title))}`);
  // "Created Thru" DATATYPES uzerinden dolayli cozulen bir ENUMERATION'dir
  // (gercek DOORS exportundaki desen) — ham GUID degil "Manual Input" beklenir.
  assert.equal(withHeading.attributes.created_thru, 'Manual Input', JSON.stringify(withHeading.attributes));
  // Bu nesnenin Object Text alani ICERIKSIZ bir XHTML sargisiydi
  // (<div></div>) — anlamsiz ham etiket aciklamaya SIZMAMALI, aciklama
  // tamamen bos kalmali (bkz. reqifParser.js isBlankHtml).
  assert.equal(
    withHeading.description,
    '',
    `Bos XHTML sargisi aciklamaya sizdi: ${JSON.stringify(withHeading.description)}`,
  );

  const bodyOnly = rows.find((r) => r.id !== withHeading.id);
  // Object Heading bos oldugunda ARTIK baslik UYDURULMAZ (ne "Req-xxxxx" ne
  // aciklamadan turetilmis bir ozet) — baslik gercekten BOS kalir; bu
  // nesne Gitsis'te de baslik'siz bir "aciklama gereksinimi" gibi davranir
  // (UI aciklamayi baslik yerine gosterir — bkz. getDisplayLabel).
  assert.equal(bodyOnly.title, '', `Baslik uydurulmamali: "${bodyOnly.title}"`);
  assert.ok(bodyOnly.description.includes('fren mesafesini'), JSON.stringify(bodyOnly.description));
});

test('R11: ad-alani onekli kok (<reqif:REQ-IF>) da taninir', async () => {
  await cleanProject(proj.id);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<reqif:REQ-IF xmlns:reqif="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
  <reqif:CORE-CONTENT>
    <reqif:REQ-IF-CONTENT>
      <reqif:SPEC-OBJECTS>
        <reqif:SPEC-OBJECT IDENTIFIER="NS-1" LONG-NAME="Namespaced object"/>
      </reqif:SPEC-OBJECTS>
      <reqif:SPEC-RELATIONS/>
    </reqif:REQ-IF-CONTENT>
  </reqif:CORE-CONTENT>
</reqif:REQ-IF>`;
  const res = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', Buffer.from(xml, 'utf8'), { filename: 'ns.reqif' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.stats.importedRequirements, 1);
});

// --- Kaynakta (DOORS/ReqIF) silinmis nesneler — "Gitsis'te de silinmis
// gibi davran" -------------------------------------------------------------
// TOOL-EXTENSIONS'in sarmalayici etiket adi kasitli olarak "RIF-TOOL-
// EXTENSION" DEGIL — reqifParser.js'nin bu adi artik SABIT BEKLEMEDIGINI
// (herhangi bir sarmalayici icindeki DELETED-OBJECTS'i ozyinelemeli
// bulabildigini) dogrulamak icin.
function doorsRifModuleWithDeletions({ objects, deletedIds = [] }) {
  const objectsXml = objects
    .map(
      (o) => `
        <SPEC-OBJECT>
          <IDENTIFIER>${o.id}</IDENTIFIER>
          <TYPE><SPEC-TYPE-REF>ST-1</SPEC-TYPE-REF></TYPE>
          <VALUES>
            <ATTRIBUTE-VALUE-SIMPLE>
              <DEFINITION><ATTRIBUTE-DEFINITION-SIMPLE-REF>AD-HEADING</ATTRIBUTE-DEFINITION-SIMPLE-REF></DEFINITION>
              <THE-VALUE>${o.title}</THE-VALUE>
            </ATTRIBUTE-VALUE-SIMPLE>
          </VALUES>
        </SPEC-OBJECT>`,
    )
    .join('');

  const deletionsXml =
    deletedIds.length > 0
      ? `
  <TOOL-EXTENSIONS>
    <SOME-VENDOR-SPECIFIC-EXTENSION>
      <DELETIONS>
        <DELETED-OBJECTS>
          ${deletedIds.map((id) => `<SPEC-OBJECT-REF>${id}</SPEC-OBJECT-REF>`).join('')}
        </DELETED-OBJECTS>
      </DELETIONS>
    </SOME-VENDOR-SPECIFIC-EXTENSION>
  </TOOL-EXTENSIONS>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<RIF xmlns="http://automotive-his.de/200807/rif">
  <CORE-CONTENT>
    <RIF-CONTENT>
      <SPEC-TYPES>
        <SPEC-TYPE>
          <IDENTIFIER>ST-1</IDENTIFIER>
          <SPEC-ATTRIBUTES>
            <ATTRIBUTE-DEFINITION-SIMPLE>
              <IDENTIFIER>AD-HEADING</IDENTIFIER>
              <LONG-NAME>Object Heading</LONG-NAME>
            </ATTRIBUTE-DEFINITION-SIMPLE>
          </SPEC-ATTRIBUTES>
        </SPEC-TYPE>
      </SPEC-TYPES>
      <SPEC-OBJECTS>${objectsXml}
      </SPEC-OBJECTS>
      <SPEC-RELATIONS>
      </SPEC-RELATIONS>
    </RIF-CONTENT>
  </CORE-CONTENT>${deletionsXml}
</RIF>`;
}

test('R12: kaynakta silinmis nesne gorunur kayit olusturmaz, numarasi emekliye ayrilir (tekrar ice aktarmada ikinci kez tuketilmez, sonraki canli kayitla CAKISMAZ)', async () => {
  await cleanProject(proj.id);

  const xml1 = doorsRifModuleWithDeletions({
    objects: [
      { id: 'LIVE-1', title: 'Live requirement' },
      { id: 'DEL-1', title: 'Deleted requirement' },
    ],
    deletedIds: ['DEL-1'],
  });
  const res1 = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .field('importType', 'User Requirement')
    .attach('file', Buffer.from(xml1, 'utf8'), { filename: 'retire1.xml' });
  assert.equal(res1.status, 200, JSON.stringify(res1.body));
  assert.equal(res1.body.stats.importedRequirements, 1, JSON.stringify(res1.body));
  assert.equal(res1.body.stats.retiredRequirements, 1, JSON.stringify(res1.body));

  const rowsAfter1 = await prisma.requirement.findMany({ where: { projectId: proj.id } });
  assert.equal(rowsAfter1.length, 1, 'silinmis nesne icin gorunur kayit OLUSMAMALI');
  assert.equal(rowsAfter1[0].title, 'Live requirement');

  const retiredAudit = await prisma.auditLog.findFirst({
    where: { projectId: proj.id, entityType: 'requirement-retired', newValue: 'DEL-1' },
  });
  assert.ok(retiredAudit, 'emekliye ayirma audit kaydi olusmali');
  assert.ok(retiredAudit.textId, 'emekliye ayrilan numara (text_id) kaydedilmeli');

  // Ayni dosyayi TEKRAR ice aktar — DEL-1 icin IKINCI bir numara TUKETILMEMELI.
  const res2 = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .field('importType', 'User Requirement')
    .attach('file', Buffer.from(xml1, 'utf8'), { filename: 'retire2.xml' });
  assert.equal(res2.status, 200, JSON.stringify(res2.body));
  assert.equal(res2.body.stats.retiredRequirements, 0, 'ayni silinmis nesne icin ikinci kez emekliye ayrilmamali');

  const retiredAuditRows = await prisma.auditLog.findMany({
    where: { projectId: proj.id, entityType: 'requirement-retired', newValue: 'DEL-1' },
  });
  assert.equal(retiredAuditRows.length, 1, 'tekrar ice aktarmada IKINCI bir emekli-numara kaydi olusmamali');

  // Yeni bir canli gereksinim ice aktar — emekliye ayrilmis numarayla CAKISMAMALI.
  const xml3 = doorsRifModuleWithDeletions({ objects: [{ id: 'LIVE-2', title: 'Another live requirement' }] });
  const res3 = await request(app)
    .post(`/api/projects/${proj.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .field('importType', 'User Requirement')
    .attach('file', Buffer.from(xml3, 'utf8'), { filename: 'retire3.xml' });
  assert.equal(res3.status, 200, JSON.stringify(res3.body));
  assert.equal(res3.body.stats.importedRequirements, 1, JSON.stringify(res3.body));

  const allRows = await prisma.requirement.findMany({ where: { projectId: proj.id } });
  assert.equal(allRows.length, 2, 'DEL-1 hicbir zaman gorunur bir kayda donusmemeli');
  const suffixOf = (t) => parseInt(String(t).split('-').pop(), 10);
  const liveSuffixes = allRows.map((r) => suffixOf(r.text_id));
  const retiredSuffix = suffixOf(retiredAudit.textId);
  assert.ok(!liveSuffixes.includes(retiredSuffix), 'emekli numara canli bir kayitta tekrar kullanilmamali');
});

test('R13: Gitsis -> ReqIF export -> (baska bir projeye) reimport dongusu KAYIPSIZ kapanir (baslik/aciklama/alan/yazar/oznitelik/Satisfies/Verifies)', async () => {
  await cleanProject(proj.id);

  const userReq = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'RT-USR-001',
      title: 'Coffee shall be hot',
      description: '<p>The coffee <b>must</b> be served above 80&nbsp;C.</p>',
      type: 'User Requirement',
      field: 'Thermal',
      author: 'kaan',
      attributes: { priority: 'High' },
      status: 'In Review',
    },
  });
  const sysReq = await prisma.requirement.create({
    data: {
      projectId: proj.id,
      text_id: 'RT-SYS-001',
      title: 'System shall heat water',
      description: 'Water shall reach target temperature within 60 seconds.',
      type: 'System Requirement',
      attributes: { priority: 'Medium', dal_level: 'DAL B' },
      status: 'In Review',
    },
  });
  const testCase = await prisma.testCase.create({
    data: {
      projectId: proj.id,
      text_id: 'RT-TC-ACC-001',
      title: 'Verify hot coffee',
      description: '<p>Measure temperature at dispense.</p>',
      type: 'Acceptance Test',
      attributes: {},
      status: 'In Review',
    },
  });
  const satisfiesLink = await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: userReq.id, toId: sysReq.id, type: 'Satisfies' },
  });
  const verifiesLink = await prisma.traceabilityLink.create({
    data: { projectId: proj.id, fromId: userReq.id, toId: testCase.id, type: 'Verifies' },
  });

  const xml = buildReqIF({
    projectName: 'Round Trip Test',
    requirements: [userReq, sysReq],
    testCases: [testCase],
    links: [satisfiesLink, verifiesLink],
  });

  // Farkli (bombos) bir projeye reimport et — asil sistemin (DOORS'un)
  // rolunu oynayan ARA adim atlanmis olsa da, Gitsis'in KENDI yazdigi
  // ReqIF'i KENDI okuyucusuyla dogru yorumladigini (round-trip'in HER IKI
  // ucunu da) dogrular.
  const target = await prisma.project.create({ data: { name: 'ReqIF Round Trip Target' } });
  const res = await request(app)
    .post(`/api/projects/${target.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', Buffer.from(xml, 'utf8'), { filename: 'roundtrip.reqif' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.stats.importedRequirements, 2, JSON.stringify(res.body));
  assert.equal(res.body.stats.importedTestCases, 1, JSON.stringify(res.body));
  assert.equal(res.body.stats.importedLinks, 2, JSON.stringify(res.body));

  const newUserReq = await prisma.requirement.findFirst({ where: { projectId: target.id, type: 'User Requirement' } });
  const newSysReq = await prisma.requirement.findFirst({ where: { projectId: target.id, type: 'System Requirement' } });
  const newTestCase = await prisma.testCase.findFirst({ where: { projectId: target.id } });

  assert.equal(newUserReq.title, 'Coffee shall be hot');
  assert.match(newUserReq.description, /must.*served above 80/);
  assert.equal(newUserReq.field, 'Thermal');
  assert.equal(newUserReq.author, 'kaan');
  assert.equal(newUserReq.attributes.priority, 'High');

  assert.equal(newSysReq.title, 'System shall heat water');
  assert.equal(newSysReq.attributes.priority, 'Medium');
  assert.equal(newSysReq.attributes.dal_level, 'DAL B');

  assert.equal(newTestCase.type, 'Acceptance Test');
  assert.equal(newTestCase.title, 'Verify hot coffee');

  const newSatisfies = await prisma.traceabilityLink.findFirst({
    where: { projectId: target.id, type: 'Satisfies', fromId: newUserReq.id, toId: newSysReq.id },
  });
  assert.ok(newSatisfies, 'Satisfies bagi round-trip sonrasi dogru yonde yeniden kurulmali');

  const newVerifies = await prisma.traceabilityLink.findFirst({
    where: { projectId: target.id, type: 'Verifies', fromId: newUserReq.id, toId: newTestCase.id },
  });
  assert.ok(newVerifies, 'Verifies bagi (Requirement -> TestCase) round-trip sonrasi yeniden kurulmali');

  // Kimlik capasi: ikinci kez AYNI dosyayi (ayni projeye) tekrar ice aktarinca
  // COGALTMAMALI — Gitsis.ForeignID uzerinden ayni kayitlar taninmali.
  const res2 = await request(app)
    .post(`/api/projects/${target.id}/traceability/import/reqif`)
    .set('Authorization', `Bearer ${pmToken}`)
    .attach('file', Buffer.from(xml, 'utf8'), { filename: 'roundtrip2.reqif' });
  assert.equal(res2.status, 200, JSON.stringify(res2.body));
  assert.equal(res2.body.stats.importedRequirements, 0, 'ikinci ice aktarmada YENI kayit olusmamali');
  assert.equal(res2.body.stats.updatedRequirements, 2, 'ikinci ice aktarmada MEVCUT kayitlar guncellenmeli');
  assert.equal(res2.body.stats.importedTestCases, 0);
  assert.equal(res2.body.stats.updatedTestCases, 1);

  const allReqsAfter2 = await prisma.requirement.findMany({ where: { projectId: target.id } });
  assert.equal(allReqsAfter2.length, 2, 'tekrar ice aktarma cogaltmamali');
});
