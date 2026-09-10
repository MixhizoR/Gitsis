// ============================================================================
//  label.js — title artik ZORUNLU degil (bkz. Requirement/TestCase.title
//  @default("")). Audit-log mesajlari gibi DUZ METIN baglamlarda "" gostermek
//  yerine aciklamadan turetilmis kisa bir etiket kullanilir; o da yoksa
//  text_id'ye duser. Frontend'deki `getDisplayLabel` (utils/format.js) ile
//  AYNI mantigin backend tarafidir — ikisi de "once title, sonra aciklamadan
//  kisa bir ozet, sonra text_id" sirasini izler.
// ============================================================================
const MAX_LEN = 60;

export function labelOf(row) {
  if (!row) return '';
  if (row.title) return row.title;
  const plain = String(row.description || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain) return plain.length > MAX_LEN ? `${plain.slice(0, MAX_LEN - 3)}...` : plain;
  return row.text_id || row.term || '';
}
