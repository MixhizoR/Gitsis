// ============================================================================
//  reqifParser.js  —  ReqIF (OMG "Requirements Interchange Format") VE onceli
//  RIF (HIS "Requirements Interchange Format" 1.2) ayristirici.
//
//  IKI FARKLI SEMA, IKI FARKLI SOZDIZIMI:
//   - ReqIF (standart): IDENTIFIER/LONG-NAME birer XML ATTRIBUTE'tur
//     (<SPEC-OBJECT IDENTIFIER="..." LONG-NAME="...">), kok <REQ-IF>
//     <CORE-CONTENT><REQ-IF-CONTENT>, tipler SPEC-OBJECT-TYPE/
//     ATTRIBUTE-DEFINITION-STRING/XHTML altinda.
//   - IBM DOORS classic'in urettigi RIF 1.2 ".xml" exportu: IDENTIFIER/
//     LONG-NAME birer CHILD ELEMENT'tir (<SPEC-OBJECT><IDENTIFIER>...
//     </IDENTIFIER>...), kok <RIF><CORE-CONTENT><RIF-CONTENT>, tipler
//     SPEC-TYPE/ATTRIBUTE-DEFINITION-SIMPLE (String/Integer/Date birlesik)/
//     ATTRIBUTE-DEFINITION-COMPLEX (rich text) altinda, deger konteynerleri
//     ATTRIBUTE-VALUE-SIMPLE/ATTRIBUTE-VALUE-EMBEDDED-DOCUMENT (icerik
//     THE-VALUE yerine XHTML-CONTENT'te).
//
//  Bu dosya HER IKI sozdizimini de tek bir gecirimli (generic) mantikla
//  cozer: IDENTIFIER/LONG-NAME hem @_IDENTIFIER hem IDENTIFIER child'indan
//  okunur (getId/getLongName); DEFINITION/TYPE referanslari sabit anahtar
//  yerine "-REF" ile biten HERHANGI bir alt anahtardan okunur (anyRef);
//  deger konteynerleri sabit bir listeye guvenmez, VALUES altindaki TUM
//  "ATTRIBUTE-VALUE-*" anahtarlari tarar. Boylece hangi araç/sema
//  varyasyonu gelirse gelsin (DOORS classic, DOORS NG, Polarion, Jama,
//  Cameo, ...) ayni kod calisir.
//
//  Girdi: .reqif/.reqifz(cikartilmis)/.xml icerigi (string). ZIP acma islemi
//  zipUtil.js'de; bu dosya SADECE XML->model donusumunu yapar (saf, DB'siz).
//
//  Baslik/aciklama tespiti best-practice sirasi:
//   1) Once STANDART rezerve ReqIF adlari (ReqIF.Name, ReqIF.Text,
//      ReqIF.ChapterName, ReqIF.ForeignID).
//   2) Sonra arac-ozel bulanik (fuzzy) anahtar kelime eslestirmesi (orn.
//      DOORS'ta "Object Heading" / "Object Text" / "Object Number").
//   3) Baslik hala bossa (DOORS'ta cogu satir-ici madde Object Heading
//      tasimaz) aciklamanin ilk ~80 karakteri baslik olarak kullanilir.
//  ENUMERATION degerleri DATATYPES'teki SPECIFIED-VALUES (dolayli, ReqIF)
//  VEYA oznitelik tanimin kendi icindeki SPECIFIED-VALUES (dogrudan, bazi
//  RIF ciktilari) ile cozulur. Baslik/aciklama disinda kalan HER oznitelik
//  kaybolmadan customAttributes torbasina (slug anahtarla) yazilir.
//  DOORS'un "silindi ama export'ta tombstone olarak kaldi" isaretledigi
//  nesneler (TOOL-EXTENSIONS/.../DELETIONS/DELETED-OBJECTS) ice aktarima
//  dahil edilmez.
// ============================================================================
import { XMLParser } from 'fast-xml-parser';

