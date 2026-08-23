// ============================================================================
//  AIAssistant.jsx  —  Yüzen AKILLI AI Asistanı.
//  Sağ alt köşede yüzen buton, slide-up chat paneli. İnternete çıkmaz.
//
//  v2 — Artik canli uygulamanin "yoneticisi" gibi calisir:
//    * Sayfa yonlendirme (navigate)
//    * Dogal dille FILTRELEME  -> Gereksinimler sayfasinda otomatik filtre
//    * AKSIYON                 -> tek gereksinimi guncelle / durumunu incele
//  Niyeti assistantService ayristirir; CALISTIRMA burada (useApp servisleri).
// ============================================================================
import { useState, useRef, useEffect } from 'react'
import { detectIntent, SUGGESTIONS } from '../../services/assistantService.js'
import { useApp } from '../../context/AppContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { getTraceForRequirement, computeRequirementStatus } from '../../utils/coverage.js'

const WELCOME = { id: 'welcome', from: 'ai', text: null, welcome: true }

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Filtre nesnesini okunabilir bir ozete cevirir (yanit metni icin).
function describeFilters(f) {
  const parts = []
  if (f.type) parts.push(f.type)
  if (f.priority) parts.push(`Öncelik: ${f.priority}`)
  if (f.status) parts.push(`Durum: ${f.status}`)
  if (f.category) parts.push(`Alan: ${f.category}`)
  if (f.dal_level) parts.push(f.dal_level)
  if (f.uncovered) parts.push('testi eksik (kapsam dışı)')
  return parts.length ? parts.join(' · ') : 'tüm gereksinimler'
}

