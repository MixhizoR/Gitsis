// ============================================================================
//  AdminLayout.test.jsx — Ayrık admin konsolunun davranış testleri:
//    1) ADMIN oturumu konsolu görür ve kullanıcı tablosu yüklenir.
//    2) ADMIN olmayan oturum yetkisiz uyarısı alır (UI savunma katmanı).
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../context/LanguageContext.jsx'
import { AuthProvider } from '../../context/AuthContext.jsx'
import AdminLayout from '../AdminLayout.jsx'

vi.mock('../../services/adminService.js', () => ({
  listUsers: vi.fn(async () => [
    {
      id: 'u1',
      username: 'zeynep',
      name: 'Zeynep K',
      role: 'Developer',
      roleKey: 'developer',
      systemRole: 'USER',
      clearanceLevel: 2,
      isActive: true,
    },
  ]),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  unlockUser: vi.fn(),
  deleteUser: vi.fn(),
  // Issue #101: UsersPage rol `<select>` aktif SystemRole listesinden beslenir.
  listSystemRoles: vi.fn(async () => [
    { key: 'pm', name: 'Proje Yöneticisi', isSystem: true, isActive: true, permissions: {} },
    {
      key: 'system_engineer',
      name: 'System Engineer',
      isSystem: true,
      isActive: true,
      permissions: {},
    },
    { key: 'developer', name: 'Developer', isSystem: true, isActive: true, permissions: {} },
  ]),
  listAuditLogs: vi.fn(async () => [
    {
      id: 'l1',
      action: 'admin.user.create',
      userId: 'a1',
      metadata: { targetUsername: 'zeynep' },
      createdAt: new Date().toISOString(),
    },
  ]),
}))

const SESSION_KEY = 'ehsim_auth_session'

function renderWithSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  return render(
    <LanguageProvider>
      <AuthProvider>
        <AdminLayout />
      </AuthProvider>
    </LanguageProvider>,
  )
}

describe('AdminLayout — ayrık admin konsolu', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('ADMIN oturumu konsolu görür ve kullanıcı tablosunu listeler', async () => {
    renderWithSession({
      systemRole: 'ADMIN',
      username: 'admin',
      name: 'Admin',
      initials: 'AD',
    })
    expect(await screen.findByText('zeynep')).toBeInTheDocument()
    expect(screen.getByText('Yönetim Konsolu')).toBeInTheDocument()
    expect(screen.getByText('ADMIN')).toBeInTheDocument()
  })

  it('ADMIN olmayan oturum yetkisiz uyarısı görür', async () => {
    renderWithSession({ systemRole: 'USER', username: 'u', name: 'U' })
    expect(await screen.findByText('Bu alan yalnızca Admin rolüne açıktır.')).toBeInTheDocument()
  })

  it('Roller sekmesi sistem rollerini listeler (Issue #101)', async () => {
    renderWithSession({
      systemRole: 'ADMIN',
      username: 'admin',
      name: 'Admin',
      initials: 'AD',
    })
    const tabs = await screen.findAllByRole('button', { name: 'Roller' })
    fireEvent.click(tabs[0])
    expect(await screen.findByText('Proje Yöneticisi')).toBeInTheDocument()
    expect(screen.getByText('system_engineer', { selector: 'td' })).toBeInTheDocument()
  })
})
