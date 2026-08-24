// ============================================================================
//  Login.jsx  —  Giriş ekranı. İki yol:
//    1) Proje Yöneticisi (PM): kullanıcı adı + şifre (admin/admin).
//    2) Passcode: personel 5 karakterlik kodu ile doğrudan projesine girer.
//  "Kayıt Ol" (Sign Up) tamamen kaldırıldı.
// ============================================================================
import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import Logo from '../components/common/Logo.jsx'

// ---- PM giriş formu --------------------------------------------------------
function ManagerLogin() {
  const { login } = useAuth()
  const { t } = useLang()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <ErrorBox msg={error} />}
      <Field
        label={t('login.username')}
        type="text"
        value={username}
        onChange={setUsername}
        placeholder={t('login.ph.username')}
        autoComplete="username"
        autoFocus
      />
      <Field
        label={t('login.password')}
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="••••••••"
        autoComplete="current-password"
      />
      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full justify-center disabled:opacity-60"
      >
        {loading ? t('login.signingIn') : t('login.signIn')}
      </button>
    </form>
  )
}

// ---- Passcode giriş formu --------------------------------------------------
function PasscodeLogin() {
  const { passcodeLogin } = useAuth()
  const { t } = useLang()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await passcodeLogin(code.trim().toUpperCase())
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <ErrorBox msg={error} />}
      <div>
        <label className="label">{t('login.passcode')}</label>
        <input
          className="input text-center text-2xl font-bold tracking-[0.5em] uppercase"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
          placeholder="•••••"
          maxLength={5}
          autoFocus
          required
        />
        <p className="mt-1.5 text-center text-[11px] text-slate-400">{t('login.passcodeHint')}</p>
      </div>
      <button
        type="submit"
        disabled={loading || code.length < 5}
        className="btn-primary w-full justify-center disabled:opacity-60"
      >
        {loading ? t('login.signingIn') : t('login.signIn')}
      </button>
    </form>
  )
}

// ---- Ortak yardımcı bileşenler ---------------------------------------------
function Field({ label, type, value, onChange, placeholder, autoComplete, autoFocus }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
      />
    </div>
  )
}

function ErrorBox({ msg }) {
  return (
    <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
      {msg}
    </div>
  )
}

function LangSwitch() {
  const { lang, setLang, t } = useLang()
  return (
    <div className="mb-5">
      <div className="mb-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {t('lang.label')}
      </div>
      <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {[
          { key: 'tr', label: t('lang.tr') },
          { key: 'en', label: t('lang.en') },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setLang(key)}
            className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition-all ${
              lang === key
                ? 'bg-white shadow text-slate-900 dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---- Ana bileşen -----------------------------------------------------------
export default function Login() {
  const [mode, setMode] = useState('manager') // 'manager' | 'passcode'
  const { t } = useLang()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex items-center justify-center">
            <Logo size={64} className="drop-shadow-lg" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {t('app.name')}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('app.tagline')}</p>
        </div>

        <div className="card">
          <LangSwitch />

          {/* Mod seçimi: PM girişi / Passcode */}
          <div className="mb-5 flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {[
              { key: 'manager', label: t('login.tab.manager') },
              { key: 'passcode', label: t('login.tab.passcode') },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition-all ${
                  mode === key
                    ? 'bg-white shadow text-slate-900 dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'manager' ? <ManagerLogin /> : <PasscodeLogin />}
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400">{t('login.footer')}</p>
      </div>
    </div>
  )
}
