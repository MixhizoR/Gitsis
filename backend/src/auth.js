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
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'ehsim-dev-secret-change-me'
const TOKEN_TTL = '12h'

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain, stored) {
  if (typeof stored === 'string' && stored.startsWith('$2')) {
    return { ok: await bcrypt.compare(plain, stored), migrated: false }
  }
  // Eski duz-metin kayit — bir kereligine dogrudan karsilastir.
  return { ok: stored === plain, migrated: true }
}

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL })
}

// Token gerektirmeyen tek yollar: girisin kendisi + health check.
const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/auth/passcode',
  '/api/auth/register',
])

export function requireAuth(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) return next()
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Kimlik dogrulama gerekli.' })
  try {
    req.auth = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Gecersiz veya suresi dolmus oturum.' })
  }
}

export function requirePM(req, res, next) {
  if (!req.auth?.isPM) {
    return res.status(403).json({ error: 'Bu islem yalnizca Proje Yoneticisi tarafindan yapilabilir.' })
  }
  next()
}

/** app.param('pid', projectAccessGuard) — proje sinirini asma (IDOR) korumasi. */
export function projectAccessGuard(req, res, next, pid) {
  if (!req.auth) return res.status(401).json({ error: 'Kimlik dogrulama gerekli.' })
  if (req.auth.isPM) return next()
  if (req.auth.kind === 'personnel' && req.auth.projectId === pid) return next()
  return res.status(403).json({ error: 'Bu projeye erisim yetkiniz yok.' })
}
