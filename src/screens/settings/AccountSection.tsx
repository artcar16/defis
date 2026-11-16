/**
 * 8. 🔐 Mon compte (décision 20) : pas d'email ni de mot de passe, un prénom et un code
 * à 6 chiffres. Ici : changer son code (ancien, nouveau, confirmation : les AUTRES
 * téléphones devront taper le nouveau), débloquer son prénom (trop de codes faux tapés
 * ailleurs) et se déconnecter de ce téléphone (il faudra retaper son code pour revenir).
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { plural, pluralWord, typo } from '../../core/fr'
import { useDuel } from '../../data/DuelProvider'
import { CODE_LENGTH } from '../../data/source'
import { tint } from '../../ui/color'
import { errorText } from '../../ui/format'
import { Button, springy } from '../../ui/kit'
import { useToast } from '../../ui/toast'
import { changeCodeStep, type ChangeCodeState } from './code'
import { CodeInput } from './CodeInput'
import { MiniButton, Section } from './ui'

const DIGITS = plural(CODE_LENGTH, 'chiffre')

const STEP_TEXT: Record<ChangeCodeState['step'], { title: string; label: string; cta: string }> = {
  old: { title: 'Ton code actuel', label: 'Ton code actuel', cta: 'Suivant →' },
  new: { title: 'Ton nouveau code ✨', label: 'Ton nouveau code', cta: 'Suivant →' },
  confirm: { title: 'Confirme le nouveau 🔁', label: 'Confirme ton nouveau code', cta: 'Changer mon code ✅' },
}
const STEPS: ChangeCodeState['step'][] = ['old', 'new', 'confirm']

export function AccountSection({ index }: { index: number }) {
  const { me } = useDuel()
  const [changing, setChanging] = useState(false)
  const reduced = useReducedMotion() ?? false

  return (
    <Section index={index} emoji="🔐" title="Mon compte" subtitle={`Ce téléphone te connaît, ${me.name} 📱`}>
      <AnimatePresence initial={false} mode="popLayout">
        {changing ? (
          <motion.div
            key="change"
            initial={reduced ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={springy}
          >
            <ChangeCode onClose={() => setChanging(false)} />
          </motion.div>
        ) : (
          <motion.div key="button" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Button variant="soft" size="lg" block onClick={() => setChanging(true)}>
              🔐 Changer mon code
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <Unlock />
      <SignOut />
    </Section>
  )
}

// ─── Changer mon code ────────────────────────────────────────────────────────

function ChangeCode({ onClose }: { onClose: () => void }) {
  const { me, source, demo } = useDuel()
  const toast = useToast()
  const reduced = useReducedMotion() ?? false
  const [state, setState] = useState<ChangeCodeState>({ step: 'old' })
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState(0)
  const [busy, setBusy] = useState(false)

  const fail = (message: string) => {
    setError(message)
    setCode('')
    setErrorKey((k) => k + 1)
  }

  const onComplete = async (value: string) => {
    if (busy) return
    const step = changeCodeStep(state, value)
    setState(step.state)
    if (step.kind === 'next') {
      setCode('')
      setError(null)
      return
    }
    if (step.kind === 'error') return fail(step.error)
    setBusy(true)
    setError(null)
    try {
      await source.changeCode(step.oldCode, step.newCode)
      toast({
        text: demo
          ? 'Nouveau code enregistré 🔐 Garde-le bien en tête !'
          : typo('Nouveau code enregistré 🔐 Tes autres appareils devront le taper : garde-le bien en tête !'),
        color: me.color,
        duration: demo ? undefined : 5000,
      })
      onClose()
    } catch (e) {
      // Ancien code faux, trop d'essais, réseau… : on repart du début.
      setBusy(false)
      setState({ step: 'old' })
      fail(errorText(e))
    }
  }

  const text = STEP_TEXT[state.step]
  const current = STEPS.indexOf(state.step)

  return (
    <div className="rounded-3xl px-1 pt-1 pb-1 text-center">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5" role="img" aria-label={`Étape ${current + 1} sur ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <motion.span
              key={s}
              className="h-2 rounded-full"
              animate={{ width: i === current ? 22 : 8 }}
              transition={springy}
              style={{ background: i <= current ? 'var(--me)' : 'var(--color-line)' }}
            />
          ))}
        </div>
        <MiniButton onClick={onClose} disabled={busy}>
          Annuler
        </MiniButton>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.h3
          key={state.step}
          className="mt-2 font-display text-[21px] leading-tight font-bold text-ink"
          initial={reduced ? false : { opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, x: -20 }}
          transition={{ duration: 0.15 }}
        >
          {text.title}
        </motion.h3>
      </AnimatePresence>
      <p className="mx-auto mt-1 max-w-[19rem] text-[15px] leading-snug font-semibold text-ink-soft">
        {state.step === 'old' ? `Les ${DIGITS} que tu tapes pour entrer` : `${DIGITS}, et pas ta date d’anniversaire 😏`}
      </p>

      {/* Un seul champ pour les trois étapes : le clavier reste ouvert. */}
      <div className="mt-4">
        <CodeInput
          value={code}
          onChange={(v) => {
            setCode(v)
            if (v) setError(null)
          }}
          onComplete={(v) => void onComplete(v)}
          label={text.label}
          busy={busy}
          error={error}
          errorKey={errorKey}
          autoFocus
        />
      </div>

      <Button block size="lg" className="mt-5 font-bold" disabled={code.length !== CODE_LENGTH || busy} onClick={() => void onComplete(code)}>
        {busy ? 'Enregistrement…' : text.cta}
      </Button>
      <p className="mt-3 text-[14px] leading-snug font-semibold text-ink-soft">
        {demo
          ? typo(`🧪 Maquette : n’importe quel code à ${DIGITS}, rien n’est vraiment changé`)
          : typo('📱 Ce téléphone reste connecté ; tes autres appareils devront taper le nouveau code')}
      </p>
    </div>
  )
}

