// ============================================================================
//  reqifExporter.js  —  Gitsis gereksinim/test verisini standart OMG ReqIF
//  1.0 XML'ine cevirir (DOORS Next'in yerlisi, DOORS classic'in "ReqIF
//  Exchange" eklentisiyle ice aktarabildigi format). reqifParser.js'in TAM
//  TERSI: parser hangi alanlari nasil okuyorsa, bu dosya AYNI adlarla yazar,
//  boylece Gitsis -> DOORS -> Gitsis dongusu (round-trip) KAYIPSIZ kapanir:
//
//   - Kimlik: her SPEC-OBJECT'in IDENTIFIER'i, nesne DAHA ONCE DOORS'tan ice
//     aktarildiysa ORIJINAL DOORS kimligini (attributes.reqifExternalId)
//     korur (DOORS'un "var olan nesneyi guncelle" eslestirmesi buna gore
//     calisir); Gitsis'te DOGRUDAN olusturulmus nesnelerde kararli bir
//     "GITSIS-REQ-<id>" degeri kullanilir. HER durumda, DOORS IDENTIFIER'i
//     degistirse/atsa bile kaybolmayacak bir IKINCI kararli capa olarak,
//     rezerve "ReqIF.ForeignID" alanina HER ZAMAN "GITSIS-REQ-<id>" yazilir
//     (reqifParser.js bunu zaten `foreignId` olarak okur; traceability.js'in
//     ice aktarma tarafinda IDENTIFIER eslesmesi kacirilsa bile ForeignID
//     uzerinden ayni kayda geri baglanir).
//   - Tip: her SPEC-OBJECT-TYPE'in LONG-NAME'i Gitsis'in KENDI tip adiyla
//     (orn. "System Requirement", "Acceptance Test") BIREBIR ayni yazilir;
//     REQ-IF-HEADER/SOURCE-TOOL-ID "Gitsis" olarak isaretlenir. Bu ikisi
//     birlikte, geri donen dosyada traceability.js'in her SPEC-OBJECT'i
//     DOGRU Gitsis varligina (Requirement/TestCase, dogru tip) otomatik
//     yonlendirmesini saglar (bkz. traceability.js resolveTarget) — bu
//     otomatik yonlendirme SADECE sourceToolId "Gitsis" ise devreye girer,
//     genel DOORS dosyalarinin yorumlanmasini ETKILEMEZ.
//   - Icerik: baslik ReqIF.Name (DT-STRING), aciklama ReqIF.Text (DT-XHTML,
//     gercek XHTML govde olarak, sadece duz metin degil — bicimlendirme
//     kaybolmaz). Alan/Yazar/oznitelik torbasi (priority, dal_level, projeye
//     ozel alanlar) Gitsis.Field / Gitsis.Author / Gitsis.Attr.<anahtar> adiyla
//     ayri STRING oznitelikleri olarak yazilir.
//   - Baglar: SATISFIES/VERIFIES TraceabilityLink'leri SPEC-RELATION olarak,
//     yalnizca HER IKI ucu da bu export'ta yer alan nesneler arasinda yazilir
//     (kapsam disi bir ucu olan bag, DOORS tarafinda "asili referans" olurdu).
// ============================================================================
import { REQ_TYPE, TEST_TYPE, LINK_TYPE } from './constants.js';

const REQ_TYPES_ORDER = [REQ_TYPE.USER, REQ_TYPE.SYSTEM, REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE];
const TEST_TYPES_ORDER = [TEST_TYPE.ACCEPTANCE, TEST_TYPE.SYSTEM, TEST_TYPE.SUBSYSTEM];

function escXmlAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escXmlText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// HTML editorunden (sanitize.js beyaz listesi) gelen isaretleme XML olarak
// GECERLI olacak sekilde neredeyse hazirdir (kapali etiketler, self-closing
// br/img) — tek istisna, XML'de ONCEDEN TANIMLI OLMAYAN adlandirilmis
// varliklar (&nbsp; gibi). Bunlar sayisal karakter referansina cevrilir;
// gercek yapisal etiketler DOKUNULMADAN (re-escape EDILMEDEN) birebir
// gomulur — aksi halde "<p>" gibi etiketler metin olarak ikinci kez
// escape'lenip DOORS'ta duz metin olarak gorunurdu.
const HTML_ENTITY_TO_NUMERIC = {
  '&nbsp;': '&#160;',
  '&mdash;': '&#8212;',
  '&ndash;': '&#8211;',
  '&hellip;': '&#8230;',
  '&rsquo;': '&#8217;',
  '&lsquo;': '&#8216;',
  '&rdquo;': '&#8221;',
  '&ldquo;': '&#8220;',
  '&copy;': '&#169;',
  '&trade;': '&#8482;',
  '&reg;': '&#174;',
};
function toXhtmlFragment(html) {
  const trimmed = String(html || '').trim();
  if (!trimmed) return '<xhtml:div/>';
  const fixed = trimmed.replace(/&[a-zA-Z]+;/g, (m) => HTML_ENTITY_TO_NUMERIC[m] || m);
  return `<xhtml:div>${fixed}</xhtml:div>`;
}

