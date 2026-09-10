// ============================================================================
//  reason.js — Silme gerekcesi (izlenebilirlik) zorunlulugu, TEK kaynak.
//  DO-178C degisiklik yonetimi: veriyi GERCEKTEN silen her uc nokta, "neden
//  silindi" gerekcesini DB degisikligiyle AYNI ISTEKTE zorunlu kilar; bu
//  metin ilgili AuditLog kaydina (Degisiklik Tarihcesi) yazilir. Yalnizca
//  UI/menu duzeni gibi veri SILMEYEN islemler (nav grubu/sayfasi kaldirma)
//  buna dahil degildir — onlar zaten hicbir kaydi silmiyor.
//  Sunucu tarafinda dogrulanir: istemci dogrulamasi guvenlik siniri DEGILDIR,
//  API'ye dogrudan istek atilarak atlatilabilir.
//  server.js VE documents.js (ayri router) tarafindan ortak kullanilir.
// ============================================================================
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

const REASON_MIN_LEN = 3;
const REASON_MAX_LEN = 500;

export function requireReason(req) {
  const raw = req.body?.reason;
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (reason.length < REASON_MIN_LEN) {
    throw bad(`Silme gerekcesi zorunludur (en az ${REASON_MIN_LEN} karakter).`);
  }
  if (reason.length > REASON_MAX_LEN) {
    throw bad(`Silme gerekcesi en fazla ${REASON_MAX_LEN} karakter olabilir.`);
  }
  return reason;
}
