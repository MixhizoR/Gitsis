// ============================================================================
//  attributes.js  —  Modular, project-scoped attribute engine (JSONB backed).
//
//  Instead of hard-coding columns like `priority` or `dal_level` on the
//  Requirement/TestCase tables, values now live in a single JSONB column
//  (`attributes`). What keys are legal, their type, and their allowed
//  values ('select' options, required-ness, defaults) is described by
//  per-project `AttributeDefinition` rows — editable at runtime through the
//  API, with no schema migration needed to add a new attribute.
//
//  Every new project is seeded with one built-in definition — Priority —
//  which is on by default but, unlike before, is NOT protected: it can be
//  deleted like any other attribute. DAL Level is no longer seeded at all;
//  projects that want it can add it back via the Attribute Manager. Backend
//  request handlers still accept `priority`/`dal_level` as legacy top-level
//  fields for backward compatibility with older clients, and API responses
//  are "flattened" so `row.priority` / `row.dal_level` keep working for any
//  consumer that hasn't moved to reading `row.attributes` directly.
// ============================================================================

export const ATTRIBUTE_DATA_TYPES = ['text', 'number', 'boolean', 'date', 'select'];
export const ATTRIBUTE_ENTITY_TYPES = ['requirement', 'testcase', 'both'];

// Legacy top-level keys that are folded into `attributes` for backward
// compatibility with request bodies that still send them at the top level.
export const LEGACY_ATTRIBUTE_KEYS = ['priority', 'dal_level'];

// --- Built-in ("system") attribute definitions, seeded for every new project.
//     Only Priority ships by default now; DAL Level is no longer a built-in —
//     projects that want it can add it back via the Attribute Manager (or it
//     already exists, unprotected, on projects created before this change).
//     Priority itself is intentionally NOT "system" — it's on by default but
//     can be removed like any other attribute if a project doesn't need it.
export function defaultAttributeDefinitions() {
  return [
    {
      entityType: 'both',
      key: 'priority',
      label: 'Priority',
      dataType: 'select',
      options: [
        { value: 'High', label: 'High' },
        { value: 'Medium', label: 'Medium' },
        { value: 'Low', label: 'Low' },
      ],
      required: false,
      defaultValue: 'Medium',
      order: 0,
      system: false,
    },
  ];
}

// Seeds the default Priority definition for a brand-new project. Safe to
// call more than once (skipDuplicates).
export async function seedDefaultAttributeDefinitions(prisma, projectId) {
  await prisma.attributeDefinition.createMany({
    data: defaultAttributeDefinitions().map((d) => ({ ...d, projectId })),
    skipDuplicates: true,
  });
}

// One-time backfill for projects created before Priority/DAL Level stopped
// being "system"-protected: clears the old `system: true` flag so they can
// now be deleted like any other attribute (DAL Level), or removed if a
// project doesn't want Priority either. Safe to call repeatedly. Returns the
// number of rows updated.
export async function unlockLegacyBuiltinAttributes(prisma) {
  const result = await prisma.attributeDefinition.updateMany({
    where: { key: { in: ['priority', 'dal_level'] }, system: true },
    data: { system: false },
  });
  return result.count;
}

// Fetches the attribute definitions that apply to a given entity type
// ('requirement' | 'testcase'), including the entityType='both' ones.
export async function listDefs(prisma, projectId, entityType) {
  return prisma.attributeDefinition.findMany({
    where: { projectId, entityType: { in: [entityType, 'both'] } },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });
}

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

function slugifyKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeDefinitionInput(body) {
  const b = body || {};
  const label = String(b.label || '').trim();
  if (!label) throw bad('Oznitelik etiketi zorunlu.');
  const entityType = ATTRIBUTE_ENTITY_TYPES.includes(b.entityType) ? b.entityType : 'both';
  const dataType = ATTRIBUTE_DATA_TYPES.includes(b.dataType) ? b.dataType : 'text';
  const key = slugifyKey(b.key || label);
  if (!key) throw bad('Gecersiz oznitelik anahtari.');

  let options = null;
  if (dataType === 'select') {
    const rawOptions = Array.isArray(b.options) ? b.options : [];
    options = rawOptions
      .map((o) => {
        if (typeof o === 'string') return { value: o.trim(), label: o.trim() };
        const value = String(o?.value ?? '').trim();
        const optLabel = String(o?.label ?? value).trim();
        return value ? { value, label: optLabel || value } : null;
      })
      .filter(Boolean);
    if (options.length === 0) throw bad('Secim (select) tipi oznitelik icin en az bir secenek gerekli.');
  }

  return {
    entityType,
    key,
    label,
    dataType,
    options,
    required: Boolean(b.required),
    defaultValue: b.defaultValue != null && b.defaultValue !== '' ? String(b.defaultValue) : null,
    order: Number.isFinite(Number(b.order)) ? Number(b.order) : 0,
  };
}

