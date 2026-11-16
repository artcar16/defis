/**
 * Formulaire de connexion email + mot de passe (réutilisable à l'étape 4 avec Supabase).
 * Pas de lien magique : sur iPhone, il s'ouvrirait dans Safari et pas dans l'app installée.
 *
 * Pas de soumission native : dans un cadre sandboxé sans allow-forms, le navigateur la bloque
 * avant même l'événement submit. Le bouton est de type « button » et Entrée est gérée à la main.
 * Le <form> reste pour aider les gestionnaires de mots de passe ; sans bouton submit et avec
 * deux champs, il ne se soumet jamais tout seul.
 */
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { errorText } from '../../ui/format'
import { Button } from '../../ui/kit'
import { INPUT_CLASS } from './ui'

export interface LoginFormProps {
  /** Lance la connexion. Une erreur levée (message en français) s'affiche sous le formulaire. */
  onSubmit: (email: string, password: string) => Promise<void>
  /** Erreur fournie par le parent (ex. « Mot de passe incorrect »). */
  error?: string | null
  /** Connexion en cours (piloté par le parent) ; sinon le formulaire gère son propre état. */
  loading?: boolean
  /** Couleur du bouton (par défaut, celle du joueur connecté / corail). */
  color?: string
  submitLabel?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginForm({ onSubmit, error = null, loading = false, color, submitLabel = 'Entrer dans le ring 🥊' }: LoginFormProps) {
  const emailId = useId()
  const passwordId = useId()
  const errorId = useId()
  const reduced = useReducedMotion() ?? false
  const shake = useAnimationControls()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [pending, setPending] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const busy = loading || pending
  const message = localError ?? error

  useEffect(() => {
    if (message && !reduced) void shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.42 } })
  }, [message, reduced, shake])

  const submit = async () => {
    if (busy) return
    const cleanEmail = email.trim().toLowerCase()
    if (!EMAIL_RE.test(cleanEmail)) return setLocalError('Cet email a une drôle de tête 🤔')
    if (!password) return setLocalError('Et le mot de passe\u00a0? 🔑')
    setLocalError(null)
    setPending(true)
    try {
      await onSubmit(cleanEmail, password)
    } catch (err) {
      setLocalError(errorText(err))
    } finally {
      setPending(false)
    }
  }

  /** Entrée (hors saisie IME) : depuis l'email, passe au mot de passe ; depuis le mot de passe, se connecte. */
  const isEnter = (e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && !e.nativeEvent.isComposing

  return (
    <motion.form animate={shake} onSubmit={(e) => e.preventDefault()} noValidate>
      <label htmlFor={emailId} className="mb-1.5 block px-1 font-display text-[15px] font-semibold text-ink-soft">
        Email
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[20px]" aria-hidden="true">
          📧
        </span>
        <input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          placeholder="toi@exemple.fr"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setLocalError(null)
          }}
          onKeyDown={(e) => {
            if (!isEnter(e)) return
            e.preventDefault()
            passwordRef.current?.focus()
          }}
          aria-invalid={!!message}
          aria-describedby={message ? errorId : undefined}
          className={`${INPUT_CLASS} min-h-14 pl-12`}
        />
      </div>

      <label htmlFor={passwordId} className="mt-4 mb-1.5 block px-1 font-display text-[15px] font-semibold text-ink-soft">
        Mot de passe
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[20px]" aria-hidden="true">
          🔑
        </span>
        <input
          ref={passwordRef}
          id={passwordId}
          type={show ? 'text' : 'password'}
          autoComplete="current-password"
          enterKeyHint="go"
          placeholder="••••••••"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setLocalError(null)
          }}
          onKeyDown={(e) => {
            if (!isEnter(e)) return
            e.preventDefault()
            void submit()
          }}
          aria-invalid={!!message}
          aria-describedby={message ? errorId : undefined}
          className={`${INPUT_CLASS} min-h-14 pr-14 pl-12`}
        />
        <motion.button
          type="button"
          whileTap={{ scale: 0.85 }}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Cacher le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={show}
          className="absolute top-1/2 right-1 grid size-12 -translate-y-1/2 place-items-center rounded-xl text-[22px]"
        >
          <span aria-hidden="true">{show ? '🙈' : '👀'}</span>
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {message && (
          <motion.p
            id={errorId}
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <span
              className="mt-3 block rounded-2xl px-4 py-2.5 text-[15px] font-semibold text-ink"
              style={{ background: 'color-mix(in oklab, var(--color-craquage) 16%, var(--color-surface))' }}
            >
              {message}
            </span>
          </motion.p>
        )}
      </AnimatePresence>

      <Button block size="lg" className="mt-5" disabled={busy} color={color} onClick={() => void submit()}>
        {busy ? (
          <>
            <motion.span
              className="inline-block"
              animate={reduced ? undefined : { rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              aria-hidden="true"
            >
              🥊
            </motion.span>
            Connexion…
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </motion.form>
  )
}
