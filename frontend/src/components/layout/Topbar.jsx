// ============================================================================
//  Topbar.jsx  —  Üst bar: başlık, dil, tema, kullanıcı + çıkış.
// ============================================================================
import { useApp } from '../../context/AppContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { IconSun, IconMoon } from '../common/Icons.jsx'

// Ust bar basligi icin sayfa anahtari -> i18n key esleme.
const TITLE_KEY = {
  dashboard: 'dashboard',
  'pbs-tree': 'pbsTree',
  'req-user': 'reqUser',
  'req-system': 'reqSystem',
  'req-subsystem': 'reqSubsystem',
  'test-acceptance': 'testAcceptance',
  'test-system': 'testSystem',
  'test-subsystem': 'testSubsystem',
  glossary: 'glossary',
  coverage: 'coverage',
  traceability: 'traceability',
  'traceability-export': 'traceabilityExport',
  'traceability-import': 'traceabilityImport',
  suspect: 'suspect',
  documents: 'documents',
  audit: 'audit',
}

export default function Topbar({ active, titleOverride = null }) {
  const { theme, toggleTheme } = useApp()
  const { currentUser, logout, isPM } = useAuth()
  const { t, lang, toggleLang } = useLang()
  const key = TITLE_KEY[active] || 'dashboard'

  const onLogout = () => {
    if (window.confirm(t('topbar.logoutConfirm'))) logout()
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-6 py-3.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
      <div>
        <h1 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
          {titleOverride || t(`page.${key}.title`)}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t(`page.${key}.sub`)}</p>
      </div>

      <div className="flex items-center gap-2">
        {/* Dil değiştirici (TR / EN) */}
        <button
          onClick={toggleLang}
          className="btn-secondary !px-2.5 text-xs font-bold tabular-nums"
          title={t('lang.label')}
        >
          {lang === 'tr' ? 'TR' : 'EN'} <span className="opacity-40">/</span>{' '}
          <span className="opacity-60">{lang === 'tr' ? 'EN' : 'TR'}</span>
        </button>

        <button onClick={toggleTheme} className="btn-secondary !px-2.5" title={t('topbar.theme')}>
          {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
        </button>

        {/* Kullanıcı bilgisi + çıkış */}
        <div className="ml-2 flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-1.5 pr-3 dark:border-slate-700 dark:bg-slate-800">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${
              isPM ? 'bg-brand-600' : 'bg-emerald-600'
            }`}
          >
            {currentUser?.initials ?? '??'}
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {currentUser?.name} <span className="text-slate-400">—</span>{' '}
              <span className={`font-semibold ${isPM ? 'text-brand-500' : 'text-emerald-500'}`}>
                {currentUser?.role}
              </span>
            </div>
          </div>
        </div>

        <button onClick={onLogout} className="btn-ghost !px-2.5" title={t('topbar.logout')}>
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  )
}
