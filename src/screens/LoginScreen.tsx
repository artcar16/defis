/**
 * 🥊 Écran de connexion (décision 20) : pas d'email ni de compte, un prénom et un code.
 * Deux étapes, au pouce :
 * 1. « Qui es-tu ? » : on touche son avatar (les deux joueurs face à face).
 * 2. Le code secret à 6 chiffres. Le tout premier code tapé pour un prénom devient le
 *    sien : on le fait taper deux fois (« Choisis », puis « Confirme-le »).
 * Le téléphone s'en souvient ensuite. En maquette : une carte le dit clairement en haut
 * (données inventées, n'importe quel code), même parcours, plus les raccourcis « Jouer en
 * tant que ».
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useState } from 'react'
import { DEFAULT_PLAYERS } from '../config/defaults'
import { plural, queName, typo } from '../core/fr'
import type { Player, PlayerId } from '../core/types'
import { useDuel, type DemoContext } from '../data/DuelProvider'
import { KEY_VAR, URL_VAR } from '../data/mode'
import { CODE_LENGTH, type LoginPlayer } from '../data/source'
import { offlineHint } from '../data/supabase/errors'
import { deep, tint } from '../ui/color'
import { DemoPill } from '../ui/DemoPill'
import { errorText } from '../ui/format'
import { Avatar, Button, springy } from '../ui/kit'
import { useToast } from '../ui/toast'
import { newCodeStep } from './settings/code'
import { CodeInput } from './settings/CodeInput'
import { ON_GOLD } from './settings/format'

type Fighter = Pick<Player, 'id' | 'name' | 'emoji' | 'color'>

/** Où en est la saisie du code : en attente de la liste, code connu, premier code (choix, confirmation). */
type Phase = 'wait' | 'enter' | 'choose' | 'confirm'

/** Emojis qui flottent en fond (purement décoratifs). */
const FLOATERS: { e: string; top?: number; bottom?: number; left?: string; right?: string; size: number; delay: number }[] = [
  { e: '🍪', top: 64, left: '5%', size: 34, delay: 0 },
  { e: '💅', top: 36, right: '8%', size: 30, delay: 0.8 },
  { e: '🏃', top: 236, left: '3%', size: 28, delay: 1.6 },
  { e: '🦟', top: 218, right: '4%', size: 26, delay: 0.4 },
  { e: '🏆', top: 8, left: '30%', size: 24, delay: 1.2 },
]

/** À l'étape du code, le titre est plus petit et la carte prend la largeur : les emojis descendent en bas. */
const FLOATERS_COMPACT: typeof FLOATERS = [
  { e: '🍪', bottom: 36, left: '6%', size: 30, delay: 0 },
  { e: '💅', bottom: 14, right: '10%', size: 28, delay: 0.8 },
  { e: '🏃', bottom: 8, left: '30%', size: 24, delay: 1.6 },
  { e: '🦟', bottom: 50, right: '4%', size: 24, delay: 0.4 },
  { e: '🏆', bottom: 12, left: '58%', size: 22, delay: 1.2 },
]

const DIGITS = plural(CODE_LENGTH, 'chiffre')

/** Textes de l'étape du code, selon la phase (`label` : nom du champ pour les lecteurs d'écran). */
const PHASE_TEXT: Record<Phase, { title: string; hint: string; cta: string; label: string }> = {
  wait: { title: 'Ton code secret 🔐', hint: 'Une seconde, je vérifie qui tu es…', cta: 'Un instant…', label: 'Ton code secret' },
  enter: { title: 'Ton code secret 🔐', hint: `Tape tes ${DIGITS} magiques 🪄`, cta: 'Entrer dans le ring 🥊', label: 'Ton code secret' },
  choose: {
    title: 'Choisis ton code secret ✨',
    hint: `${DIGITS} rien qu’à toi (et pas 123456 😏). Garde-le bien en tête !`,
    cta: 'Suivant →',
    label: 'Choisis ton code secret',
  },
  confirm: {
    title: 'Confirme-le 🔁',
    hint: `Retape les mêmes ${DIGITS}, pour vérifier qu’ils sont bien gravés 🧠`,
    cta: 'C’est mon code ✅',
    label: 'Confirme ton code secret',
  },
}

