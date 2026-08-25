// ============================================================================
//  auth.js — Kimlik dogrulama yardimcilari.
//    - Parola hash/dogrulama (bcrypt). Eski duz-metin kayitlarla geriye
//      donuk uyumluluk: ilk basarili girişte otomatik hash'e migrate edilir
//      (cagiran taraf `migrated:true` gorunce yeni hash'i kaydetmelidir).
//    - JWT imzalama/dogrulama.
//    - Express middleware'leri: requireAuth (her istekte token zorunlu,
//      birkac genel yol haric), requirePM (yalnizca Proje Yoneticisi),
//      projectAccessGuard (app.param('pid', ...) — personel yalnizca
//      kendi atandigi projeye erisebilir; PM her projeye erisebilir).
// ============================================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Gizli anahtar yalnizca ortam degiskeninden gelir; fallback YOK.
// Tanimsizsa process acilista durur (fail-fast, guvenli varsayilan).
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '12h';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

// Sabit anahtar: yalnizca eski duz-metin kayitlarin timing-sal
// karsilastirmasi icin. Oturum JWT'si (JWT_SECRET) ile
// ayiririz; bu pepper gizli degildir — amacı sadece iki eski
// metnin karsilastirirken ayni uzunlukta hash üretmek.
// Override etmek istersen: LEGACY_PASSWORD_PEPPER env'ine deger ver.
const LEGACY_PEPPER = process.env.LEGACY_PASSWORD_PEPPER || 'legacy-plaintext-compare-pepper';

// Iki stringi (veya string olmayanlari bos "" olarak kabul edip)
// sabit uzunlukta HMAC-SHA256 ozetine sadecek, ardindan
// crypto.timingSafeEqual ile karsilastirir.
// - Uzunluk farki halinde Node.js exception firlatmaz (ikisi de 32 byte).
// - Karsilastirma girdi degisikliginden bagimsiz calisir (timing attack direnci).
function constantTimeEqualString(a, b) {
  // non-string (undefined/null) girdide eski "a === b" davranisinin
  // false-donmesini taklit ederiz: iki yan da string degilsen false ver.
  // (aksi halde '' === '' -> true olur; olası auth bypass).
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = createHmac('sha256', LEGACY_PEPPER).update(a).digest();
  const hb = createHmac('sha256', LEGACY_PEPPER).update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function verifyPassword(plain, stored) {
  if (typeof stored === 'string' && stored.startsWith('$2')) {
    // Bcrypt hash == zaman-kararli (sabit uretilen byte'lar).
    return { ok: await bcrypt.compare(plain, stored), migrated: false };
  }
  // Eski duz-metin kayit: artik timing saldırısı acıgı yok.
  // Farkli tipler/uzunluklar da exception firlatmaz, false döner.
  return { ok: constantTimeEqualString(plain, stored), migrated: true };
}

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// Token gerektirmeyen tek yollar: girisin kendisi + health check.
const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login', '/api/auth/passcode', '/api/auth/register']);

export function requireAuth(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) return next();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Kimlik dogrulama gerekli.' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Gecersiz veya suresi dolmus oturum.' });
  }
}

export function requirePM(req, res, next) {
  if (!req.auth?.isPM) {
    return res.status(403).json({ error: 'Bu islem yalnizca Proje Yoneticisi tarafindan yapilabilir.' });
  }
  next();
}

/** app.param('pid', projectAccessGuard) — proje sinirini asma (IDOR) korumasi. */
export function projectAccessGuard(req, res, next, pid) {
  if (!req.auth) return res.status(401).json({ error: 'Kimlik dogrulama gerekli.' });
  if (req.auth.isPM) return next();
  if (req.auth.kind === 'personnel' && req.auth.projectId === pid) return next();
  return res.status(403).json({ error: 'Bu projeye erisim yetkiniz yok.' });
}
