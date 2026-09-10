// ============================================================================
//  Modal.jsx  —  Genel amacli modal/dialog. ESC ile kapanir, arka plan kilidi.
// ============================================================================
import { useEffect } from 'react'
import { IconClose } from './Icons.jsx'

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'max-w-2xl',
  // Genis icerik (belge onizlemesi gibi) icin: modal neredeyse tum ekrani
  // kaplar. Diger tum kullanimlar (formlar, onay modallari) varsayilan
  // (kompakt) davranisi KORUR — bu yuzden opsiyonel ve varsayilani false.
  fullScreen = false,
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={
        'fixed inset-0 z-50 flex items-start justify-center overflow-y-auto ' +
        (fullScreen ? 'p-2 sm:p-4' : 'p-4 sm:p-8')
      }
    >
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={
          'card relative z-10 my-auto flex w-full flex-col animate-fade-in ' +
          (fullScreen ? 'h-[94vh] max-w-[98vw]' : maxWidth)
        }
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn-ghost -mr-2 -mt-1 rounded-lg p-2"
            aria-label="Kapat"
          >
            <IconClose size={20} />
          </button>
        </div>

        <div className={'overflow-y-auto px-6 py-5 ' + (fullScreen ? 'flex-1' : 'max-h-[70vh]')}>
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