export function LoginScreen() {
  const { demo, snapshot, source, problem, backend } = useDuel()
  const toast = useToast()
  const reduced = useReducedMotion() ?? false

  // Les prénoms (et s'ils ont déjà un code) : demandés au serveur, avec un repli pour l'affichage.
  const [list, setList] = useState<LoginPlayer[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const needList = list === null
  useEffect(() => {
    if (!needList) return
    let alive = true
    source.loginPlayers().then(
      (players) => {
        if (!alive) return
        setList(players)
        setListError(null)
      },
      (e) => alive && setListError(errorText(e)),
    )
    return () => {
      alive = false
    }
    // `problem` qui change (réseau revenu, base prête) = on retente.
  }, [source, needList, attempt, problem])

  const [pickedId, setPickedId] = useState<PlayerId | null>(null)
  const [first, setFirst] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState(0)
  const [busy, setBusy] = useState(false)

  const fallback: Fighter[] =
    snapshot.players.length >= 2 ? snapshot.players : DEFAULT_PLAYERS.map((p) => ({ id: p.key, name: p.name, emoji: p.emoji, color: p.color }))
  const fighters: Fighter[] = list && list.length >= 2 ? list : fallback
  const [left, right] = fighters

  // Prénom touché pendant le chargement mais absent de la liste reçue : retour au choix.
  if (pickedId && list && !list.some((p) => p.id === pickedId)) setPickedId(null)

  const picked = pickedId ? (fighters.find((f) => f.id === pickedId) ?? null) : null
  const known = list?.find((p) => p.id === pickedId)
  const phase: Phase = !known ? 'wait' : known.hasCode ? 'enter' : first === null ? 'choose' : 'confirm'

  const reset = (id: PlayerId | null) => {
    setPickedId(id)
    setFirst(null)
    setCode('')
    setError(null)
    setBusy(false)
  }

  const fail = (message: string) => {
    setError(message)
    setCode('')
    setErrorKey((k) => k + 1)
  }

  const signIn = async (player: Fighter, value: string, created: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await source.signIn(player.id, value)
      // Connecté : l'app passe toute seule au Ring (cet écran disparaît).
      if (created) {
        const otherName = fighters.find((f) => f.id !== player.id)?.name
        toast({
          text: `🔐 Code enregistré ! Ne le dis à personne${otherName ? ` (surtout pas à ${otherName})` : ''} 🤫`,
          color: player.color,
          duration: 4500,
        })
      }
    } catch (e) {
      setBusy(false)
      fail(errorText(e))
      if (created) {
        setFirst(null)
        // Un autre téléphone a peut-être choisi ce code entre-temps : on relit les prénoms.
        source.loginPlayers().then(setList, () => {})
      }
    }
  }

  const onComplete = (value: string) => {
    if (busy || !picked || phase === 'wait') return
    if (phase === 'enter') return void signIn(picked, value, false)
    const step = newCodeStep({ first }, value)
    if (step.kind === 'next') {
      setFirst(step.state.first)
      setCode('')
      setError(null)
    } else if (step.kind === 'error') {
      setFirst(null)
      fail(step.error)
    } else {
      void signIn(picked, step.code, true)
    }
  }

  const compact = picked !== null

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col overflow-hidden px-4 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      {/* Décor */}
      {/* (En maquette, le décor descend sous la pastille.) */}
      <div className={`pointer-events-none absolute inset-0 ${demo && !compact ? 'top-10' : ''}`} aria-hidden="true">
        {(compact ? FLOATERS_COMPACT : FLOATERS).map((f) => (
          <span
            key={f.e}
            className="absolute animate-float opacity-40"
            style={{ top: f.top, bottom: f.bottom, left: f.left, right: f.right, fontSize: f.size, animationDelay: `${f.delay}s` }}
          >
            {f.e}
          </span>
        ))}
      </div>

      {/* Maquette : la pastille, comme sur tous les écrans */}
      {demo && <DemoPill className="relative" />}

      {/* Titre (plus petit à l'étape du code : le clavier prend la moitié de l'écran) */}
      <header className={`relative text-center ${compact ? 'pt-1' : demo ? 'pt-5' : 'pt-10'}`}>
        <motion.h1
          className={`font-display leading-[0.95] font-bold tracking-tight text-ink ${compact ? 'text-[30px]' : 'text-[46px]'}`}
          initial={reduced ? false : { y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...springy, delay: 0.12 }}
        >
          Duel des{' '}
          <span className="whitespace-nowrap">
            Défauts{' '}
            <motion.span
              className="inline-block origin-bottom-left"
              animate={reduced ? undefined : { rotate: [0, -18, 14, 0], x: [0, -4, 6, 0] }}
              transition={{ duration: 0.7, delay: 0.9, repeat: Infinity, repeatDelay: 3 }}
              aria-hidden="true"
            >
              🥊
            </motion.span>
          </span>
        </motion.h1>
        {!compact && (
          <motion.p
            className="mx-auto mt-3 max-w-[20rem] text-[16px] leading-snug font-semibold text-balance text-ink-soft"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Ongles, grattage, grignotage… Que le duel commence&nbsp;: qui perd fait la vaisselle 🍽️
          </motion.p>
        )}
      </header>

      {problem && (
        <ProblemBanner text={problem} detail={offlineHint(problem, backend.kind === 'supabase' ? backend.host : null)} className="mt-5" />
      )}

      {/* Maquette : on lève toute ambiguïté avant de choisir son prénom. */}
      {demo && !picked && <DemoNotice demo={demo} />}

      {picked ? (
        <CodeStep
          key={picked.id}
          player={picked}
          phase={phase}
          code={code}
          onCode={(v) => {
            setCode(v)
            if (v) setError(null)
          }}
          onComplete={onComplete}
          onBack={() => reset(null)}
          busy={busy}
          error={error}
          errorKey={errorKey}
          // Liste des prénoms indisponible : pas une erreur de code (le bandeau dit déjà pourquoi s'il y en a un).
          waitError={phase === 'wait' && listError ? (problem ? null : listError) : null}
          onRetry={phase === 'wait' && listError ? () => setAttempt((a) => a + 1) : null}
          demo={demo !== null}
        />
      ) : (
        <>
          <motion.div
            className={`relative text-center ${demo ? 'mt-5' : 'mt-7'}`}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springy, delay: 0.35 }}
          >
            <h2 className="font-display text-[24px] leading-tight font-bold text-ink">{typo('Qui es-tu ?')}</h2>
            <p className="text-[16px] font-semibold text-ink-soft">Touche ton avatar 👇</p>
          </motion.div>

          {/* Face à face : chaque avatar est un bouton */}
          <div className="relative mt-4 flex items-center justify-center gap-3">
            <FighterButton player={left} side="left" onPick={() => reset(left.id)} />
            <motion.div
              className="z-10 grid size-16 shrink-0 place-items-center rounded-full font-display text-[26px] font-bold"
              style={{ background: 'var(--color-gold)', color: ON_GOLD, boxShadow: '0 5px 0 var(--color-gold-dark), var(--shadow-pop)' }}
              initial={reduced ? false : { scale: 0, rotate: -60 }}
              animate={{ scale: 1, rotate: -8 }}
              transition={{ type: 'spring', stiffness: 500, damping: 12, delay: 0.45 }}
              aria-hidden="true"
            >
              VS
            </motion.div>
            <FighterButton player={right} side="right" onPick={() => reset(right.id)} />
          </div>

          {listError && !problem && (
            <div className="relative mt-5 flex flex-col items-center gap-2 text-center">
              <p className="text-[15px] leading-snug font-semibold text-ink-soft">{listError}</p>
              <Button variant="soft" size="md" onClick={() => setAttempt((a) => a + 1)}>
                🔄 Réessayer
              </Button>
            </div>
          )}

          {/* Maquette : raccourcis, en secondaire */}
          {demo && (
            <motion.section
              className="card relative mt-8 border-[3px] border-dashed p-4"
              style={{ borderColor: tint('var(--color-gold)', 70, 'var(--color-line)'), background: tint('var(--color-gold)', 8) }}
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springy, delay: 0.55 }}
              aria-labelledby="demo-title"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-[28px] leading-none" aria-hidden="true">
                  🧪
                </span>
                <div>
                  <h2 id="demo-title" className="font-display text-[19px] leading-tight font-bold text-ink">
                    Maquette
                  </h2>
                  <p className="text-[15px] leading-snug font-semibold text-ink-soft">Ou entre direct, sans code&nbsp;:</p>
                </div>
              </div>
              <div className="mt-3.5 flex flex-col gap-3">
                {[left, right].map((p) => (
                  <Button key={p.id} block size="md" color={p.color} className="text-[19px]! font-bold" onClick={() => demo.signInAs(p.id)}>
                    Jouer en tant {queName(p.name)} {p.emoji}
                  </Button>
                ))}
              </div>
            </motion.section>
          )}

          <p className="relative mt-6 text-center text-[14px] font-semibold text-ink-soft">
            Rien que vous deux. Pas de pub, pas de pitié 😈
          </p>
        </>
      )}
    </div>
  )
}

