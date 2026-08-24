// ============================================================================
//  AuthContext.jsx  —  Kimlik doğrulama + RBAC (rol bazlı erişim).
//  İki oturum türü:
//    1) PM (Proje Yöneticisi): kullanıcı adı + şifre (admin/admin). Tam yetki.
//    2) Personel: 5 karakterlik passcode. Rolüne tanımlı 12 kademeli izin.
//  Yalnızca OTURUM bilgisi tarayıcıda (LocalStorage) tutulur.
// ============================================================================
import { createContext, useContext, useState, useCallback } from 'react'
import { ROLES, authenticate, passcodeAuthenticate, toInitials } from '../services/authService.js'
import { hasPermission } from '../utils/permissions.js'

const SESSION_KEY = 'ehsim_auth_session'
const PM_ROLE_LABEL = 'Proje Yöneticisi'

// Geriye donuk uyumluluk: ROLES bazi bilesenlerce buradan import ediliyor.
export { ROLES }

const AuthContext = createContext(null)

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

  // --- PM girişi (kullanıcı adı + şifre) ------------------------------------
  const login = useCallback(async (username, password) => {
    const res = await authenticate(username, password)
    const { token, user } = res || {}
    if (!user || !token) throw new Error('Kullanıcı adı veya şifre yanlış.')
    return persist({
      kind: 'pm',
      isPM: true,
      token,
      id: user.id,
      username: user.username,
      name: user.name,
      initials: user.initials || toInitials(user.name),
      role: PM_ROLE_LABEL,
    })
  }, [])

  // --- Personel girişi (passcode) -------------------------------------------
  const passcodeLogin = useCallback(async (passcode) => {
    const res = await passcodeAuthenticate(passcode)
    const { token, personnel, role, project } = res || {}
    if (!token || !personnel || !role || !project) throw new Error('Geçersiz passcode.')
    const name = `${personnel.firstName} ${personnel.lastName}`.trim()
    return persist({
      kind: 'personnel',
      isPM: false,
      token,
      personnelId: personnel.id,
      passcode: personnel.passcode,
      name,
      initials: toInitials(name),
      role: role.name,
      roleId: role.id,
      permissions: role.permissions || {},
      projectId: project.id,
      projectName: project.name,
    })
  }, [])

  // --- Çıkış ----------------------------------------------------------------
  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setCurrentUser(null)
  }, [])

  // --- Yetki kontrolü -------------------------------------------------------
  //  can(permKey, componentKey?) — PM her zaman true. Personel için rol izni.
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
    <AuthContext.Provider value={{ currentUser, isPM, login, passcodeLogin, logout, can, ROLES }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth yalnızca <AuthProvider> içinde kullanılabilir.')
  return ctx
}