// --- Coerces + validates one value against its definition. Returns the
//     coerced value, or throws with a field-specific message.
function coerceValue(def, value) {
  if (value === null || value === undefined || value === '') return null;
  switch (def.dataType) {
    case 'number': {
      const n = Number(value);
      if (Number.isNaN(n)) throw bad(`"${def.label}" sayisal bir deger olmalidir.`);
      return n;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      throw bad(`"${def.label}" true/false olmalidir.`);
    }
    case 'date': {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw bad(`"${def.label}" gecerli bir tarih olmalidir.`);
      return d.toISOString();
    }
    case 'select': {
      const allowed = (def.options || []).map((o) => o.value);
      if (!allowed.includes(String(value))) {
        throw bad(`"${def.label}" icin gecersiz secim: ${value}`);
      }
      return String(value);
    }
    default:
      return String(value).trim();
  }
}

// --- Merges/validates incoming attribute values against the definitions
//     that apply to an entity, on top of any existing stored values.
//     - defs: result of listDefs()
//     - incoming: plain object of { key: value } the caller wants to set
//     - existing: the record's current `attributes` JSONB (or {} for create)
//     - opts.isCreate: when true, unset required fields fall back to
//       def.defaultValue before the required check runs.
// --- Merges/validates incoming attribute values against the definitions
//     that apply to an entity, on top of any existing stored values.
//     - defs: result of listDefs()
//     - incoming: plain object of { key: value } the caller wants to set
//     - existing: the record's current `attributes` JSONB (or {} for create)
//     - opts.isCreate: when true, unset required fields fall back to
//       def.defaultValue before the required check runs.
//
//     Orphaned keys: if an attribute definition is deleted after some
//     records already have a value stored under its key, that value stays
//     in the record's JSONB (deleting a definition never touches existing
//     data). Forms re-submit whatever attributes they loaded — including
//     that now-undefined key — on every save. Previously this hit the
//     "unknown attribute" check below and PERMANENTLY blocked any further
//     edit to the record. Since the caller can't have changed a value it
//     no longer has a UI to edit, an unknown key whose incoming value
//     matches what's already stored is silently carried over unchanged
//     instead of rejected; only a genuinely new/changed value for an
//     undefined key is still an error.
export function validateAndMergeAttributes(defs, incoming, existing = {}, opts = {}) {
  const known = new Set(defs.map((d) => d.key));
  for (const k of Object.keys(incoming || {})) {
    if (!known.has(k)) {
      const hadBefore = Object.prototype.hasOwnProperty.call(existing || {}, k);
      const unchanged = hadBefore && (existing || {})[k] === incoming[k];
      if (unchanged) continue; // orphaned attribute, re-sent as-is — keep quietly.
      throw bad(`Bilinmeyen oznitelik: "${k}". Once Oznitelik Yoneticisi'nden tanimlayin.`);
    }
  }

  const merged = { ...(existing || {}) };
  for (const def of defs) {
    const provided = Object.prototype.hasOwnProperty.call(incoming || {}, def.key);
    if (provided) {
      merged[def.key] = coerceValue(def, incoming[def.key]);
    } else if (opts.isCreate && merged[def.key] === undefined && def.defaultValue != null) {
      merged[def.key] = coerceValue(def, def.defaultValue);
    }
    if (def.required && (merged[def.key] === null || merged[def.key] === undefined)) {
      throw bad(`"${def.label}" zorunlu.`);
    }
  }
  return merged;
}

// Splits a request body into { attrInput, rest } — pulls out `attributes`
// plus any legacy top-level keys (priority, dal_level) so callers can keep
// accepting the old flat request shape without any frontend changes.
export function extractAttributeInput(body) {
  const b = body || {};
  const attrInput = { ...(b.attributes || {}) };
  for (const k of LEGACY_ATTRIBUTE_KEYS) {
    if (b[k] !== undefined) attrInput[k] = b[k];
  }
  return attrInput;
}

// Flattens `row.attributes` onto the top level of the returned object so
// existing consumers reading `row.priority` / `row.dal_level` keep working,
// while `row.attributes` remains available for anything reading dynamically.
export function flatten(row) {
  if (!row) return row;
  const { attributes, ...rest } = row;
  return { ...rest, ...(attributes || {}), attributes: attributes || {} };
}

export function flattenAll(rows) {
  return (rows || []).map(flatten);
}
