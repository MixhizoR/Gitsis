// ============================================================================
//  Sidebar.jsx  —  Sol navigasyon (yeni yapi).
//  Sira: Dashboard -> Hiyerarsi[User/System/Sub-system Req + Acceptance/System/
//  Sub-system Test + Glossary] -> Kapsam Raporu -> Izlenebilirlik Matrisi ->
//  AI Belge Analizi -> Degisiklik Tarihcesi.
//  Aktif proje adi ustte gosterilir; "Projeler" ile secim ekranina donulur.
// ============================================================================
import { useState } from 'react'
import {
  IconDashboard,
  IconList,
  IconMatrix,
  IconShield,
  IconHistory,
  IconSparkle,
  IconChevron,
  IconUsers,
} from '../common/Icons.jsx'
import Logo from '../common/Logo.jsx'
import { useProject } from '../../context/ProjectContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

// Hiyerarsi alt ogeleri (sirali).
const HIER = [
  { key: 'req-user', labelKey: 'nav.reqUser' },
  { key: 'req-system', labelKey: 'nav.reqSystem' },
  { key: 'req-subsystem', labelKey: 'nav.reqSubsystem' },
  { key: 'test-acceptance', labelKey: 'nav.testAcceptance' },
  { key: 'test-system', labelKey: 'nav.testSystem' },
  { key: 'test-subsystem', labelKey: 'nav.testSubsystem' },
  { key: 'glossary', labelKey: 'nav.glossary' },
]
const HIER_KEYS = HIER.map((h) => h.key)

const TOP = [{ key: 'dashboard', labelKey: 'nav.dashboard', icon: IconDashboard }]
const BOTTOM = [
  { key: 'coverage', labelKey: 'nav.coverage', icon: IconShield },
  { key: 'traceability', labelKey: 'nav.traceability', icon: IconMatrix },
  { key: 'traceability-export', labelKey: 'nav.traceabilityExport', icon: IconMatrix },
  { key: 'traceability-import', labelKey: 'nav.traceabilityImport', icon: IconMatrix },
  { key: 'documents', labelKey: 'nav.documents', icon: IconSparkle },
  { key: 'audit', labelKey: 'nav.audit', icon: IconHistory },
]

function NavButton({ active, onClick, Icon, label, indent = false }) {
  return (
    <button
      onClick={onClick}
      className={
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ' +
        (indent ? 'pl-9 !py-2 text-[13px] ' : '') +
        (active
          ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100')
      }
    >
      {Icon && <Icon size={indent ? 16 : 19} />}
      <span className="flex-1 text-left">{label}</span>
    </button>
  )
}

export default function Sidebar({ active, onNavigate }) {
  const { activeProject, closeProject } = useProject()
  const { t } = useLang()
  const { isPM, can } = useAuth()
  const [hierOpen, setHierOpen] = useState(HIER_KEYS.includes(active) || true)

  const hierActive = HIER_KEYS.includes(active)
  const canSeeRoles = isPM || can('manage_roles')

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Logo + proje */}
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Logo size={38} className="shrink-0 drop-shadow-sm" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t('app.name')}
            </div>
            <div className="truncate text-[11px] font-medium text-slate-400">
              {activeProject?.name || t('app.subtitle')}
            </div>
          </div>
        </div>
        <button
          onClick={closeProject}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <IconChevron size={12} className="rotate-180" /> {t('nav.projects')}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {TOP.map((item) => (
          <NavButton
            key={item.key}
            active={active === item.key}
            onClick={() => onNavigate(item.key)}
            Icon={item.icon}
            label={t(item.labelKey)}
          />
        ))}

        {/* Roller — Dashboard ile Hiyerarsi ARASINDA (yalnizca yetkiliye) */}
        {canSeeRoles && (
          <NavButton
            key="roles"
            active={active === 'roles'}
            onClick={() => onNavigate('roles')}
            Icon={IconUsers}
            label={t('nav.roles')}
          />
        )}

        {/* Hiyerarsi (acilir) */}
        <button
          onClick={() => setHierOpen((o) => !o)}
          className={
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ' +
            (hierActive
              ? 'text-brand-700 dark:text-brand-300'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100')
          }
        >
          <IconList size={19} />
          <span className="flex-1 text-left">{t('nav.hierarchy')}</span>
          <IconChevron
            size={15}
            className={hierOpen ? 'rotate-90 transition-transform' : 'transition-transform'}
          />
        </button>
        {hierOpen && (
          <div className="space-y-0.5">
            {HIER.map((item) => (
              <NavButton
                key={item.key}
                active={active === item.key}
                onClick={() => onNavigate(item.key)}
                Icon={null}
                label={t(item.labelKey)}
                indent
              />
            ))}
          </div>
        )}

        <div className="my-2 border-t border-slate-100 dark:border-slate-800" />

        {BOTTOM.map((item) => (
          <NavButton
            key={item.key}
            active={active === item.key}
            onClick={() => onNavigate(item.key)}
            Icon={item.icon}
            label={t(item.labelKey)}
          />
        ))}
      </nav>

      {/* Alt not */}
      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <div className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          {t('sidebar.dataNote', { b: 'DO-178C' })}
          <span className="font-semibold text-brand-600 dark:text-brand-400"> PostgreSQL</span>
        </div>
      </div>
    </aside>
  )
}
