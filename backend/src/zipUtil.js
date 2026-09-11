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

// --- ZIP YAZMA (.reqifz export icin) ----------------------------------------
//  Sadece STORE (sikistirmasiz) yontemi kullanilir: dogru CRC32/boyut
//  hesabini DEFLATE'e gore cok daha az kod ve risk ile garanti eder — export
//  edilen .reqif metni zaten kucuktur (birkac MB), sikistirma kazanci burada
//  guvenilirlikten daha degerli degildir. Format standart ZIP (non-Zip64):
//  her girdi icin yerel dosya basligi + veri, sonda merkezi dizin + EOCD.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// DOS tarih/saat kodlamasi (ZIP formatinin gerektirdigi, saniye cozunurlugu
// 2sn) — export'un OLUSTURULMA aninin kaydedilmesi disinda islevsel bir
// onemi yok, herhangi bir sabit deger de kabul edilebilirdi.
function dosDateTime(date) {
  const dosTime =
    ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

/**
 * Verilen girdilerden (STORE yontemiyle) bir ZIP arsivi olusturur.
 * @param {{ name: string, data: string|Buffer }[]} files
 * @returns {Buffer}
 */
export function createZip(files) {
  const { dosTime, dosDate } = dosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const dataBuf = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data), 'utf8');
    const crc = crc32(dataBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOC_SIG, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression = STORE
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18); // compressed size
    localHeader.writeUInt32LE(dataBuf.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length
    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(CEN_SIG, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(0, 10); // compression = STORE
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // local header offset
    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(files.length, 8); // entries on this disk
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(centralBuf.length, 12); // central dir size
  eocd.writeUInt32LE(centralStart, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralBuf, eocd]);
}