// Performans icin bilinen coklu-tekrar eden etiketler — DOGRULUK bu listeye
// BAGLI DEGIL: asArray() asagida her erisimde tek/coklu farkini kendisi
// normalize eder, bu yuzden burada unutulan bir etiket artik sessizce veri
// kaybina yol acmaz.
const ARRAY_TAGS = new Set([
  'SPEC-OBJECT',
  'SPEC-RELATION',
  'SPEC-OBJECT-TYPE',
  'SPEC-TYPE',
  'SPEC-RELATION-TYPE',
  'ATTRIBUTE-DEFINITION-STRING',
  'ATTRIBUTE-DEFINITION-XHTML',
  'ATTRIBUTE-DEFINITION-ENUMERATION',
  'ATTRIBUTE-DEFINITION-INTEGER',
  'ATTRIBUTE-DEFINITION-REAL',
  'ATTRIBUTE-DEFINITION-DATE',
  'ATTRIBUTE-DEFINITION-BOOLEAN',
  'ATTRIBUTE-DEFINITION-SIMPLE',
  'ATTRIBUTE-DEFINITION-COMPLEX',
  'ATTRIBUTE-VALUE-STRING',
  'ATTRIBUTE-VALUE-XHTML',
  'ATTRIBUTE-VALUE-ENUMERATION',
  'ATTRIBUTE-VALUE-INTEGER',
  'ATTRIBUTE-VALUE-REAL',
  'ATTRIBUTE-VALUE-DATE',
  'ATTRIBUTE-VALUE-BOOLEAN',
  'ATTRIBUTE-VALUE-SIMPLE',
  'ATTRIBUTE-VALUE-EMBEDDED-DOCUMENT',
  'DATATYPE-DEFINITION-ENUMERATION',
  'ENUM-VALUE',
  'ENUM-VALUE-REF',
  'RIF-TOOL-EXTENSION',
]);

// fast-xml-parser tek-esli bir etiketi (isArray'de listelenmemisse) duz
// nesne olarak doner; coklu-esli oldugunda dizi olur. Bu fark, isArray
// listesinde unutulan HERHANGI bir etiketi sessiz veri kaybina cevirir.
// asArray() bu farki her erisim noktasinda ortadan kaldirir.
function asArray(x) {
  if (x == null || x === '') return [];
  return Array.isArray(x) ? x : [x];
}

// IDENTIFIER hem XML ATTRIBUTE (@_IDENTIFIER, ReqIF) hem CHILD ELEMENT
// (IDENTIFIER, DOORS RIF) olarak gelebilir.
function getId(node) {
  if (!node || typeof node !== 'object') return null;
  const v = node['@_IDENTIFIER'] ?? node['IDENTIFIER'];
  return typeof v === 'object' ? v?.['#text'] : v;
}
function getLongName(node) {
  if (!node || typeof node !== 'object') return null;
  const v = node['@_LONG-NAME'] ?? node['LONG-NAME'];
  return typeof v === 'object' ? v?.['#text'] : v;
}

// DEFINITION/TYPE/SOURCE/TARGET gibi "sarmalayici" bir dugumun icindeki
// referansi, TAM anahtar adini bilmeden bulur: adi "-REF" ile biten ILK
// alt anahtarin degeri (metin ya da {#text} nesnesi) — boylece
// ATTRIBUTE-DEFINITION-STRING-REF / -SIMPLE-REF / -ENUMERATION-REF /
// SPEC-OBJECT-TYPE-REF / SPEC-TYPE-REF / ... hepsi AYNI kodla cozulur.
function anyRef(wrapper) {
  if (!wrapper || typeof wrapper !== 'object') return null;
  for (const [k, v] of Object.entries(wrapper)) {
    if (!k.endsWith('-REF')) continue;
    const first = Array.isArray(v) ? v[0] : v;
    return typeof first === 'object' ? (first?.['#text'] ?? first?.['@_IDENTIFIER'] ?? null) : first;
  }
  return null;
}

/**
 * XHTML/rich-text nesnesini (fast-xml-parser ciktisi) tekrar HTML string'e
 * cevirir. Beyaz listedeki etiketler korunur; digerleri (script, style,
 * ad-alani onekleri removeNSPrefix ile zaten temizlenmis olur) yok sayilir,
 * icerikleri yine de serialize edilir.
 */