export default function AIAssistant({ onNavigate, onApplyFilters }) {
  const { currentUser } = useAuth()
  const { requirements, links, editRequirement } = useApp()
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([WELCOME])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  const addMessage = (msg) =>
    setMessages((prev) => [...prev, { id: Date.now() + Math.random(), time: formatTime(), ...msg }])

  // --- Niyet calistiricilari -------------------------------------------------
  const findByTextId = (textId) =>
    requirements.find((r) => r.text_id.toUpperCase() === textId.toUpperCase()) || null

  // Tek gereksinim guncelleme (oncelik / DAL / alan).
  const runUpdate = async (intent) => {
    const req = findByTextId(intent.textId)
    if (!req) {
      addMessage({ from: 'ai', text: `⚠️ "${intent.textId}" kodlu bir gereksinim bulamadım.` })
      return
    }
    const current = req[intent.field]
    if (current === intent.value) {
      addMessage({ from: 'ai', text: `ℹ️ ${req.text_id} zaten "${intent.value}" değerinde. Değişiklik yapmadım.` })
      return
    }
    try {
      await editRequirement(req.id, { [intent.field]: intent.value })
      addMessage({
        from: 'ai',
        text: `✅ ${req.text_id} güncellendi.\n${intent.fieldLabel}: ${current} → ${intent.value}`,
      })
    } catch (err) {
      addMessage({ from: 'ai', text: `❌ Güncelleme başarısız: ${err.message || 'bilinmeyen hata'}` })
    }
  }

  // Tek gereksinim inceleme (durum + dogrulayan test senaryolari).
  const runInspect = (intent) => {
    const req = findByTextId(intent.textId)
    if (!req) {
      addMessage({ from: 'ai', text: `⚠️ "${intent.textId}" kodlu bir gereksinim bulamadım.` })
      return
    }
    const byId = Object.fromEntries(requirements.map((r) => [r.id, r]))
    const trace = getTraceForRequirement(req.id, requirements, links)
    const status = computeRequirementStatus(req, links, byId)

    if (req.type === 'Test Case') {
      const verifies = trace.verifies
      addMessage({
        from: 'ai',
        text:
          `🔍 ${req.text_id} · ${req.title}\n` +
          `Tip: Test Case · Durum (test sonucu): ${status}\n` +
          `Doğruladığı gereksinim: ${verifies.length} adet` +
          (verifies.length ? `\n→ ${verifies.map((v) => v.req.text_id).join(', ')}` : ''),
      })
      return
    }

    const tcs = trace.verifiedBy
    const passed = tcs.filter((x) => x.req.status === 'Approved').length
    let verdict
    if (tcs.length === 0) verdict = 'Bağlı test senaryosu yok → otomatik durum "In Review" (kapsam dışı!).'
    else if (passed === tcs.length) verdict = `Bağlı ${tcs.length} test senaryosunun tümü geçti → "Approved".`
    else verdict = `${tcs.length} test senaryosundan ${passed} tanesi geçti → "Rejected".`

    addMessage({
      from: 'ai',
      text:
        `🔍 ${req.text_id} · ${req.title}\n` +
        `Tip: ${req.type} · DAL: ${req.dal_level} · Öncelik: ${req.priority}\n` +
        `Otomatik Durum: ${status}\n${verdict}` +
        (tcs.length ? `\n→ ${tcs.map((x) => `${x.req.text_id}(${x.req.status})`).join(', ')}` : ''),
    })
  }

  const handleSend = (text) => {
    const t = (text ?? input).trim()
    if (!t) return
    setInput('')
    addMessage({ from: 'user', text: t })
    setTyping(true)

    setTimeout(async () => {
      setTyping(false)
      const intent = detectIntent(t)
      if (!intent) return

      switch (intent.type) {
        case 'navigate':
          addMessage({ from: 'ai', text: intent.reply })
          setTimeout(() => {
            onNavigate(intent.target)
            setOpen(false)
          }, 700)
          break

        case 'filter':
          addMessage({
            from: 'ai',
            text: `${intent.reply}\nKriter: ${describeFilters(intent.filters)}`,
          })
          setTimeout(() => {
            onApplyFilters?.(intent.filters)
            onNavigate('requirements')
            setOpen(false)
          }, 800)
          break

        case 'action':
          if (intent.op === 'update') await runUpdate(intent)
          else runInspect(intent)
          break

        case 'greeting':
        case 'help':
        case 'unknown':
        default:
          addMessage({ from: 'ai', text: intent.reply, suggestions: intent.suggestions })
          break
      }
    }, 550)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* ---- Yüzen Buton ---- */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all duration-300 ${
          open ? 'bg-slate-600 rotate-45 scale-90' : 'bg-violet-600 hover:bg-violet-700 hover:scale-110'
        }`}
        title="AI Asistan"
        aria-label="AI Asistan"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z"/>
            <path d="M19 16l.75 2.25L22 19l-2.25.75L19 22l-.75-2.25L16 19l2.25-.75z"/>
            <path d="M5 16l.5 1.5L7 18l-1.5.5L5 20l-.5-1.5L3 18l1.5-.5z"/>
          </svg>
        )}
      </button>

      {/* ---- Chat Paneli ---- */}
      <div className={`fixed bottom-24 right-6 z-40 w-80 rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 transition-all duration-300 origin-bottom-right ${
        open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`}>

        {/* Header */}
        <div className="flex items-center gap-3 rounded-t-2xl bg-violet-600 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-lg">✦</div>
          <div className="flex-1 leading-tight">
            <div className="text-sm font-bold text-white">{t('ai.title')}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-violet-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {t('ai.online')}
            </div>
          </div>
        </div>

        {/* Mesajlar */}
        <div className="flex h-72 flex-col gap-3 overflow-y-auto px-3 py-3 scroll-smooth">
          {messages.map((msg) =>
            msg.welcome ? (
              <WelcomeCard key={msg.id} user={currentUser} t={t} />
            ) : msg.from === 'ai' ? (
              <AiMessage key={msg.id} text={msg.text} time={msg.time} suggestions={msg.suggestions} onSuggest={handleSend} />
            ) : (
              <UserMessage key={msg.id} text={msg.text} time={msg.time} />
            )
          )}

          {typing && (
            <div className="flex items-end gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-sm dark:bg-violet-900/40">✦</div>
              <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3 dark:bg-slate-800">
                {[0,1,2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t('ai.placeholder')}
            className="flex-1 rounded-full bg-slate-100 px-4 py-2 text-sm outline-none placeholder:text-slate-400 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </>
  )
}

// ---- Alt bileşenler -------------------------------------------------------

function WelcomeCard({ user, t }) {
  const name = user?.name ? `, ${user.name.split(' ')[0]}` : ''
  return (
    <div className="rounded-xl bg-violet-50 p-3 text-xs dark:bg-violet-950/30">
      <p className="mb-1.5 font-semibold text-violet-700 dark:text-violet-300">
        {t('ai.welcome', { name })}
      </p>
      <p className="text-slate-500 dark:text-slate-400">
        {t('ai.welcomeHint')}
      </p>
    </div>
  )
}

function AiMessage({ text, time, suggestions, onSuggest }) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm dark:bg-violet-900/40">✦</div>
      <div className="max-w-[85%]">
        <div className="whitespace-pre-line rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {text}
        </div>
        {suggestions && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.text}
                onClick={() => onSuggest(s.text)}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 transition hover:border-violet-300 hover:text-violet-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {s.emoji} {s.text}
              </button>
            ))}
          </div>
        )}
        {time && <div className="mt-0.5 text-[10px] text-slate-400">{time}</div>}
      </div>
    </div>
  )
}

function UserMessage({ text, time }) {
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-violet-600 px-3 py-2 text-xs text-white">
        {text}
      </div>
      {time && <div className="mt-0.5 text-[10px] text-slate-400">{time}</div>}
    </div>
  )
}
