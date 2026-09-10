// ============================================================================
//  AuthContext.jsx  —  Kimlik doğrulama + RBAC (rol bazlı erişim).
//  Issue #97: TEK oturum türü — User (kullanıcı adı + şifre). Passcode girişi
//  ve Personnel dünyası KALDIRILDI. PM (roleKey='pm') tüm projelere erişir;
//  normal kullanıcı yalnızca uye oldugu projelere (Issue #103: ProjectMember).
//  Yalnızca OTURUM bilgisi tarayıcıda (LocalStorage) tutulur.
//  Issue #101: `roleKey` oturuma kaydedilir (PM tespiti ve rol/izin eslemesi
//  icin kanonik kaynak).
// ============================================================================
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { ROLES, PM_ROLE, authenticate, logoutRefresh, toInitials } from '../services/authService.js'
import { hasPermission } from '../utils/permissions.js'

const SESSION_KEY = 'ehsim_auth_session'

const AuthContext = createContext(null)

// Geriye donuk uyumluluk: ROLES bazi bilesenlerce buradan import ediliyor.
export { ROLES }

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const persist = (session) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setCurrentUser(session)
    return session
  }

  // --- Kullanici girisi (kullanici adi + sifre) ----------------------------
  const login = useCallback(async (username, password) => {
    const res = await authenticate(username, password)
    const { accessToken, refreshToken, user } = res || {}
    if (!user || !accessToken || !refreshToken) throw new Error('Kullanıcı adı veya şifre yanlış.')
    // Issue #101: PM tespiti tek kanonik kuralla (roleKey==='pm' OR serbest-metin fallback).
    const isPM = user.roleKey === 'pm' || user.role === PM_ROLE
    return persist({
      kind: isPM ? 'pm' : 'user',
      isPM,
      accessToken,
      refreshToken,
      id: user.id,
      username: user.username,
      name: user.name,
      initials: user.initials || toInitials(user.name),
      systemRole: user.systemRole,
      clearanceLevel: user.clearanceLevel,
      role: user.role,
      // Issue #101: sistem rol anahtari — rol/izin eslemesi icin kanonik kaynak.
      roleKey: user.roleKey || null,
      // Issue #103: projectId token'da tasinmaz — uyelikler DB'den dogrulanir.
    })
  }, [])

  // --- Çıkış ----------------------------------------------------------------
  const logout = useCallback(() => {
    // Sunucuda refresh token'i revoke et (best-effort); oturum her halde temizlenir.
    try {
      const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
      if (stored?.refreshToken) {
        logoutRefresh(stored.refreshToken).catch(() => {})
      }
    } catch {
      /* yoksay */
    }
    localStorage.removeItem(SESSION_KEY)
    setCurrentUser(null)
  }, [])

  // Oturum süresi dolunca (apiClient'in sessiz yenilemesi başarısız olunca)
  // uygulamayı Login ekranına düşür — sayfa yenilemek gerekmez.
  useEffect(() => {
    const onExpired = () => {
      localStorage.removeItem(SESSION_KEY)
      setCurrentUser(null)
    }
    window.addEventListener('ehsim:auth-expired', onExpired)
    return () => window.removeEventListener('ehsim:auth-expired', onExpired)
  }, [])

  // --- Yetki kontrolü -------------------------------------------------------
  //  can(permKey, componentKey?) — PM her zaman true. Normal kullanici icin
  //  rol izni (roleKey -> SystemRole semasi). Issue #97: personnel kaldirildi.
  const can = useCallback(
    (permKey, componentKey = null) => {
      if (!currentUser) return false
      if (currentUser.isPM) return true
      return hasPermission(currentUser.permissions, permKey, componentKey)
    },
    [currentUser],
  )

  const isPM = Boolean(currentUser?.isPM)

  return (
    <AuthContext.Provider value={{ currentUser, isPM, login, logout, can, ROLES }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth yalnızca <AuthProvider> içinde kullanılabilir.')
  return ctx
}