function serializeXHTML(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    return node.map(serializeXHTML).filter(Boolean).join('');
  }
  if (typeof node === 'object') {
    if (node['#text'] != null) {
      return String(node['#text']);
    }
    const allowedTags = new Set([
      'p', 'b', 'i', 'u', 'strong', 'em', 'span', 'div', 'br', 'ul', 'ol', 'li', 'font', 'img', 'a',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre', 'hr', 'sub', 'sup',
    ]);
    let html = '';
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith('@_')) continue;
      if (key === '#text') continue;
      if (allowedTags.has(key)) {
        const attrs = Object.entries(node)
          .filter(([k]) => k.startsWith('@_'))
          .map(([k, v]) => `${k.slice(2)}="${v}"`)
          .join(' ');
        const attrStr = attrs ? ` ${attrs}` : '';
        const selfClosing = ['br', 'hr', 'img'].includes(key);
        if (selfClosing) {
          html += `<${key}${attrStr} />`;
        } else {
          const inner = serializeXHTML(val);
          html += `<${key}${attrStr}>${inner}</${key}>`;
        }
      } else {
        html += serializeXHTML(val);
      }
    }
    return html;
  }
  return '';
}

// Etiketleri sokup icerik kalip kalmadigina bakar — "<div></div>",
// "<div><br /></div>" gibi ICERIKSIZ zengin-metin sargilarini (bos DOORS
// Object Text alanlarinda cok sik gorulur) tespit etmek icindir. Yalnizca
// BOS/dolgu tespiti icin kullanilir, degeri DEGISTIRMEZ — bu yuzden metin
// icinde nadiren gecen ham "<" karakteri bile en kotu ihtimalle sadece bu
// kontrolu yanlis yonlendirir, saklanan veriyi bozmaz.
function isBlankHtml(html) {
  return !String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, '')
    .trim();
}

// --- Reserved ReqIF isimleri (standart — arac-bagimsiz) --------------------
const RESERVED_TITLE = new Set(['reqif.chaptername', 'reqif.name']);
const RESERVED_DESC = new Set(['reqif.text']);
const RESERVED_FOREIGN_ID = new Set(['reqif.foreignid']);

// --- Arac-ozel (DOORS ve benzeri) bulanik eslestirme anahtar kelimeleri ----
const FUZZY_TITLE = ['heading', 'title', 'name', 'header', 'chapter', 'summary', 'short text', 'object short'];
const FUZZY_DESC = ['text', 'desc', 'body', 'content', 'statement', 'rationale', 'detail'];
const FUZZY_FOREIGN_ID = ['object number', 'object identifier', 'legacy id', 'doors id', 'foreign id'];
const FUZZY_TYPE_FIELD = ['type', 'level', 'category', 'kategori', 'seviye', 'requirement type'];

