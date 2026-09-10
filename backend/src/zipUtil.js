// ============================================================================
//  zipUtil.js  —  Bagimliliksiz, minimal ZIP okuyucu (.reqifz destegi icin).
//  Sadece STANDART (non-Zip64) merkezi dizin + DEFLATE/STORE yontemlerini
//  destekler; ReqIFz arsivleri (birkac kucuk XML/ekli dosya) bu kapsama
//  rahatlikla girer. `npm install` bu ortamda calismadigindan (kayit
//  defterine erisim yok) yeni bir bagimlilik eklemek yerine Node'un yerlesik
//  `zlib` modulu uzerine ince bir ZIP ayristirici yazildi.
// ============================================================================
import zlib from 'node:zlib';

const LOC_SIG = 0x04034b50; // "PK\x03\x04" — yerel dosya basligi
const CEN_SIG = 0x02014b50; // "PK\x01\x02" — merkezi dizin kaydi
const EOCD_SIG = 0x06054b50; // "PK\x05\x06" — merkezi dizin sonu

/** Buffer'in bir ZIP arsivi (yerel dosya basligiyla basliyor) olup olmadigini kontrol eder. */
export function isZip(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 4 && buf.readUInt32LE(0) === LOC_SIG;
}

function findEOCD(buf) {
  // Yorum alani degisken uzunlukta (maks 65535 bayt) oldugundan sondan geriye tarar.
  const minPos = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/**
 * ZIP arsivindeki tum girdileri (merkezi dizin uzerinden) listeler.
 * @returns {{ name: string, read: () => Buffer }[]}
 */
export function readZipEntries(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  const eocdOffset = findEOCD(buf);
  if (eocdOffset === -1) throw new Error('Gecersiz ZIP arsivi (merkezi dizin sonu bulunamadi).');

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  let cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = [];
  for (let i = 0; i < totalEntries; i++) {
    if (cdOffset + 46 > buf.length || buf.readUInt32LE(cdOffset) !== CEN_SIG) {
      throw new Error('Bozuk ZIP merkezi dizin kaydi.');
    }
    const compressionMethod = buf.readUInt16LE(cdOffset + 10);
    const compressedSize = buf.readUInt32LE(cdOffset + 20);
    const nameLen = buf.readUInt16LE(cdOffset + 28);
    const extraLen = buf.readUInt16LE(cdOffset + 30);
    const commentLen = buf.readUInt16LE(cdOffset + 32);
    const localHeaderOffset = buf.readUInt32LE(cdOffset + 42);
    const name = buf.toString('utf8', cdOffset + 46, cdOffset + 46 + nameLen);

    const entry = { name, compressionMethod, compressedSize, localHeaderOffset };
    entries.push({ name, read: () => extractEntry(buf, entry) });
    cdOffset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function extractEntry(buf, entry) {
  const off = entry.localHeaderOffset;
  if (off + 30 > buf.length || buf.readUInt32LE(off) !== LOC_SIG) {
    throw new Error(`Bozuk ZIP yerel dosya basligi: "${entry.name}".`);
  }
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  const dataStart = off + 30 + nameLen + extraLen;
  const raw = buf.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return raw; // STORE (sikistirmasiz)
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(raw); // DEFLATE
  throw new Error(`Desteklenmeyen ZIP sikistirma yontemi (${entry.compressionMethod}): "${entry.name}".`);
}

function stripBOM(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Bir .reqif / .reqifz / .xml dosyasinin ham byte icerigini alir; ZIP ise
 * (imza kontrolu ile — DOSYA UZANTISINA BAKMAZ) icindeki ilk .reqif girdisini
 * bulup metne cevirir, degilse dogrudan metne cevirir. BOM temizlenir.
 */
export function extractReqIFText(buf) {
  if (isZip(buf)) {
    const entries = readZipEntries(buf);
    const reqifEntry =
      entries.find((e) => /\.reqif$/i.test(e.name)) ||
      entries.find((e) => !/\/$/.test(e.name) && /\.xml$/i.test(e.name));
    if (!reqifEntry) {
      throw new Error('.reqifz arsivi icinde bir .reqif dosyasi bulunamadi.');
    }
    return stripBOM(reqifEntry.read().toString('utf8'));
  }
  return stripBOM(buf.toString('utf8'));
}
