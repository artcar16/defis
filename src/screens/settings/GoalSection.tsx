/**
 * 2. Mon objectif : le poids objectif est un changement de règle (proposé à l'autre,
 * effectif le lundi suivant), sinon on pourrait se fixer un objectif trop facile.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useMemo, useState } from 'react'
import { RULES } from '../../config/rules'
import { nextMonday } from '../../core/dates'
import { deName } from '../../core/fr'
import { percentChange } from '../../core/scoring'
import type { Proposal } from '../../core/types'
import { formatKg, formatPct, weighInsOf } from '../../core/weight'
import { useDuel } from '../../data/DuelProvider'
import { tint } from '../../ui/color'
import { Button, springy } from '../../ui/kit'
import { KG_RANGE_ERROR, fromLabel, kgInput, parseKg } from './format'
import { Label, MiniButton, Note, Section, StatusLine, useAction } from './ui'

type GoalProposal = Proposal & { payload: Extract<Proposal['payload'], { kind: 'goal_weight' }> }

function isGoal(p: Proposal): p is GoalProposal {
  return p.payload.kind === 'goal_weight'
}

export function GoalSection({ index }: { index: number }) {
  const { me, other, snapshot, today, source } = useDuel()
  const { run, busy } = useAction()
  const reduced = useReducedMotion() ?? false
  const inputId = useId()

  const myWeighIns = useMemo(() => weighInsOf(snapshot.weighIns, me.id), [snapshot.weighIns, me.id])
  const startKg = myWeighIns[0]?.weightKg ?? null
  const lastKg = myWeighIns.at(-1)?.weightKg ?? null

  const goals = snapshot.proposals.filter((p): p is GoalProposal => isGoal(p) && p.authorId === me.id)
  const pending = goals.find((p) => p.status === 'pending') ?? null
  const upcoming =
    goals.filter((p) => p.status === 'accepted' && p.effectiveFrom !== null && p.effectiveFrom > today).at(-1) ?? null

  const suggested = me.goalKg ?? (lastKg !== null ? Math.round(lastKg * 0.95 * 2) / 2 : 70)
  const [draft, setDraft] = useState(() => kgInput(suggested))
  const goalKg = parseKg(draft)
  const goalPct = goalKg !== null && startKg !== null ? percentChange(startKg, goalKg) : null

  /** Objectif d'une de mes propositions (null = retrait). Ce sont mes kilos : jamais masqués. */
  const kgOf = (p: GoalProposal) => (p.payload.clear ? null : p.payload.goalKg)
  // Objectif en vigueur lundi si rien ne bouge : validé pour lundi, sinon l'actuel.
  const nextGoal = upcoming ? kgOf(upcoming) : me.goalKg
  // Le dernier objectif « connu » : proposé, sinon celui de lundi.
  const reference = pending ? kgOf(pending) : nextGoal
  const unchanged = goalKg !== null && reference !== null && Math.abs(goalKg - reference) < 0.05
  const sameAs = pending ? 'C’est déjà ta proposition en cours 😉' : upcoming ? 'C’est déjà ton objectif de lundi 😉' : 'C’est déjà ton objectif 😉'

  const step = (delta: number) => {
    const base = goalKg ?? suggested
    const next = Math.min(RULES.weighIn.maxKg, Math.max(RULES.weighIn.minKg, Math.round((base + delta) * 10) / 10))
    setDraft(kgInput(next))
  }

  /** kg = null : retirer l'objectif. Une proposition en attente est remplacée par la source (décision 17). */
  const propose = async (kg: number | null) => {
    const pct = kg !== null && startKg !== null ? percentChange(startKg, kg) : null
    await run(() => source.propose({ kind: 'goal_weight', clear: kg === null, goalKg: kg, goalFromStartPct: pct }), {
      text: pending ? `Proposition remplacée : ${other.name} ne verra que la nouvelle 📨` : `Proposition envoyée à ${other.name} 📨`,
      color: other.color,
    })
  }

  return (
    <Section
      index={index}
      emoji="🎯"
      title="Mon objectif"
      subtitle={`Validé par ${other.name}, effectif dès lundi — pour éviter les objectifs trop faciles 😏`}
    >
      {/* Objectif actuel */}
      <div className="flex items-center gap-3 rounded-3xl px-4 py-3.5" style={{ background: tint(me.color, 14, 'var(--color-sunken)') }}>
        <span className="emoji-xl text-[44px]!" aria-hidden="true">
          {me.goalKg !== null ? '🏁' : '🤷'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-muted">Objectif en ce moment</div>
          {me.goalKg !== null ? (
            <>
              <div className="score-num text-[28px] leading-tight text-ink">{formatKg(me.goalKg)}</div>
              {me.goalFromStartPct !== null && (
                <div className="text-[15px] font-semibold text-ink-soft">{formatPct(me.goalFromStartPct)} depuis ton départ</div>
              )}
            </>
          ) : (
            <div className="font-display text-[20px] font-semibold text-ink">Pas encore d’objectif</div>
          )}
        </div>
      </div>

      {upcoming && (
        <StatusLine emoji="📅" color="var(--color-nickel)">
          Validé&nbsp;: {kgOf(upcoming) !== null ? formatKg(kgOf(upcoming)) : 'plus d’objectif'}{' '}
          {fromLabel(upcoming.effectiveFrom ?? nextMonday(today))}
        </StatusLine>
      )}
      {pending && (
        <StatusLine
          emoji="⏳"
          color={other.color}
          action={
            <MiniButton onClick={() => void run(() => source.cancelProposal(pending.id), 'Proposition annulée 🙅')} disabled={busy}>
              Annuler
            </MiniButton>
          }
        >
          {kgOf(pending) !== null ? `${formatKg(kgOf(pending))} proposé` : 'Retrait de l’objectif proposé'} — en attente{' '}
          {deName(other.name)}
        </StatusLine>
      )}

      {/* Nouveau poids objectif */}
      <Label htmlFor={inputId}>{me.goalKg !== null || pending ? 'Nouvel objectif' : 'Mon poids objectif'}</Label>
      <div className="flex items-stretch gap-2">
        <StepButton label="Moins 0,5 kg" onClick={() => step(-0.5)}>
          −
        </StepButton>
        <div className="relative min-w-0 flex-1">
          <input
            id={inputId}
            value={draft}
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            onChange={(e) => setDraft(e.target.value.replace(/[^\d,.]/g, ''))}
            onBlur={() => goalKg !== null && setDraft(kgInput(goalKg))}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-invalid={goalKg === null}
            className="score-num h-16 w-full rounded-2xl border-2 border-transparent bg-sunken pr-12 text-center text-[30px] text-ink outline-none focus:border-[color:var(--me)] focus:bg-surface"
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 font-display text-[17px] font-semibold text-muted">
            kg
          </span>
        </div>
        <StepButton label="Plus 0,5 kg" onClick={() => step(0.5)}>
          +
        </StepButton>
      </div>

      <div className="mt-2 min-h-6 px-1 text-center text-[15px] font-semibold" aria-live="polite">
        {goalKg === null ? (
          <span style={{ color: 'var(--color-craquage)' }}>
            {KG_RANGE_ERROR}
          </span>
        ) : goalPct !== null ? (
          <motion.span key={goalPct.toFixed(1)} initial={reduced ? false : { scale: 1.15 }} animate={{ scale: 1 }} transition={springy} className="inline-block text-ink-soft">
            soit <b className="text-ink">{formatPct(goalPct)}</b> depuis ta première pesée ({formatKg(startKg)})
            {goalPct > 0 ? ' 🤨' : goalPct < -15 ? ' 😳' : ' 👌'}
          </motion.span>
        ) : (
          <span className="text-muted">Le&nbsp;% s’affichera après ta première pesée ⚖️</span>
        )}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {unchanged ? (
          <motion.p
            key="same"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-2xl bg-sunken px-3 py-3 text-center text-[15px] font-semibold text-muted"
          >
            {sameAs} Ajuste avec − / + pour en proposer un autre.
          </motion.p>
        ) : (
          <motion.div key="go" initial={reduced ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={springy}>
            <Button block size="lg" className="mt-3" disabled={goalKg === null || busy} onClick={() => goalKg !== null && void propose(goalKg)}>
              Proposer à {other.name} 📨
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {nextGoal !== null && !pending?.payload.clear && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => void propose(null)}
            disabled={busy}
            className="min-h-12 px-4 font-display text-[15px] font-semibold text-muted underline decoration-2 underline-offset-4"
          >
            Retirer mon objectif
          </button>
        </div>
      )}

      {other.goalFromStartPct !== null && (
        <Note emoji="👀">
          {other.name} vise <b>{formatPct(other.goalFromStartPct)}</b> depuis son départ. On compare en&nbsp;%, c’est plus
          juste.
        </Note>
      )}
    </Section>
  )
}

function StepButton({ children, onClick, label }: { children: string; onClick: () => void; label: string }) {
  return (
    <Button variant="soft" className="h-16 w-16 shrink-0 px-0! text-[30px]!" onClick={onClick} aria-label={label}>
      {children}
    </Button>
  )
}
