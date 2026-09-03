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