// ─── Maquette : la carte du haut ─────────────────────────────────────────────

/** « Ceci est la maquette » : points inventés, n'importe quel code (et, en local, ce qui manque). */
function DemoNotice({ demo }: { demo: DemoContext }) {
  const reduced = useReducedMotion() ?? false
  const { problems } = demo.diagnosis
  const missing = [
    ...(problems.includes('missingUrl') || problems.includes('invalidUrl') ? [URL_VAR] : []),
    ...(problems.includes('missingKey') ? [KEY_VAR] : []),
  ]
  return (
    <motion.section
      role="note"
      className="card relative mt-5 border-[3px] border-dashed px-4 py-3.5"
      style={{ borderColor: tint('var(--color-gold)', 70, 'var(--color-line)'), background: tint('var(--color-gold)', 10) }}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springy, delay: 0.25 }}
    >
      <p className="flex gap-2.5 text-[15px] leading-snug font-semibold text-ink">
        <span className="text-[26px] leading-none" aria-hidden="true">
          🧪
        </span>
        <span className="min-w-0 flex-1">
          <b className="font-display text-[17px]">{typo('Ceci est la maquette :')}</b>{' '}
          {typo('les points, manches et badges sont inventés. N’importe quel code marche.')}
        </span>
      </p>
      {demo.reason === 'dev' && missing.length > 0 && (
        <p className="mt-2 border-t-2 border-dashed border-line pt-2 text-[14px] leading-snug font-semibold text-ink-soft">
          {typo('💻 En local : il manque ')}
          {missing.map((name, i) => (
            <span key={name}>
              {i > 0 && (i === missing.length - 1 ? ' et ' : ', ')}
              <code className="font-mono text-[0.92em] font-bold [overflow-wrap:anywhere] text-ink">{name}</code>
            </span>
          ))}
          {typo(' dans le fichier .env (modèle : .env.example).')}
        </p>
      )}
      {demo.reason === 'asked' && (
        <a
          href={location.pathname}
          className="mt-2.5 flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-surface px-3.5 font-display text-[15px] font-semibold text-ink-soft shadow-[0_3px_0_var(--color-line)]"
        >
          🔌 Quitter la maquette
        </a>
      )}
    </motion.section>
  )
}

