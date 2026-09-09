// ============================================================================
//  AdminLayout.jsx — Sistem yönetim konsolu kabuğu (Issue #90 + admin ayrımı).
//  ADMIN hesapları proje ekranlarını hiç görmez; bu konsol kullanıcı
//  yönetimi (UsersPage) ve sistem denetim kayıtlarını (AuditLogPage) sunar.
//  Proje kabuğundan (Sidebar/Topbar/AppContext) tamamen bağımsızdır —
//  "user yönetimi" ile "proje yönetimi" ayrı UI alanlarıdır.
// ============================================================================
import { useState } from 'react'
import Logo from '../components/common/Logo.jsx'
import { IconHistory, IconList, IconUsers } from '../components/common/Icons.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import UsersPage from './UsersPage.jsx'
import AuditLogPage from './AuditLogPage.jsx'
import RolesAdminPage from './RolesAdminPage.jsx'

export default function AdminLayout() {
  const { currentUser, logout } = useAuth()
  const { t } = useLang()
  const [tab, setTab] = useState('users')

  // Savunma katmanı: App.jsx zaten ADMIN olmayanları buraya sokmaz; yine de
  // eski oturum/derin bağlantı senaryolarına karşı UI tarafında da kısıtlarız.
  if (currentUser?.systemRole !== 'ADMIN') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 p-6 dark:bg-slate-950">
        <div className="card text-sm font-medium text-slate-500">{t('admin.unauthorized')}</div>
      </div>
    )
  }

  const NAV = [
    { key: 'users', label: t('admin.navUsers'), Icon: IconUsers },
    { key: 'roles', label: t('rolesAdmin.nav'), Icon: IconList },
    { key: 'logs', label: t('admin.navLogs'), Icon: IconHistory },
  ]
  const title =
    tab === 'users'
      ? t('admin.users')
      : tab === 'roles'
        ? t('rolesAdmin.title')
        : t('admin.auditLogs')

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 dark:bg-slate-950">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {/* Logo + konsol kimliği */}
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Logo size={38} className="shrink-0 drop-shadow-sm" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">
                {t('admin.console')}
              </div>
              <div className="truncate text-[11px] font-medium text-slate-400">
                {t('admin.consoleSub')}
              </div>
            </div>
          </div>
        </div>

        {/* Konsol navigasyonu — proje menüsünden bağımsız */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ' +
                (tab === key
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100')
              }
            >
              <Icon size={19} />
              <span className="flex-1 text-left">{label}</span>
            </button>
          ))}
        </nav>

        {/* Oturum bilgisi + çıkış */}
        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
              {currentUser.initials || '?'}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                {currentUser.name}
              </div>
              <div className="truncate text-[11px] text-slate-400">@{currentUser.username}</div>
            </div>
            <button
              onClick={() => {
                if (window.confirm(t('topbar.logoutConfirm'))) logout()
              }}
              className="btn-ghost !px-2 !py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400"
            >
              {t('topbar.logout')}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">{title}</h1>
            <p className="text-[12px] text-slate-400">{t('page.admin.sub')}</p>
          </div>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-[11px] font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
            ADMIN
          </span>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {tab === 'users' ? (
            <UsersPage />
          ) : tab === 'roles' ? (
            <RolesAdminPage />
          ) : (
            <AuditLogPage />
          )}
        </main>
      </div>
    </div>
  )
}
