/**
 * 🔢 Saisie du code secret « façon code SMS » : 6 cases, mais un seul vrai champ
 * (clavier numérique, collage accepté) posé par-dessus, invisible. Envoi automatique dès
 * que les 6 chiffres sont là ; Entrée envoie aussi. Partagé par l'écran de connexion et
 * les réglages (changer mon code).
 *
 * Les chiffres sont masqués (●), sauf le dernier tapé, montré un court instant.
 * Sur erreur, le parent vide la saisie et incrémente `errorKey` : les cases secouent, et le
 * message est un NOUVEAU nœud (role="alert") : les lecteurs d'écran l'annoncent à chaque
 * fois, même s'il est identique au précédent. Quand l'étape change (`label` : « Choisis… »,
 * puis « Confirme… »), une zone invisible l'annonce : le focus, lui, ne bouge pas.
 */
import { AnimatePresence, motion, useAnimate, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { CODE_LENGTH } from '../../data/source'
import { deep, tint } from '../../ui/color'
import { springy } from '../../ui/kit'
import { cleanCode, isCodeComplete, pasteCode } from './code'

/** Durée pendant laquelle le dernier chiffre tapé reste visible (ms). */
const REVEAL_MS = 700

const ERROR_COLOR = 'var(--color-craquage)'

export function CodeInput({
  value,
  onChange,
  onComplete,
  label,
  color = 'var(--me)',
  busy = false,
  error = null,
  errorKey = 0,
  autoFocus = false,
}: {
  value: string
  onChange: (code: string) => void
  /** Les 6 chiffres sont là (frappe, collage ou Entrée). */
  onComplete: (code: string) => void
  /** Nom du champ pour les lecteurs d'écran (« Ton code secret »). */
  label: string
  /** Couleur d'accent (case active). */
  color?: string
  /** Envoi en cours : la saisie est figée (le clavier reste ouvert). */
  busy?: boolean
  /** Message d'erreur affiché sous les cases. */
  error?: string | null
  /** Incrémenté à chaque erreur : les cases secouent. */
  errorKey?: number
  autoFocus?: boolean
}) {
  const reduced = useReducedMotion() ?? false
  const inputRef = useRef<HTMLInputElement>(null)
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const [focused, setFocused] = useState(false)
  const [reveal, setReveal] = useState(-1)
  const errorId = useId()

  // Nouvelle étape (même champ, nouveau nom) : annoncée aux lecteurs d'écran.
  const [shownLabel, setShownLabel] = useState(label)
  const [announce, setAnnounce] = useState('')
  if (label !== shownLabel) {
    setShownLabel(label)
    setAnnounce(`${label}, ${CODE_LENGTH} chiffres`)
  }

  // Le dernier chiffre tapé se cache après un court instant.
  useEffect(() => {
    if (reveal < 0) return
    const t = window.setTimeout(() => setReveal(-1), REVEAL_MS)
    return () => window.clearTimeout(t)
  }, [reveal, value])

  // Erreur : les cases secouent (et le téléphone vibre, là où c'est possible).
  useEffect(() => {
    if (errorKey === 0) return
    try {
      navigator.vibrate?.(60)
    } catch {
      // Pas de vibreur : tant pis.
    }
    if (reduced || !scope.current) return
    void animate(scope.current, { x: [0, -12, 11, -8, 6, -3, 0] }, { duration: 0.42, ease: 'easeOut' })
  }, [errorKey, reduced, animate, scope])

  const update = (next: string) => {
    if (busy || next === value) return
    setReveal(next.length > value.length ? next.length - 1 : -1)
    onChange(next)
    if (isCodeComplete(next) && !isCodeComplete(value)) onComplete(next)
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const next = pasteCode(value, e.clipboardData.getData('text'))
    update(next)
    // Un code collé ne se montre pas, même un instant.
    setReveal(-1)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (!busy && isCodeComplete(value)) onComplete(value)
  }

  // Le curseur reste toujours au bout : on tape, on efface, jamais au milieu.
  const caretToEnd = () => {
    const el = inputRef.current
    if (!el) return
    const end = el.value.length
    if (el.selectionStart !== end || el.selectionEnd !== end) el.setSelectionRange(end, end)
  }

  const showError = !!error && value.length === 0

  return (
    <div>
      <div ref={scope} className="relative mx-auto flex w-full max-w-[22rem] justify-center gap-2">
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const digit = value[i]
          // Case active = la prochaine à remplir (aucune quand le code est complet).
          const active = focused && !busy && i === value.length
          const ring = showError ? ERROR_COLOR : active ? color : digit ? tint(color, 45, 'var(--color-line)') : 'transparent'
          return (
            <div
              key={i}
              aria-hidden="true"
              className="grid h-[58px] max-w-[52px] min-w-0 flex-1 place-items-center rounded-2xl transition-[background-color,box-shadow] duration-150"
              style={{
                background: digit ? tint(color, 10) : showError ? tint(ERROR_COLOR, 10, 'var(--color-sunken)') : 'var(--color-sunken)',
                boxShadow: `inset 0 0 0 ${active || showError ? 3 : 2}px ${ring}`,
              }}
            >
              <AnimatePresence initial={false}>
                {digit ? (
                  <motion.span
                    key={i === reveal ? `d${digit}` : 'dot'}
                    initial={reduced ? false : { scale: 0.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={reduced ? undefined : { scale: 0.6, opacity: 0 }}
                    transition={springy}
                    className="col-start-1 row-start-1 font-display text-[28px] leading-none font-bold"
                    style={{ color: deep(color, 70) }}
                  >
                    {i === reveal ? digit : <span className="block size-3.5 rounded-full bg-current" />}
                  </motion.span>
                ) : active ? (
                  <motion.span
                    key="caret"
                    className="col-start-1 row-start-1 block h-7 w-[3px] rounded-full"
                    style={{ background: color }}
                    animate={reduced ? undefined : { opacity: [1, 1, 0, 0] }}
                    transition={{ duration: 1, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
                  />
                ) : null}
              </AnimatePresence>
            </div>
          )
        })}

        {/* Le vrai champ, invisible, par-dessus les cases : un tap n'importe où ouvre le clavier. */}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => update(cleanCode(e.target.value))}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setFocused(true)
            caretToEnd()
          }}
          onBlur={() => setFocused(false)}
          onSelect={caretToEnd}
          onClick={caretToEnd}
          readOnly={busy}
          autoFocus={autoFocus}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-label={`${label} (${CODE_LENGTH} chiffres)`}
          aria-invalid={showError || undefined}
          aria-describedby={error ? errorId : undefined}
          className="absolute inset-0 z-10 h-full w-full cursor-text appearance-none border-0 bg-transparent text-transparent caret-transparent opacity-0 outline-none"
        />
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            // Un nouveau nœud par échec (errorKey) : annoncé même si le texte est le même.
            key={`${errorKey}|${error}`}
            id={errorId}
            role="alert"
            initial={reduced ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={springy}
            className="mx-auto mt-3 max-w-[22rem] rounded-2xl px-3 py-2 text-center text-[15px] leading-snug font-bold text-balance"
            style={{ background: tint(ERROR_COLOR, 12, 'var(--color-surface)'), color: deep(ERROR_COLOR, 62) }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
