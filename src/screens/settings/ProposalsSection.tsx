/**
 * 4. Propositions 📬 : les changements de règles se valident à deux.
 * - Celles de l'autre : Accepter ✅ / Refuser ❌.
 * - Les miennes : en attente, annulables.
 * - Les dernières décidées : acceptées (dès lundi…) ou refusées.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { nextMonday } from '../../core/dates'
import type { Proposal } from '../../core/types'
import { useDuel } from '../../data/DuelProvider'
import { burst } from '../../ui/confetti'
import { Avatar, Button, springy } from '../../ui/kit'
import { deName, fromLabel, tint } from './format'
import { MiniButton, Note, Section, useAction } from './ui'
import { useDescribe } from './useDescribe'

const RECENT_MAX = 4

export const PROPOSALS_ANCHOR = 'propositions'

export function ProposalsSection({ index }: { index: number }) {
  const { me, other, snapshot } = useDuel()
  const forMe = snapshot.proposals.filter((p) => p.status === 'pending' && p.authorId !== me.id)
  const mine = snapshot.proposals.filter((p) => p.status === 'pending' && p.authorId === me.id)
  const decided = snapshot.proposals
    .filter((p) => p.status === 'accepted' || p.status === 'refused')
    .sort((a, b) => ((a.decidedAt ?? '') < (b.decidedAt ?? '') ? 1 : -1))
    .slice(0, RECENT_MAX)
  const empty = forMe.length === 0 && mine.length === 0

  return (
    <Section
      id={PROPOSALS_ANCHOR}
      index={index}
      emoji="📬"
      title="Propositions"
      subtitle="Les règles se changent à deux, et seulement le lundi suivant 🤝"
      right={
        forMe.length > 0 ? (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={springy}
            className="grid h-8 min-w-8 place-items-center rounded-full bg-craquage px-2 font-display text-[17px] font-bold text-white"
            aria-label={`${forMe.length} à valider`}
          >
            {forMe.length}
          </motion.span>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <AnimatePresence initial={false} mode="popLayout">
          {forMe.map((p) => (
            <IncomingCard key={p.id} proposal={p} />
          ))}
          {mine.map((p) => (
            <MineRow key={p.id} proposal={p} />
          ))}
        </AnimatePresence>
      </div>

      {empty && (
        <div className="flex flex-col items-center gap-1 rounded-3xl bg-sunken px-4 py-5 text-center">
          <span className="emoji-xl" aria-hidden="true">
            📭
          </span>
          <p className="mt-1 font-display text-[18px] font-semibold text-ink">Rien à signer</p>
          <p className="text-[15px] text-muted">Calme plat… pour l’instant 😏</p>
        </div>
      )}

      {decided.length > 0 && (
        <>
          <div className="mt-5 mb-2 px-1 font-display text-[15px] font-semibold text-muted">Dernières décisions</div>
          <ul className="flex flex-col gap-2">
            {decided.map((p) => (
              <DecidedRow key={p.id} proposal={p} />
            ))}
          </ul>
        </>
      )}

      {empty && decided.length === 0 && (
        <Note emoji="💡">Ajouter une habitude, la désactiver, changer son type, le jour de la pesée ou ton objectif : {other.name} doit valider.</Note>
      )}
    </Section>
  )
}

// ─── Proposition de l'autre ──────────────────────────────────────────────────

function IncomingCard({ proposal }: { proposal: Proposal }) {
  const { other, today, source, me } = useDuel()
  const { run, busy } = useAction()
  const describe = useDescribe()
  const reduced = useReducedMotion() ?? false
  const text = describe(proposal)
  const monday = nextMonday(today)

  const answer = async (accept: boolean, el?: HTMLElement | null) => {
    const ok = await run(
      () => source.answerProposal(proposal.id, accept),
      accept
        ? { text: `Validé ✅ Ça s’applique ${fromLabel(monday)}`, color: 'var(--color-nickel)' }
        : { text: `Refusé ❌ ${other.name} va bouder 😤`, color: 'var(--color-craquage)' },
    )
    if (ok && accept && el) {
      const r = el.getBoundingClientRect()
      burst([other.color, me.color, '#22c55e'], { x: (r.left + r.width / 2) / window.innerWidth, y: r.top / window.innerHeight })
    }
  }

  return (
    <motion.article
      layout
      initial={reduced ? false : { opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85, x: 60 }}
      transition={springy}
      className="rounded-3xl p-3.5"
      style={{
        background: tint(other.color, 13, 'var(--color-surface)'),
        boxShadow: `inset 0 0 0 2px ${tint(other.color, 38, 'transparent')}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <Avatar player={other} size="sm" />
          <motion.span
            className="absolute -right-2 -bottom-1 text-[22px] leading-none"
            animate={reduced ? undefined : { rotate: [0, -12, 10, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 2.5 }}
            aria-hidden="true"
          >
            {text.emoji}
          </motion.span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-ink-soft">{other.name} propose :</div>
          <div className="font-display text-[19px] leading-snug font-semibold text-balance text-ink">{text.title}</div>
          {text.detail && <div className="mt-0.5 text-[15px] leading-snug text-muted">{text.detail}</div>}
        </div>
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <Button
          color="var(--color-nickel)"
          disabled={busy}
          onClick={(e) => void answer(true, e.currentTarget)}
        >
          Accepter ✅
        </Button>
        <Button variant="soft" disabled={busy} onClick={() => void answer(false)}>
          Refuser ❌
        </Button>
      </div>
      <p className="mt-2.5 text-center text-[15px] text-muted">Si tu acceptes : {fromLabel(monday)}</p>
    </motion.article>
  )
}

// ─── Mes propositions en attente ─────────────────────────────────────────────

function MineRow({ proposal }: { proposal: Proposal }) {
  const { other, source } = useDuel()
  const { run, busy } = useAction()
  const describe = useDescribe()
  const reduced = useReducedMotion() ?? false
  const text = describe(proposal)
  return (
    <motion.article
      layout
      initial={reduced ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85, x: -60 }}
      transition={springy}
      className="flex items-center gap-3 rounded-3xl border-[3px] border-dashed border-line px-3 py-3"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-sunken text-[26px] leading-none" aria-hidden="true">
        {text.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[17px] leading-snug font-semibold text-ink">{text.title}</div>
        <div className="text-[15px] leading-snug text-muted">
          <motion.span
            className="inline-block"
            animate={reduced ? undefined : { rotate: [0, 180, 180, 360] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          >
            ⏳
          </motion.span>{' '}
          En attente {deName(other.name)}
        </div>
      </div>
      <MiniButton
        onClick={() => void run(() => source.cancelProposal(proposal.id), 'Proposition annulée 🙅')}
        disabled={busy}
        ariaLabel={`Annuler : ${text.title}`}
      >
        Annuler
      </MiniButton>
    </motion.article>
  )
}

// ─── Décisions récentes ──────────────────────────────────────────────────────

function DecidedRow({ proposal }: { proposal: Proposal }) {
  const { me, other, today, playerById } = useDuel()
  const describe = useDescribe()
  const text = describe(proposal)
  const author = playerById(proposal.authorId)
  const accepted = proposal.status === 'accepted'
  const from = proposal.effectiveFrom
  const status = accepted
    ? from && from > today
      ? `Acceptée · ${fromLabel(from)}`
      : `Acceptée · en vigueur`
    : proposal.authorId === me.id
      ? `Refusée par ${other.name}`
      : 'Refusée'

  return (
    <li className="flex items-center gap-3 rounded-2xl bg-sunken px-3 py-2.5">
      <span className="text-[22px] leading-none" aria-hidden="true">
        {accepted ? '✅' : '❌'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] leading-snug font-semibold text-ink">{text.title}</div>
        <div className="text-[15px] leading-snug font-semibold" style={{ color: accepted ? 'color-mix(in oklab, var(--color-nickel) 70%, var(--color-ink))' : 'var(--color-muted)' }}>
          {status}
        </div>
      </div>
      <span
        className="size-3 shrink-0 rounded-full"
        style={{ background: author.color }}
        title={`Proposée par ${author.name}`}
        aria-label={`Proposée par ${author.name}`}
        role="img"
      />
    </li>
  )
}
