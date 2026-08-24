// ============================================================================
//  LanguageContext.jsx  —  Uygulama dili (TR / EN) yönetimi.
//  Seçim localStorage'da saklanır; t(key, vars) ile çeviri alınır.
//  vars verilirse dizedeki {x} yer tutucuları değiştirilir.
// ============================================================================
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { STRINGS } from '../i18n/translations.js'

const LanguageContext = createContext(null)
const STORAGE_KEY = 'ehsim_lang'

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'tr' || saved === 'en') return saved
    }
    return 'tr'
  })

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next) => {
    if (next !== 'tr' && next !== 'en') return
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* yok say */
    }
  }, [])

  const toggleLang = useCallback(() => {
    setLang(lang === 'tr' ? 'en' : 'tr')
  }, [lang, setLang])

  const t = useCallback(
    (key, vars) => {
      const table = STRINGS[lang] || STRINGS.tr
      let str = table[key] ?? STRINGS.tr[key] ?? key
      if (vars) {
        for (const k of Object.keys(vars)) {
          str = str.split(`{${k}}`).join(String(vars[k]))
        }
      }
      return str
    },
    [lang],
  )

  const value = { lang, setLang, toggleLang, t }
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLang() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang yalnızca <LanguageProvider> içinde kullanılabilir.')
  return ctx
}