// ─── Débloquer mon prénom ────────────────────────────────────────────────────

/**
 * Après 10 codes faux en 15 minutes, le prénom est bloqué sur l'écran de connexion
 * (décision 20), même pour le bon code. Depuis un téléphone déjà connecté, on efface ces
 * essais pour connecter tout de suite un nouveau téléphone… et on apprend au passage si
 * quelqu'un a tenté sa chance.
 */
function Unlock() {
  const { source, me } = useDuel()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const unlock = async () => {
    setBusy(true)
    try {
      const n = await source.unlockCode()
      toast({
        text:
          n > 0
            ? typo(`🔓 Prénom débloqué : ${plural(n, 'code faux', 'codes faux')} ${pluralWord(n, 'effacé', 'effacés')}. Si ce n’était pas toi, change ton code 🕵️`)
            : typo('🔓 Rien à débloquer : aucun code faux récent 👌'),
        color: me.color,
        duration: n > 0 ? 6000 : undefined,
      })
    } catch (e) {
      toast({ text: errorText(e), color: 'var(--color-craquage)' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      <Button variant="soft" size="md" block disabled={busy} onClick={() => void unlock()}>
        {busy ? 'Un instant…' : '🔓 Débloquer mon prénom'}
      </Button>
      <p className="mt-2 px-1 text-center text-[14px] leading-snug font-semibold text-ink-soft">
        {typo('Un nouveau téléphone affiche « Trop de codes faux » ? Débloque-le d’ici.')}
      </p>
    </div>
  )
}

// ─── Se déconnecter de ce téléphone ──────────────────────────────────────────

function SignOut() {
  const { source, me } = useDuel()
  const toast = useToast()
  const reduced = useReducedMotion() ?? false
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const signOut = async () => {
    setBusy(true)
    try {
      await source.signOut()
      toast({ text: `À plus, ${me.name} 👋` })
    } catch (e) {
      toast({ text: errorText(e), color: 'var(--color-craquage)' })
      setBusy(false)
    }
  }

  return (
    <div className="mt-5 border-t-2 border-dashed border-line pt-4">
      <AnimatePresence initial={false} mode="popLayout">
        {confirming ? (
          <motion.div
            key="confirm"
            className="rounded-2xl px-3 py-3"
            style={{
              background: tint('var(--color-craquage)', 10),
              boxShadow: `inset 0 0 0 2px ${tint('var(--color-craquage)', 30, 'transparent')}`,
            }}
            initial={reduced ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={springy}
          >
            <p className="text-center font-display text-[17px] leading-snug font-semibold text-ink">
              Tu connais bien ton code&nbsp;? Sans lui, pas de retour au ring 😬
            </p>
            <div className="mt-3 flex flex-col gap-3">
              <Button color="var(--color-craquage)" size="lg" block className="font-bold" disabled={busy} onClick={() => void signOut()}>
                {busy ? 'À plus…' : '👋 Oui, déconnecte-moi'}
              </Button>
              <Button variant="soft" size="md" block disabled={busy} onClick={() => setConfirming(false)}>
                Non, je reste
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="button" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Button variant="soft" size="lg" block onClick={() => setConfirming(true)}>
              👋 Se déconnecter de ce téléphone
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="mt-3 px-1 text-center text-[14px] leading-snug font-semibold text-ink-soft">
        Il faudra retaper ton code pour revenir. Tes check-ins et tes pesées restent bien au chaud.
      </p>
    </div>
  )
}