// ─── Étape 1 : les deux avatars ──────────────────────────────────────────────

function FighterButton({ player, side, onPick }: { player: Fighter; side: 'left' | 'right'; onPick: () => void }) {
  const reduced = useReducedMotion() ?? false
  const dir = side === 'left' ? -1 : 1
  return (
    <motion.button
      type="button"
      onClick={onPick}
      aria-label={`Je suis ${player.name}`}
      // iPhone SE : un peu plus petits, pour que le face-à-face tienne sans toucher les bords.
      className="flex w-[100px] flex-col items-center rounded-3xl pt-1 pb-2 outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--pc)] min-[360px]:w-[118px]"
      style={{ ['--pc' as string]: player.color }}
      initial={reduced ? false : { x: dir * 140, rotate: dir * 25, opacity: 0 }}
      animate={{ x: 0, rotate: 0, opacity: 1 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.2 }}
    >
      <motion.div
        animate={reduced ? undefined : { y: [0, -6, 0], rotate: [0, dir * -3, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: side === 'left' ? 0 : 1.2 }}
      >
        <Avatar player={player} size="xl" ring className="max-[359px]:size-24 max-[359px]:text-6xl" />
      </motion.div>
      <span className="mt-3 max-w-full truncate font-display text-[20px] font-bold" style={{ color: deep(player.color, 78) }}>
        {player.name}
      </span>
    </motion.button>
  )
}

// ─── Étape 2 : le code ───────────────────────────────────────────────────────

function CodeStep({
  player,
  phase,
  code,
  onCode,
  onComplete,
  onBack,
  busy,
  error,
  errorKey,
  waitError,
  onRetry,
  demo,
}: {
  player: Fighter
  phase: Phase
  code: string
  onCode: (code: string) => void
  onComplete: (code: string) => void
  onBack: () => void
  busy: boolean
  error: string | null
  errorKey: number
  /** La liste des prénoms n'a pas pu être lue (sans bandeau « problème » pour le dire). */
  waitError: string | null
  onRetry: (() => void) | null
  demo: boolean
}) {
  const reduced = useReducedMotion() ?? false
  const titleId = useId()
  const text = PHASE_TEXT[phase]
  const complete = code.length === CODE_LENGTH
  const firstTime = phase === 'choose' || phase === 'confirm'

  return (
    <motion.div
      className="relative mt-4"
      initial={reduced ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springy}
    >
      <motion.button
        type="button"
        onClick={onBack}
        disabled={busy}
        whileTap={{ scale: 0.94 }}
        className="flex min-h-11 items-center gap-1.5 rounded-2xl bg-surface px-3.5 font-display text-[15px] font-semibold text-ink-soft shadow-[0_3px_0_var(--color-line)] disabled:opacity-50"
      >
        <span aria-hidden="true">←</span> Changer de prénom
      </motion.button>

      <section className="card relative mt-12 px-4 pt-14 pb-5 text-center" aria-labelledby={titleId}>
        {/* L'avatar déborde de la carte, façon carte de joueur */}
        <motion.div
          className="absolute -top-11 left-1/2 -translate-x-1/2"
          initial={reduced ? false : { scale: 0.6, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 14 }}
        >
          <Avatar player={player} size="lg" ring />
        </motion.div>
        <p className="font-display text-[20px] leading-tight font-bold" style={{ color: deep(player.color, 78) }}>
          {player.name}
        </p>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={phase}
            initial={reduced ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: -24 }}
            transition={{ duration: 0.16 }}
          >
            <h2 id={titleId} className="mt-2 font-display text-[24px] leading-tight font-bold text-ink">
              {typo(text.title)}
            </h2>
            <p className="mx-auto mt-1 max-w-[19rem] text-[15px] leading-snug font-semibold text-balance text-ink-soft">
              {typo(onRetry ? 'Impossible de vérifier pour l’instant 📶' : text.hint)}
            </p>
          </motion.div>
        </AnimatePresence>

        {firstTime && <StepDots current={phase === 'confirm' ? 1 : 0} total={2} color={player.color} />}

        {/* Même champ pour toutes les phases : le clavier reste ouvert de l'une à l'autre. */}
        <div className="mt-4">
          <CodeInput
            value={code}
            onChange={onCode}
            onComplete={onComplete}
            label={text.label}
            color={player.color}
            busy={busy || phase === 'wait'}
            error={error}
            errorKey={errorKey}
            autoFocus
          />
        </div>

        {onRetry && (
          <div className="mt-3 flex flex-col items-center gap-2.5">
            {waitError && <p className="text-[15px] leading-snug font-semibold text-balance text-ink-soft">{waitError}</p>}
            <Button variant="soft" size="md" onClick={onRetry}>
              🔄 Réessayer
            </Button>
          </div>
        )}

        <Button
          block
          size="lg"
          color={player.color}
          // Gras : texte « large » au sens WCAG, lisible sur la couleur du joueur (contraste ≥ 3).
          className="mt-5 font-bold"
          disabled={!complete || busy || phase === 'wait'}
          onClick={() => onComplete(code)}
        >
          {busy ? 'Connexion…' : typo(text.cta)}
        </Button>

        <p className="mt-4 text-[14px] leading-snug font-semibold text-balance text-ink-soft">
          📱 Une seule fois sur ce téléphone, ensuite il s’en souvient
        </p>
        {demo && (
          <p className="mt-2 text-[14px] leading-snug font-semibold text-ink-soft">
            🧪 Maquette&nbsp;: n’importe quel code à {DIGITS}
          </p>
        )}
      </section>
    </motion.div>
  )
}

