/**
 * 5. Jour de la pesée : commun aux deux joueurs, changé par proposition (dès lundi).
 */
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { ISO_DAY_SHORT, isoDayName, nextMonday } from '../../core/dates'
import { weighInDayFor } from '../../core/scoring'
import { useDuel } from '../../data/DuelProvider'
import { Button, springy } from '../../ui/kit'
import { ON_GOLD, deName, fromLabel } from './format'
import { MiniButton, Section, StatusLine, useAction } from './ui'

export function WeighDaySection({ index }: { index: number }) {
  const { other, snapshot, today, source, me } = useDuel()
  const { run, busy } = useAction()
  const reduced = useReducedMotion() ?? false

  const current = weighInDayFor(today, snapshot.settings)
  const upcomingRule =
    snapshot.settings.weighInDays.filter((r) => r.from > today).sort((a, b) => (a.from < b.from ? -1 : 1))[0] ?? null
  const upcoming = upcomingRule && upcomingRule.isoDay !== current ? upcomingRule : null
  const pending =
    snapshot.proposals.find((p) => p.status === 'pending' && p.authorId === me.id && p.payload.kind === 'weigh_day') ?? null
  const pendingDay = pending?.payload.kind === 'weigh_day' ? pending.payload.isoDay : null
  const theirPending = snapshot.proposals.some((p) => p.status === 'pending' && p.authorId !== me.id && p.payload.kind === 'weigh_day')

  /** Le jour qui s'appliquera la semaine prochaine si rien ne bouge. */
  const baseline = upcoming?.isoDay ?? current
  const [choice, setChoice] = useState<number | null>(null)
  const selected = choice ?? pendingDay ?? baseline
  const canPropose = choice !== null && choice !== baseline && choice !== pendingDay

  const propose = async () => {
    if (choice === null) return
    const ok = await run(
      async () => {
        if (pending) await source.cancelProposal(pending.id)
        await source.propose({ kind: 'weigh_day', isoDay: choice })
      },
      { text: `Proposition envoyée à ${other.name} 📨`, color: other.color },
    )
    if (ok) setChoice(null)
  }

  return (
    <Section index={index} emoji="⚖️" title="Jour de la pesée" subtitle={`Le même pour vous deux. En ce moment : le ${isoDayName(current)}.`}>
      <div role="radiogroup" aria-label="Jour de la pesée" className="grid grid-cols-7 gap-1.5">
        {ISO_DAY_SHORT.map((letter, i) => {
          const iso = i + 1
          const isCurrent = iso === current
          // Rempli = le jour qu'on s'apprête à proposer ; contour = proposé (⏳) ou validé pour lundi (📅).
          const isSelected = iso === choice && !isCurrent
          const isUpcoming = upcoming?.isoDay === iso
          const isPending = pendingDay === iso
          const bg = isCurrent ? 'var(--color-gold)' : isSelected ? me.color : 'var(--color-sunken)'
          return (
            <motion.button
              key={iso}
              type="button"
              role="radio"
              aria-checked={iso === selected}
              aria-label={`${isoDayName(iso)}${isCurrent ? ' (actuel)' : ''}${isUpcoming ? ' (dès lundi)' : ''}${isPending ? ' (proposé)' : ''}`}
              onClick={() => setChoice(iso === baseline ? null : iso)}
              whileTap={reduced ? undefined : { scale: 0.85 }}
              animate={isSelected && !reduced ? { y: [0, -6, 0] } : { y: 0 }}
              transition={springy}
              className="relative flex h-16 flex-col items-center justify-center rounded-2xl font-display text-[20px] font-bold"
              style={{
                background: bg,
                color: isCurrent ? ON_GOLD : isSelected ? '#fff' : 'var(--color-ink-soft)',
                boxShadow: isCurrent
                  ? '0 4px 0 var(--color-gold-dark)'
                  : isSelected
                    ? `0 4px 0 color-mix(in oklab, ${me.color} 65%, black)`
                    : isUpcoming || isPending
                      ? `inset 0 0 0 2.5px ${isPending ? other.color : 'var(--color-nickel)'}`
                      : '0 3px 0 var(--color-line)',
              }}
            >
              <span>{letter}</span>
              {isCurrent && (
                <span className="text-[15px] leading-none" aria-hidden="true">
                  ⚖️
                </span>
              )}
              {!isCurrent && (isUpcoming || isPending) && (
                <span className="text-[13px] leading-none" aria-hidden="true">
                  {isPending ? '⏳' : '📅'}
                </span>
              )}
            </motion.button>
          )
        })}
      </div>

      {upcoming && (
        <StatusLine emoji="📅" color="var(--color-nickel)">
          Validé : pesée le {isoDayName(upcoming.isoDay)} {fromLabel(upcoming.from)}
        </StatusLine>
      )}
      {pending && pendingDay !== null && (
        <StatusLine
          emoji="⏳"
          color={other.color}
          action={
            <MiniButton onClick={() => void run(() => source.cancelProposal(pending.id), 'Proposition annulée 🙅')} disabled={busy}>
              Annuler
            </MiniButton>
          }
        >
          Le {isoDayName(pendingDay)} proposé — en attente {deName(other.name)}
        </StatusLine>
      )}
      {theirPending && (
        <StatusLine emoji="📬" color={other.color}>
          {other.name} propose un autre jour : réponds plus bas 👇
        </StatusLine>
      )}

      <motion.div
        initial={false}
        animate={{ height: canPropose ? 'auto' : 0, opacity: canPropose ? 1 : 0 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34 }}
        className="overflow-hidden"
        aria-hidden={!canPropose}
      >
        <div className="pt-3">
          <Button block size="lg" disabled={!canPropose || busy} onClick={() => void propose()} tabIndex={canPropose ? 0 : -1}>
            Proposer le {choice ? isoDayName(choice) : ''} 📨
          </Button>
          <p className="mt-2 text-center text-[15px] text-muted">
            {other.name} doit accepter · effet {fromLabel(nextMonday(today))}
          </p>
        </div>
      </motion.div>

      {!canPropose && !pending && !upcoming && (
        <p className="mt-3 px-1 text-center text-[15px] leading-snug text-muted">
          Tape un autre jour pour le proposer à {other.name}.
        </p>
      )}
    </Section>
  )
}
