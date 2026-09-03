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
  IconDoc,
  IconPlus,
} from '../common/Icons.jsx'
import Logo from '../common/Logo.jsx'
import NavManager from './NavManager.jsx'
import { useProject } from '../../context/ProjectContext.jsx'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

// Sayfa anahtari -> i18n etiket anahtari. Bu liste SABITTIR (backend
// navDefaults.js NAV_PAGE_KEYS ile birebir ayni); kullanici yalnizca bu
// sayfalari GRUPLAR, yeni sayfa/tip yaratamaz.
export const PAGE_LABEL_KEYS = {
  'req-user': 'nav.reqUser',
  'req-system': 'nav.reqSystem',
  'req-subsystem': 'nav.reqSubsystem',
  'test-acceptance': 'nav.testAcceptance',
  'test-system': 'nav.testSystem',
  'test-subsystem': 'nav.testSubsystem',
  glossary: 'nav.glossary',
}

const TOP = [
  { key: 'dashboard', labelKey: 'nav.dashboard', icon: IconDashboard },
  // Urun Agaci (PBS) — lazy-load hiyerarsi gorunumu (Issue #9).
  { key: 'pbs-tree', labelKey: 'nav.pbsTree', icon: IconList },
]
const BOTTOM = [
  { key: 'coverage', labelKey: 'nav.coverage', icon: IconShield },
  { key: 'traceability', labelKey: 'nav.traceability', icon: IconMatrix },
  { key: 'traceability-export', labelKey: 'nav.traceabilityExport', icon: IconMatrix },
  { key: 'traceability-import', labelKey: 'nav.traceabilityImport', icon: IconMatrix },
  { key: 'documents', labelKey: 'nav.documents', icon: IconSparkle },
  { key: 'audit', labelKey: 'nav.audit', icon: IconHistory },
  { key: 'snapshots', labelKey: 'nav.snapshots', icon: IconDoc },
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
  const { nav } = useApp()
  const { t } = useLang()
  const { isPM, can } = useAuth()
  // Kapali gruplarin id'leri (varsayilan: hepsi acik).
  const [closedGroups, setClosedGroups] = useState(() => new Set())
  const [navMgrOpen, setNavMgrOpen] = useState(false)

  const canSeeRoles = isPM || can('manage_roles')
  const groups = nav?.groups || []
  const ungrouped = nav?.ungrouped || []
  // Materialize edilmemis varsayilan gruplarin etiketi i18n'den gelir;
  // kullanici ozellestirdikten sonra kendi verdigi duz isim kullanilir.
  const groupLabel = (g) => (g.nameKey ? t(g.nameKey) : g.name)
  // Ozel ad verilmisse onu, yoksa sayfanin varsayilan i18n etiketini kullan.
  const navItemLabel = (item) => item.label || t(PAGE_LABEL_KEYS[item.pageKey] || item.pageKey)
  const toggleGroup = (id) =>
    setClosedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

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

        {/* Menu gruplari (proje bazli, kullanici yonetimli — Issue #9/6) */}
        {groups.map((g, gi) => {
          const gid = g.id || `default-${gi}`
          const isOpen = !closedGroups.has(gid)
          const groupActive = g.items.some((i) => (i.id || i.pageKey) === active)
          return (
            <div key={gid}>
              <button
                onClick={() => toggleGroup(gid)}
                className={
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ' +
                  (groupActive
                    ? 'text-brand-700 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100')
                }
              >
                <IconList size={19} />
                <span className="flex-1 truncate text-left">{groupLabel(g)}</span>
                <IconChevron
                  size={15}
                  className={isOpen ? 'rotate-90 transition-transform' : 'transition-transform'}
                />
              </button>
              {isOpen && (
                <div className="space-y-0.5">
                  {g.items.map((item) => (
                    <NavButton
                      key={item.id || item.pageKey}
                      active={active === (item.id || item.pageKey)}
                      onClick={() => onNavigate(item.id || item.pageKey)}
                      Icon={null}
                      label={navItemLabel(item)}
                      indent
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Grupsuz sayfalar (varsayilan: Sozluk) */}
        {ungrouped.map((item) => (
          <NavButton
            key={item.id || item.pageKey}
            active={active === (item.id || item.pageKey)}
            onClick={() => onNavigate(item.id || item.pageKey)}
            Icon={IconList}
            label={navItemLabel(item)}
          />
        ))}

        {/* Menuyu duzenle — yalnizca PM (backend de requirePM ile korunuyor) */}
        {isPM && (
          <button
            onClick={() => setNavMgrOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <IconPlus size={14} />
            {t('nav.manageMenu')}
          </button>
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

      <NavManager open={navMgrOpen} onClose={() => setNavMgrOpen(false)} />

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