function slug(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Bir satirin (Requirement/TestCase) attributes JSONB torbasindaki, ozel
 * takip alanlari (reqifExternalId/reqifForeignId) DISINDAKI anahtarlarini
 * toplar — bunlar Gitsis.Attr.<anahtar> olarak export edilir. */
function collectAttrKeys(rows) {
  const keys = new Set();
  for (const r of rows) {
    for (const k of Object.keys(r.attributes || {})) {
      if (k === 'reqifExternalId' || k === 'reqifForeignId') continue;
      keys.add(k);
    }
  }
  return [...keys].sort();
}

function buildSpecObjectType(typeName, attrKeys) {
  const ts = slug(typeName);
  const ids = {
    type: `TYPE-${ts}`,
    name: `AD-${ts}-NAME`,
    text: `AD-${ts}-TEXT`,
    foreignId: `AD-${ts}-FOREIGNID`,
    field: `AD-${ts}-FIELD`,
    author: `AD-${ts}-AUTHOR`,
    attr: Object.fromEntries(attrKeys.map((k) => [k, `AD-${ts}-ATTR-${slug(k)}`])),
  };
  const attrDefsXml = attrKeys
    .map(
      (k) => `
        <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="${ids.attr[k]}" LONG-NAME="Gitsis.Attr.${escXmlAttr(k)}">
          <TYPE><DATATYPE-DEFINITION-STRING-REF>DT-STRING</DATATYPE-DEFINITION-STRING-REF></TYPE>
        </ATTRIBUTE-DEFINITION-STRING>`,
    )
    .join('');

  const xml = `
    <SPEC-OBJECT-TYPE IDENTIFIER="${ids.type}" LONG-NAME="${escXmlAttr(typeName)}">
      <SPEC-ATTRIBUTES>
        <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="${ids.name}" LONG-NAME="ReqIF.Name">
          <TYPE><DATATYPE-DEFINITION-STRING-REF>DT-STRING</DATATYPE-DEFINITION-STRING-REF></TYPE>
        </ATTRIBUTE-DEFINITION-STRING>
        <ATTRIBUTE-DEFINITION-XHTML IDENTIFIER="${ids.text}" LONG-NAME="ReqIF.Text">
          <TYPE><DATATYPE-DEFINITION-XHTML-REF>DT-XHTML</DATATYPE-DEFINITION-XHTML-REF></TYPE>
        </ATTRIBUTE-DEFINITION-XHTML>
        <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="${ids.foreignId}" LONG-NAME="ReqIF.ForeignID">
          <TYPE><DATATYPE-DEFINITION-STRING-REF>DT-STRING</DATATYPE-DEFINITION-STRING-REF></TYPE>
        </ATTRIBUTE-DEFINITION-STRING>
        <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="${ids.field}" LONG-NAME="Gitsis.Field">
          <TYPE><DATATYPE-DEFINITION-STRING-REF>DT-STRING</DATATYPE-DEFINITION-STRING-REF></TYPE>
        </ATTRIBUTE-DEFINITION-STRING>
        <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="${ids.author}" LONG-NAME="Gitsis.Author">
          <TYPE><DATATYPE-DEFINITION-STRING-REF>DT-STRING</DATATYPE-DEFINITION-STRING-REF></TYPE>
        </ATTRIBUTE-DEFINITION-STRING>${attrDefsXml}
      </SPEC-ATTRIBUTES>
    </SPEC-OBJECT-TYPE>`;

  return { ids, xml };
}

function buildSpecObject(row, ids, idOf) {
  const identifier = row.attributes?.reqifExternalId || idOf(row);
  const foreignId = idOf(row);
  const attrs = row.attributes || {};

  let valuesXml = `
        <ATTRIBUTE-VALUE-STRING THE-VALUE="${escXmlAttr(row.title || '')}">
          <DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>${ids.name}</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION>
        </ATTRIBUTE-VALUE-STRING>
        <ATTRIBUTE-VALUE-XHTML>
          <DEFINITION><ATTRIBUTE-DEFINITION-XHTML-REF>${ids.text}</ATTRIBUTE-DEFINITION-XHTML-REF></DEFINITION>
          <THE-VALUE>${toXhtmlFragment(row.description)}</THE-VALUE>
        </ATTRIBUTE-VALUE-XHTML>
        <ATTRIBUTE-VALUE-STRING THE-VALUE="${escXmlAttr(foreignId)}">
          <DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>${ids.foreignId}</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION>
        </ATTRIBUTE-VALUE-STRING>`;

  if (row.field) {
    valuesXml += `
        <ATTRIBUTE-VALUE-STRING THE-VALUE="${escXmlAttr(row.field)}">
          <DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>${ids.field}</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION>
        </ATTRIBUTE-VALUE-STRING>`;
  }
  if (row.author) {
    valuesXml += `
        <ATTRIBUTE-VALUE-STRING THE-VALUE="${escXmlAttr(row.author)}">
          <DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>${ids.author}</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION>
        </ATTRIBUTE-VALUE-STRING>`;
  }
  for (const [k, defId] of Object.entries(ids.attr)) {
    const v = attrs[k];
    if (v == null || v === '') continue;
    valuesXml += `
        <ATTRIBUTE-VALUE-STRING THE-VALUE="${escXmlAttr(String(v))}">
          <DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>${defId}</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION>
        </ATTRIBUTE-VALUE-STRING>`;
  }

  return `
    <SPEC-OBJECT IDENTIFIER="${escXmlAttr(identifier)}" LONG-NAME="${escXmlAttr(row.title || row.text_id)}">
      <VALUES>${valuesXml}
      </VALUES>
      <TYPE><SPEC-OBJECT-TYPE-REF>${ids.type}</SPEC-OBJECT-TYPE-REF></TYPE>
    </SPEC-OBJECT>`;
}

/**
 * Requirement/TestCase satirlarindan tam bir ReqIF 1.0 XML belgesi uretir.
 * @param {{ projectName: string, requirements: object[], testCases: object[], links: object[] }} args
 * @returns {string} XML metni
 */
export function buildReqIF({ projectName, requirements = [], testCases = [], links = [] }) {
  const now = new Date().toISOString();
  const headerId = `GITSIS-EXPORT-${Date.now()}`;

  const reqIdOf = (r) => `GITSIS-REQ-${r.id}`;
  const testIdOf = (t) => `GITSIS-TEST-${t.id}`;

  // Bu export'ta FIILEN kullanilan tipler (yalnizca dolu olanlar icin
  // SPEC-OBJECT-TYPE uretilir — bos bir katman gereksiz karmasiklik katar).
  const presentReqTypes = REQ_TYPES_ORDER.filter((t) => requirements.some((r) => r.type === t));
  const presentTestTypes = TEST_TYPES_ORDER.filter((t) => testCases.some((r) => r.type === t));

  const reqAttrKeys = collectAttrKeys(requirements);
  const testAttrKeys = collectAttrKeys(testCases);

  const typeDefs = new Map(); // typeName -> { ids, xml }
  for (const t of presentReqTypes) typeDefs.set(t, buildSpecObjectType(t, reqAttrKeys));
  for (const t of presentTestTypes) typeDefs.set(t, buildSpecObjectType(t, testAttrKeys));

  const specObjectsXml = [
    ...requirements.map((r) => buildSpecObject(r, typeDefs.get(r.type).ids, reqIdOf)),
    ...testCases.map((t) => buildSpecObject(t, typeDefs.get(t.type).ids, testIdOf)),
  ].join('');

  // Kimlik -> IDENTIFIER haritasi (SPEC-RELATIONS/SPEC-HIERARCHY icin) —
  // DOORS'tan gelmis bir nesnenin export'taki IDENTIFIER'i orijinal
  // reqifExternalId'i koruyabilir (bkz. buildSpecObject), bu yuzden
  // referanslar da AYNI mantikla cozulmelidir.
  const reqIdentifier = new Map(requirements.map((r) => [r.id, r.attributes?.reqifExternalId || reqIdOf(r)]));
  const testIdentifier = new Map(testCases.map((t) => [t.id, t.attributes?.reqifExternalId || testIdOf(t)]));

  // --- SPEC-RELATIONS: sadece HER IKI ucu da bu export'ta bulunan bag ------
  const relTypeUsed = new Set();
  const relationsXml = links
    .map((l) => {
      let sourceId, targetId, typeName, typeRef;
      if (l.type === LINK_TYPE.SATISFIES) {
        sourceId = reqIdentifier.get(l.fromId);
        targetId = reqIdentifier.get(l.toId);
        typeName = 'Satisfies';
        typeRef = 'TYPE-SATISFIES';
      } else if (l.type === LINK_TYPE.VERIFIES) {
        sourceId = reqIdentifier.get(l.fromId);
        targetId = testIdentifier.get(l.toId);
        typeName = 'Verifies';
        typeRef = 'TYPE-VERIFIES';
      } else {
        return ''; // Assigned To (Glossary) bu export kapsaminda degil.
      }
      if (!sourceId || !targetId) return ''; // bir ucu bu export'ta yok — asili referans birakma.
      relTypeUsed.add(typeRef + '|' + typeName);
      return `
    <SPEC-RELATION IDENTIFIER="GITSIS-LINK-${escXmlAttr(l.id)}">
      <TYPE><SPEC-RELATION-TYPE-REF>${typeRef}</SPEC-RELATION-TYPE-REF></TYPE>
      <SOURCE><SPEC-OBJECT-REF>${escXmlAttr(sourceId)}</SPEC-OBJECT-REF></SOURCE>
      <TARGET><SPEC-OBJECT-REF>${escXmlAttr(targetId)}</SPEC-OBJECT-REF></TARGET>
    </SPEC-RELATION>`;
    })
    .join('');

  const relationTypesXml = [...relTypeUsed]
    .map((k) => {
      const [ref, name] = k.split('|');
      return `
    <SPEC-RELATION-TYPE IDENTIFIER="${ref}" LONG-NAME="${escXmlAttr(name)}"/>`;
    })
    .join('');

  // --- SPECIFICATIONS: bir katman (layer) basina bir modul, PBS parentId
  // ile AYNI-katman ic ice yerlesimi (nesting) korunur; farkli-katman ebeveyni
  // olan (veya ebeveyni yok) kokler o katmanin modulunun ust seviyesindedir.
  function buildHierarchy(rows, identifierOf) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const childrenOf = new Map();
    const roots = [];
    for (const r of rows) {
      const parentInSameLayer = r.parentId && byId.has(r.parentId) ? r.parentId : null;
      if (parentInSameLayer) {
        if (!childrenOf.has(parentInSameLayer)) childrenOf.set(parentInSameLayer, []);
        childrenOf.get(parentInSameLayer).push(r);
      } else {
        roots.push(r);
      }
    }
    function node(r) {
      const kids = childrenOf.get(r.id) || [];
      const childrenXml = kids.map(node).join('');
      return `
      <SPEC-HIERARCHY IDENTIFIER="GITSIS-NODE-${escXmlAttr(r.id)}">
        <OBJECT><SPEC-OBJECT-REF>${escXmlAttr(identifierOf(r))}</SPEC-OBJECT-REF></OBJECT>${
          childrenXml ? `\n        <CHILDREN>${childrenXml}\n        </CHILDREN>` : ''
        }
      </SPEC-HIERARCHY>`;
    }
    return roots.map(node).join('');
  }

  const specificationsXml = [
    ...presentReqTypes.map((t) => {
      const rows = requirements.filter((r) => r.type === t);
      const identifierOf = (r) => r.attributes?.reqifExternalId || reqIdOf(r);
      return `
    <SPECIFICATION IDENTIFIER="SPEC-${slug(t)}" LONG-NAME="${escXmlAttr(t)}">
      <CHILDREN>${buildHierarchy(rows, identifierOf)}
      </CHILDREN>
    </SPECIFICATION>`;
    }),
    ...presentTestTypes.map((t) => {
      const rows = testCases.filter((r) => r.type === t);
      const identifierOf = (r) => r.attributes?.reqifExternalId || testIdOf(r);
      const flatXml = rows
        .map(
          (r) => `
      <SPEC-HIERARCHY IDENTIFIER="GITSIS-NODE-${escXmlAttr(r.id)}">
        <OBJECT><SPEC-OBJECT-REF>${escXmlAttr(identifierOf(r))}</SPEC-OBJECT-REF></OBJECT>
      </SPEC-HIERARCHY>`,
        )
        .join('');
      return `
    <SPECIFICATION IDENTIFIER="SPEC-${slug(t)}" LONG-NAME="${escXmlAttr(t)}">
      <CHILDREN>${flatXml}
      </CHILDREN>
    </SPECIFICATION>`;
    }),
  ].join('');

  const specObjectTypesXml = [...typeDefs.values()].map((d) => d.xml).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <THE-HEADER>
    <REQ-IF-HEADER IDENTIFIER="${headerId}">
      <COMMENT>Gitsis DO-178C Requirements Management araci tarafindan export edildi.</COMMENT>
      <CREATION-TIME>${now}</CREATION-TIME>
      <REQ-IF-TOOL-ID>Gitsis</REQ-IF-TOOL-ID>
      <REQ-IF-VERSION>1.0</REQ-IF-VERSION>
      <SOURCE-TOOL-ID>Gitsis</SOURCE-TOOL-ID>
      <TITLE>${escXmlText(projectName || 'Gitsis Project')}</TITLE>
    </REQ-IF-HEADER>
  </THE-HEADER>
  <CORE-CONTENT>
    <REQ-IF-CONTENT>
      <DATATYPES>
        <DATATYPE-DEFINITION-STRING IDENTIFIER="DT-STRING" LONG-NAME="String" MAX-LENGTH="32000"/>
        <DATATYPE-DEFINITION-XHTML IDENTIFIER="DT-XHTML" LONG-NAME="XHTML"/>
      </DATATYPES>
      <SPEC-TYPES>${specObjectTypesXml}${relationTypesXml}
      </SPEC-TYPES>
      <SPEC-OBJECTS>${specObjectsXml}
      </SPEC-OBJECTS>
      <SPEC-RELATIONS>${relationsXml}
      </SPEC-RELATIONS>
      <SPECIFICATIONS>${specificationsXml}
      </SPECIFICATIONS>
    </REQ-IF-CONTENT>
  </CORE-CONTENT>
</REQ-IF>
`;
}
