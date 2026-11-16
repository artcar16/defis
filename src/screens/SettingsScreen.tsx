/**
 * ⚙️ Réglages : profil, objectif, habitudes, propositions, jour de la pesée,
 * enjeu de la semaine, (démo) et déconnexion.
 *
 * Règle d'or (SPEC, décisions 2, 5 et 6) : le cosmétique est immédiat, les règles
 * du jeu passent par une proposition que l'autre accepte, effective le lundi suivant.
 */
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { useDuel } from '../data/DuelProvider'
import { Button, ScreenHeader, springy } from '../ui/kit'
import { useToast } from '../ui/toast'
import { DemoSection } from './settings/DemoSection'
import { errorText, tint } from './settings/format'
import { GoalSection } from './settings/GoalSection'
import { HabitsSection } from './settings/HabitsSection'
import { PROPOSALS_ANCHOR, ProposalsSection } from './settings/ProposalsSection'
import { ProfileSection } from './settings/ProfileSection'
import { StakeSection } from './settings/StakeSection'
import { WeighDaySection } from './settings/WeighDaySection'

export function SettingsScreen() {
  const { me, other, snapshot, demo } = useDuel()
  const pendingForMe = snapshot.proposals.filter((p) => p.status === 'pending' && p.authorId !== me.id).length

  return (
    // Clé = joueur connecté : les brouillons repartent de zéro si on change de joueur (démo).
    <div key={me.id} className="pt-2 pb-4">
      <ScreenHeader title="Réglages" emoji="⚙️" subtitle={`Ton QG secret, ${me.name} 🕵️`} />

      {pendingForMe > 0 && <InboxBanner count={pendingForMe} otherName={other.name} color={other.color} />}

      <ProfileSection index={0} />
      <GoalSection index={1} />
      <HabitsSection index={2} />
      <ProposalsSection index={3} />
      <WeighDaySection index={4} />
      <StakeSection index={5} />
      {demo && <DemoSection index={6} />}
      <SignOut />

      <p className="mt-6 text-center text-[13px] font-semibold text-muted">
        Duel des Défauts 🥊 · avec ❤️ et mauvaise foi
      </p>
    </div>
  )
}

/** « 📬 Laetitia attend ta réponse » → descend jusqu'aux propositions. */
function InboxBanner({ count, otherName, color }: { count: number; otherName: string; color: string }) {
  const reduced = useReducedMotion() ?? false
  return (
    <motion.button
      type="button"
      onClick={() =>
        document.getElementById(PROPOSALS_ANCHOR)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
      }
      initial={reduced ? false : { opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileTap={{ scale: 0.97 }}
      transition={springy}
      className="card flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
      style={{
        background: tint(color, 14),
        boxShadow: `inset 0 0 0 2px ${tint(color, 35, 'transparent')}, var(--shadow-card)`,
      }}
    >
      <motion.span
        className="text-[34px] leading-none"
        animate={reduced ? undefined : { rotate: [0, -14, 12, -8, 0], scale: [1, 1.12, 1] }}
        transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 2.6 }}
        aria-hidden="true"
      >
        📬
      </motion.span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[17px] leading-snug font-semibold text-ink">
          {otherName} attend ta réponse
        </span>
        <span className="block text-[15px] text-ink-soft">
          {count > 1 ? `${count} propositions à valider` : '1 proposition à valider'} 👇
        </span>
      </span>
      <span className="font-display text-[26px] text-muted" aria-hidden="true">
        ↓
      </span>
    </motion.button>
  )
}

function SignOut() {
  const { source, me } = useDuel()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <div className="mt-6">
      <Button
        variant="soft"
        size="lg"
        block
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await source.signOut()
            toast({ text: `À plus, ${me.name} 👋` })
          } catch (e) {
            toast({ text: errorText(e), color: 'var(--color-craquage)' })
            setBusy(false)
          }
        }}
      >
        👋 Se déconnecter
      </Button>
    </div>
  )
}