function slugify(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function matchesAny(haystack, needles) {
  return needles.some((n) => haystack.includes(n));
}

function detectTypeHint(value) {
  const v = String(value || '').toLowerCase();
  if (!v) return null;
  if (/hardware|donan[ıi]m/.test(v)) return 'hardware';
  if (/software|yaz[ıi]l[ıi]m/.test(v)) return 'software';
  // "system" alt dizesi "subsystem"/"sub-system" icinde de gecer; once onlari elemek gerekir.
  if (/sub[\s-]?system|alt\s*sistem/.test(v)) return null;
  if (/system|sistem/.test(v)) return 'system';
  if (/user|kullan[ıi]c[ıi]/.test(v)) return 'user';
  return null;
}

export function parseReqIF(xmlContent) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: true,
    parseTagValue: false,
    // Bazi araclar koku ad-alani ONEKIYLE yazar (orn. <reqif:REQ-IF
    // xmlns:reqif="...">, <rif-xhtml:div>) — bu, prefix'i atip sade etiket
    // adina indirger ki asagidaki sabit yol aramasi hem onek'siz (yaygin)
    // hem onekli ciktilarda calissin.
    removeNSPrefix: true,
    isArray: (name) => ARRAY_TAGS.has(name),
  });

  let parsed;
  try {
    parsed = parser.parse(xmlContent);
  } catch (e) {
    throw new Error(`XML ayristirilamadi: ${e.message}`);
  }

  // Kok: ReqIF <REQ-IF><CORE-CONTENT><REQ-IF-CONTENT>, ya da DOORS classic
  // RIF 1.2 <RIF><CORE-CONTENT><RIF-CONTENT> (ikisi de CORE-CONTENT
  // sargili — RIF'in "sargisiz" oldugu varsayimi yanlisti, gercek DOORS
  // exportlari da ReqIF ile ayni iskeleti kullanir, sadece RIF-CONTENT
  // adiyla). Nadiren sargisiz bir RIF varyanti icin dogrudan <RIF> de
  // son care olarak denenir.
  const rifRoot = parsed?.['REQ-IF'] || parsed?.['RIF'];
  const coreContent =
    parsed?.['REQ-IF']?.['CORE-CONTENT']?.['REQ-IF-CONTENT'] ||
    parsed?.['RIF']?.['CORE-CONTENT']?.['RIF-CONTENT'] ||
    parsed?.['RIF'];
  if (!coreContent) {
    const rootKeys = Object.keys(parsed || {}).filter((k) => !k.startsWith('?'));
    const rootHint = rootKeys.length > 0 ? ` (dosyanin kok etiketi: "${rootKeys[0]}")` : '';
    throw new Error(`Gecersiz ReqIF/RIF formatı: REQ-IF-CONTENT/RIF-CONTENT bulunamadı${rootHint}.`);
  }

  // 0. DOORS "silindi ama export'ta tombstone olarak kaldi" nesneleri —
  // bunlar SPEC-OBJECTS icinde fiziksel olarak hala goruluyor ama artik
  // DOORS modulunde yok. TOOL-EXTENSIONS'in sarmalayici etiket adi arac/
  // format'a gore degisir (RIF-TOOL-EXTENSION for .xml exports, farkli bir
  // ad gercek .reqif exportlarinda kullanilabilir) — bu yuzden sabit bir ad
  // yerine TOOL-EXTENSIONS altini herhangi bir derinlikte "DELETED-OBJECTS"
  // anahtari icin ozyinelemeli (recursive) tarar.
  const deletedIds = new Set();
  (function findDeletedObjectRefs(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) findDeletedObjectRefs(item);
      return;
    }
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith('@_') || key === '#text') continue;
      if (key === 'DELETED-OBJECTS') {
        for (const ref of asArray(val?.['SPEC-OBJECT-REF'])) {
          const id = typeof ref === 'object' ? ref?.['#text'] : ref;
          if (id) deletedIds.add(id);
        }
        continue;
      }
      findDeletedObjectRefs(val);
    }
  })(rifRoot?.['TOOL-EXTENSIONS']);

  // 1. DATATYPES: ENUMERATION deger haritalari (enumValueId -> okunabilir metin)
  const enumDatatypeMap = new Map(); // datatypeId -> Map(enumValueId -> longName)
  for (const dt of asArray(coreContent?.['DATATYPES']?.['DATATYPE-DEFINITION-ENUMERATION'])) {
    const id = getId(dt);
    if (!id) continue;
    const values = new Map();
    for (const ev of asArray(dt?.['SPECIFIED-VALUES']?.['ENUM-VALUE'])) {
      const evId = getId(ev);
      const evName = getLongName(ev) || evId;
      if (evId) values.set(evId, evName);
    }
    enumDatatypeMap.set(id, values);
  }

  // 2. SPEC-TYPES: oznitelik tanimlarini haritalandir (id -> { name, datatypeId }).
  // Kapsayici etiket ReqIF'te SPEC-OBJECT-TYPE, DOORS RIF'te SPEC-TYPE'tir;
  // ikisi de taranir. Alt oznitelik-tanimi etiketleri de araca gore degisir
  // (STRING/XHTML/... vs SIMPLE/COMPLEX/...) — bu yuzden "ATTRIBUTE-
  // DEFINITION-" ile baslayan HER alt anahtar generic islenir.
  const attrDefMap = new Map();
  const specTypeContainers = [
    ...asArray(coreContent?.['SPEC-TYPES']?.['SPEC-OBJECT-TYPE']),
    ...asArray(coreContent?.['SPEC-TYPES']?.['SPEC-TYPE']),
  ];
  for (const type of specTypeContainers) {
    const attrs = type?.['SPEC-ATTRIBUTES'];
    if (!attrs || typeof attrs !== 'object') continue;
    for (const [tagName, raw] of Object.entries(attrs)) {
      if (!tagName.startsWith('ATTRIBUTE-DEFINITION-')) continue;
      for (const def of asArray(raw)) {
        const id = getId(def);
        if (!id) continue;
        const name = getLongName(def) || id;
        const datatypeId = anyRef(def?.['TYPE']);
        // Bazi ciktilarda (RIF varyantlari) ENUMERATION tanimi ayri bir
        // DATATYPES kaydina REF ile degil, SPECIFIED-VALUES'i DOGRUDAN
        // kendi icinde tasir — boyle bir durumda degerleri oznitelik
        // tanimin KENDI id'si altinda da kaydederiz.
        const inlineSpecified = def?.['SPECIFIED-VALUES']?.['ENUM-VALUE'];
        if (inlineSpecified) {
          const values = new Map();
          for (const ev of asArray(inlineSpecified)) {
            const evId = getId(ev);
            const evName = getLongName(ev) || evId;
            if (evId) values.set(evId, evName);
          }
          enumDatatypeMap.set(id, values);
        }
        attrDefMap.set(id, { name, datatypeId });
      }
    }
  }

  // 3. SPEC-RELATION-TYPE: iliski tipi adlarini haritalandir (id -> longName)
  const relationTypeMap = new Map();
  for (const rt of asArray(coreContent?.['SPEC-TYPES']?.['SPEC-RELATION-TYPE'])) {
    const id = getId(rt);
    if (id) relationTypeMap.set(id, getLongName(rt) || id);
  }

  // --- Bir SPEC-OBJECT'in VALUES altindaki TUM "ATTRIBUTE-VALUE-*"
  //     konteynerlerini generic tarar (hangi alt-tip olursa olsun).
  function resolveFields(valuesNode) {
    const fields = []; // [{ defName, defId, value }]
    if (!valuesNode || typeof valuesNode !== 'object') return fields;

    for (const [tagName, raw] of Object.entries(valuesNode)) {
      if (!tagName.startsWith('ATTRIBUTE-VALUE-')) continue;

      for (const val of asArray(raw)) {
        const defId = anyRef(val?.['DEFINITION']);
        const def = attrDefMap.get(defId);
        const name = def?.name || defId || '';

        if (tagName === 'ATTRIBUTE-VALUE-ENUMERATION') {
          const enumMap = (def?.datatypeId && enumDatatypeMap.get(def.datatypeId)) || enumDatatypeMap.get(defId) || null;
          const resolved = asArray(val?.['VALUES']?.['ENUM-VALUE-REF'])
            .map((r) => {
              const refId = typeof r === 'object' ? r?.['#text'] : r;
              return (enumMap && enumMap.get(refId)) || refId;
            })
            .filter(Boolean);
          if (resolved.length > 0) fields.push({ defName: name, defId, value: resolved.join(', ') });
          continue;
        }

        // Diger tum deger tipleri: icerik ya @_THE-VALUE/THE-VALUE
        // (ReqIF STRING/XHTML/INTEGER/..., DOORS RIF SIMPLE) ya da
        // XHTML-CONTENT (DOORS RIF EMBEDDED-DOCUMENT, zengin metin) altinda.
        let raw2 = val?.['@_THE-VALUE'] ?? val?.['THE-VALUE'];
        if (raw2 == null && val?.['XHTML-CONTENT'] != null) raw2 = val['XHTML-CONTENT'];
        if (raw2 == null) continue;
        const value = typeof raw2 === 'object' ? serializeXHTML(raw2) : String(raw2).trim();
        // "<div></div>", "<div><br /></div>" gibi ICERIKSIZ zengin-metin
        // sargilari (bos DOORS Object Text alanlarinda cok yaygin) alan
        // olarak KAYDEDILMEZ — aksi halde bu ham etiketler baslik/aciklamaya
        // rastgele "artifact" olarak sizar.
        if (value && !isBlankHtml(value)) fields.push({ defName: name, defId, value });
      }
    }

    return fields;
  }

  function classifyFields(fields) {
    let title = '';
    let description = '';
    let foreignId = null;
    let typeHint = null;
    const customAttributes = {};

    for (const { defName, value } of fields) {
      const lower = defName.toLowerCase();
      const isReservedTitle = RESERVED_TITLE.has(lower);
      const isReservedDesc = RESERVED_DESC.has(lower);
      const isReservedForeignId = RESERVED_FOREIGN_ID.has(lower);
      const isFuzzyTitle = !isReservedDesc && matchesAny(lower, FUZZY_TITLE);
      const isFuzzyDesc = matchesAny(lower, FUZZY_DESC);
      const isFuzzyForeignId = matchesAny(lower, FUZZY_FOREIGN_ID);
      const isTypeField = matchesAny(lower, FUZZY_TYPE_FIELD);

      if (isTypeField && !typeHint) {
        typeHint = detectTypeHint(value);
      }

      if (isReservedTitle || (!title && isFuzzyTitle && !isReservedDesc)) {
        title = value;
        continue;
      }
      if (isReservedDesc || (isFuzzyDesc && !isReservedTitle)) {
        description = description ? `${description}\n${value}` : value;
        continue;
      }
      if (isReservedForeignId || isFuzzyForeignId) {
        foreignId = value;
        continue;
      }
      // Kalan her oznitelik kaybolmadan saklanir (Bilgi Kaybi Yok ilkesi).
      const key = slugify(defName);
      if (key) customAttributes[key] = value;
    }

    return { title, description, foreignId, typeHint, customAttributes };
  }

  // 4. SPEC-OBJECTS (Gereksinimler) Çözümleme — DOORS'un "tombstone" olarak
  // isaretledigi (deletedIds) nesneler burada ELENMEZ, `isDeleted: true`
  // ile ISARETLENIR. Cagiran taraf (traceability.js) bunlari Gitsis'in
  // KENDI silme akisiyla ayni sekilde ele alir: numarasini emekliye ayirir
  // (bir daha asla kullanilmaz) ama GORUNUR bir kayit olusturmaz — tipki
  // projede gercekten silinmis bir gereksinim gibi.
  const rawObjects = asArray(coreContent?.['SPEC-OBJECTS']?.['SPEC-OBJECT']).filter((obj) => getId(obj));
  const requirements = rawObjects.map((obj) => {
    const reqId = getId(obj);
    const fields = resolveFields(obj?.['VALUES']);
    const { title: rawTitle, description, foreignId, typeHint, customAttributes } = classifyFields(fields);
    const cleanDesc = description.trim();

    // Baslik ARTIK ZORUNLU DEGIL (Requirement.title @default("")) — kaynakta
    // gercek bir baslik alani (ReqIF.Name, Object Heading, ...) yoksa BURADA
    // UYDURULMAZ (eskiden aciklamadan bir ozet ya da "Req-xxxxx" turetilirdi).
    // Boyle bir nesne, Gitsis'te de elle olusturulmus baslik'siz bir
    // gereksinim gibi davranir: UI, baslik yerine aciklamayi gosterir (bkz.
    // frontend/src/utils/format.js getDisplayLabel). Baslik HER ZAMAN duz
    // metin olmalidir — kaynak nesnede baslik olarak eslesen alan (nadiren)
    // XHTML/zengin-metin tipinde olsa bile ham HTML etiketleri temizlenir.
    const title = (rawTitle || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      externalId: reqId,
      title,
      description: cleanDesc,
      foreignId,
      typeHint, // 'user' | 'system' | 'software' | 'hardware' | null
      customAttributes,
      isDeleted: deletedIds.has(reqId),
    };
  });

  // 5. SPEC-RELATIONS Çözümleme
  const relations = asArray(coreContent?.['SPEC-RELATIONS']?.['SPEC-RELATION'])
    .map((rel) => {
      const sourceExternalId = anyRef(rel?.['SOURCE']);
      const targetExternalId = anyRef(rel?.['TARGET']);
      const typeRefId = anyRef(rel?.['TYPE']);
      const typeName = (relationTypeMap.get(typeRefId) || getLongName(rel) || '').toLowerCase();

      let linkTypeHint = 'satisfies'; // varsayilan: DOORS/ReqIF gereksinim-gereksinim iliskileri cogunlukla Satisfies/derive/trace anlamindadir
      if (/verif/.test(typeName)) linkTypeHint = 'verifies';
      else if (/assign/.test(typeName)) linkTypeHint = 'assigned_to';

      return { relationId: getId(rel), sourceExternalId, targetExternalId, typeName, linkTypeHint };
    })
    .filter((r) => r.sourceExternalId && r.targetExternalId);

  return { requirements, relations };
}