/** Petits points d'étape (choisir → confirmer). */
function StepDots({ current, total, color }: { current: number; total: number; color: string }) {
  return (
    <div className="mt-3 flex justify-center gap-1.5" role="img" aria-label={`Étape ${current + 1} sur ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <motion.span
          key={i}
          className="h-2 rounded-full"
          animate={{ width: i === current ? 22 : 8 }}
          transition={springy}
          style={{ background: i <= current ? color : 'var(--color-line)' }}
        />
      ))}
    </div>
  )
}

// ─── Bandeau « problème » ────────────────────────────────────────────────────

/** Problème bloquant de la source (réseau, base pas prête) : texte en français prêt à afficher. */
export function ProblemBanner({ text, detail = null, className = '' }: { text: string; detail?: string | null; className?: string }) {
  const reduced = useReducedMotion() ?? false
  return (
    <motion.div
      role="alert"
      className={`relative rounded-2xl px-4 py-3 text-[15px] leading-snug font-semibold text-ink ${className}`}
      style={{
        background: tint('var(--color-unpeu)', 18),
        boxShadow: `inset 0 0 0 2px ${tint('var(--color-unpeu)', 55, 'transparent')}`,
      }}
      initial={reduced ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springy}
    >
      {text}
      {detail && <span className="mt-1.5 block text-[14px] font-medium [overflow-wrap:anywhere] text-ink-soft">{detail}</span>}
    </motion.div>
  )
}
