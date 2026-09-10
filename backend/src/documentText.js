// ============================================================================
//  documentText.js  —  Belgeden DUZ METIN cikarma (tek kaynak).
//
//  NEDEN: Kullanici dokuman goruntuleyicide metni fareyle secip gereksinim
//  olusturabiliyor. Secim, bu modulun urettigi metnin KARAKTER ARALIGI olarak
//  (sourceStart / sourceEnd) gereksinime yazilir. Bu yuzden metin YUKLEME
//  ANINDA bir kez cikarilir ve bir daha degistirilmez: sonradan yeniden
//  cikarilirsa (ornegin kutuphane surumu degisirse) eski gereksinimlerin
//  karakter araliklari kayar ve yanlis pasaji gosterir.
//
//  Bicimler:
//    .pdf  -> unpdf (pdf.js tabanli, yerel; CDN/ag gerektirmez)
//    .xlsx -> ExcelJS; hucreler sekme, satirlar yeni satir ile birlestirilir
//    .xls  -> DESTEKLENMIYOR (ExcelJS eski ikili bicimi okuyamaz)
// ============================================================================
import ExcelJS from 'exceljs';

// Cok buyuk belgelerde bellek/yanit boyutunu sinirla (yaklasik 2M karakter).
const MAX_TEXT_LENGTH = 2_000_000;

/** ExcelJS hucre degerini duz metne cevirir (formul/zengin metin/tarih dahil). */
export function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    // Formul hucresi: hesaplanmis sonucu goster.
    if ('result' in value) return cellText(value.result);
    if ('error' in value) return String(value.error);
    if (Array.isArray(value.richText)) return value.richText.map((t) => t.text).join('');
    if ('text' in value) return String(value.text);
    if ('hyperlink' in value) return String(value.hyperlink);
    return '';
  }
  return String(value);
}

/** PDF -> duz metin (sayfalar bos satirla ayrilir). */
async function pdfToText(buffer) {
  // unpdf ESM-only; dinamik import ile yukleniyor ki bu modulu import eden
  // testler PDF isi yapmadiginda kutuphane hic yuklenmesin.
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text || '');
}

/** XLSX -> duz metin (hucreler sekme, satirlar yeni satir). */
async function xlsxToText(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const parts = [];
  for (const ws of workbook.worksheets) {
    parts.push(`# ${ws.name}`);
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell) => cells.push(cellText(cell.value)));
      parts.push(cells.join('\t'));
    });
    parts.push('');
  }
  return parts.join('\n');
}

/**
 * Belgeden metin cikarir.
 * @param {Buffer} buffer  dosya icerigi
 * @param {string} ext     '.pdf' | '.xlsx' | '.xls'
 * @returns {Promise<{ text: string|null, status: 'ready'|'unsupported'|'failed' }>}
 */
export async function extractDocumentText(buffer, ext) {
  if (ext !== '.pdf' && ext !== '.xlsx') {
    // Eski ikili .xls: metin cikarilamaz, kullanici dosyayi indirebilir.
    return { text: null, status: 'unsupported' };
  }
  try {
    const raw = ext === '.pdf' ? await pdfToText(buffer) : await xlsxToText(buffer);
    // Windows satir sonlarini normalize et: istemcide gosterilen metinle
    // karakter araliklari birebir ortusmeli.
    const text = raw.replace(/\r\n/g, '\n').slice(0, MAX_TEXT_LENGTH);
    return { text, status: 'ready' };
  } catch (e) {
    console.error('[documentText] cikarilamadi:', e?.message || e);
    return { text: null, status: 'failed' };
  }
}
