/**
 * 3. Mes habitudes.
 * - Nom, emoji, précision : cosmétique → immédiat.
 * - Ajouter, désactiver, changer de type : proposition à faire accepter par l'autre,
 *   effective le lundi suivant (pas de changement de règles en cours de manche).
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useState } from 'react'
import { HABIT_EMOJIS, HABIT_IDEAS } from '../../config/defaults'
import { nextMonday } from '../../core/dates'
import type { DayKey, Habit, HabitKind, Player, Proposal } from '../../core/types'
import { useDuel } from '../../data/DuelProvider'
import { Button, Pill, springy } from '../../ui/kit'
import { KIND_EMOJI, KIND_LABEL, KIND_SCALE, capitalize, deName, fromLabel, tint } from './format'
import { useDescribe } from './useDescribe'
import { Collapsible, EmojiGrid, Label, MiniButton, Note, Section, Segmented, StatusLine, TextField, useAction } from './ui'

const NAME_MAX = 24
const HINT_MAX = 40

const KIND_OPTIONS: { value: HabitKind; label: string }[] = [
  { value: 'avoid', label: `${KIND_EMOJI.avoid} À éviter` },
  { value: 'do', label: `${KIND_EMOJI.do} À faire` },
]

/** Habitudes encore d'actualité : actives, à venir, ou désactivées à partir de lundi. */
export function currentHabits(habits: Habit[], playerId: string, today: DayKey): Habit[] {
  return habits
    .filter((h) => h.playerId === playerId && (h.activeUntil === null || (h.activeUntil > today && h.activeUntil > h.activeFrom)))
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.activeFrom < b.activeFrom ? -1 : 1))
}

function sameName(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), 'fr', { sensitivity: 'base' }) === 0
}

export function HabitsSection({ index }: { index: number }) {
  const { me, other, snapshot, today } = useDuel()
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const mine = currentHabits(snapshot.habits, me.id, today)
  const theirs = currentHabits(snapshot.habits, other.id, today)
  const myPendingAdds = snapshot.proposals.filter(
    (p) => p.status === 'pending' && p.authorId === me.id && p.payload.kind === 'habit_add',
  )

  return (
    <Section
      index={index}
      emoji="📋"
      title="Mes habitudes"
      subtitle="Nom et emoji : immédiat. Les règles : à deux, dès lundi."
    >
      <div className="flex flex-col gap-2.5">
        {mine.map((h) => (
          <HabitRow
            key={h.id}
            habit={h}
            open={openId === h.id}
            onToggle={() => setOpenId((id) => (id === h.id ? null : h.id))}
          />
        ))}
        {myPendingAdds.map((p) => (
          <PendingAddRow key={p.id} proposal={p} other={other} />
        ))}
        {mine.length === 0 && myPendingAdds.length === 0 && (
          <p className="rounded-3xl bg-sunken px-4 py-5 text-center text-[15px] font-semibold text-muted">
            Aucune habitude… un peu trop facile, non ? 🤔
          </p>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {adding ? (
          <AddHabitForm key="form" existing={mine} onDone={() => setAdding(false)} />
        ) : (
          <motion.button
            key="add"
            type="button"
            onClick={() => setAdding(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            whileTap={{ scale: 0.97 }}
            className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-3xl border-[3px] border-dashed font-display text-[17px] font-semibold"
            style={{ borderColor: tint(me.color, 45, 'var(--color-line)'), color: `color-mix(in oklab, ${me.color} 75%, var(--color-ink))` }}
          >
            <span aria-hidden="true">➕</span> Proposer une nouvelle habitude
          </motion.button>
        )}
      </AnimatePresence>

      <Collapsible
        summary={
          <>
            <span aria-hidden="true">👀</span> Les habitudes {deName(other.name)} ({theirs.length})
          </>
        }
      >
        <div className="flex flex-col gap-2">
          {theirs.map((h) => (
            <div key={h.id} className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-2.5">
              <span className="text-[28px] leading-none" aria-hidden="true">
                {h.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[17px] leading-tight font-semibold text-ink">{h.name}</div>
                {h.hint && <div className="truncate text-[15px] text-muted">{h.hint}</div>}
                <HabitPills habit={h} today={today} />
              </div>
            </div>
          ))}
          {theirs.length === 0 && <p className="px-2 py-3 text-[15px] text-muted">Rien du tout. Suspect 🕵️</p>}
          <p className="px-2 pt-1 text-[15px] text-muted">C’est {other.name} qui gère ses habitudes. Toi, tu valides 😉</p>
        </div>
      </Collapsible>
    </Section>
  )
}

// ─── Une habitude ────────────────────────────────────────────────────────────

function HabitPills({ habit, today, pending }: { habit: Habit; today: DayKey; pending?: boolean }) {
  const upcoming = habit.activeFrom > today
  const ending = habit.activeUntil !== null && habit.activeUntil > today
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      <Pill>
        {KIND_EMOJI[habit.kind]} {KIND_LABEL[habit.kind]}
      </Pill>
      {upcoming && <Pill color="var(--color-nickel)">🆕 {fromLabel(habit.activeFrom)}</Pill>}
      {ending && habit.activeUntil && <Pill color="var(--color-craquage)">👋 désactivée {fromLabel(habit.activeUntil)}</Pill>}
      {pending && <Pill color="var(--color-unpeu)">⏳ proposition en attente</Pill>}
    </div>
  )
}

function HabitRow({ habit, open, onToggle }: { habit: Habit; open: boolean; onToggle: () => void }) {
  const { me, snapshot, today } = useDuel()
  const reduced = useReducedMotion() ?? false
  const pending = snapshot.proposals.find(
    (p) =>
      p.status === 'pending' &&
      p.authorId === me.id &&
      (p.payload.kind === 'habit_disable' || p.payload.kind === 'habit_kind') &&
      p.payload.habitId === habit.id,
  )
  const panelId = useId()
  const ending = habit.activeUntil !== null

  return (
    <motion.div
      layout={!reduced}
      className="overflow-hidden rounded-3xl"
      style={{
        background: open ? tint(me.color, 10, 'var(--color-sunken)') : 'var(--color-sunken)',
        // Valeurs explicites (pas undefined) : Motion garderait l'ancienne ombre.
        boxShadow: `inset 0 0 0 2px ${open ? tint(me.color, 40, 'transparent') : 'transparent'}`,
        opacity: ending && !open ? 0.75 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-16 w-full items-center gap-3 px-3 py-3 text-left"
      >
        <motion.span
          key={habit.emoji}
          initial={reduced ? false : { scale: 0.3, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={springy}
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-surface text-[32px] leading-none shadow-[0_3px_0_var(--color-line)]"
          aria-hidden="true"
        >
          {habit.emoji}
        </motion.span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[18px] leading-tight font-semibold text-ink">{habit.name}</span>
          {habit.hint && <span className="block truncate text-[15px] text-muted">{habit.hint}</span>}
          <HabitPills habit={habit} today={today} pending={!!pending} />
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={reduced ? { duration: 0 } : springy}
          className="shrink-0 text-[18px] text-muted"
          aria-hidden="true"
        >
          ▾
        </motion.span>
        <span className="sr-only">{open ? 'Fermer' : 'Modifier'}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <HabitEditor habit={habit} pending={pending ?? null} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function HabitEditor({ habit, pending }: { habit: Habit; pending: Proposal | null }) {
  const { me, other, today, source } = useDuel()
  const describe = useDescribe()
  const { run, busy } = useAction()
  const nameId = useId()
  const hintId = useId()
  const [name, setName] = useState(habit.name)
  const [hint, setHint] = useState(habit.hint)
  const [emoji, setEmoji] = useState(habit.emoji)

  const cleanName = name.trim().replace(/\s+/g, ' ')
  const cleanHint = hint.trim().replace(/\s+/g, ' ')
  const dirty = cleanName !== habit.name || cleanHint !== habit.hint || emoji !== habit.emoji
  const emojis = HABIT_EMOJIS.includes(habit.emoji) ? HABIT_EMOJIS : [habit.emoji, ...HABIT_EMOJIS]

  const upcoming = habit.activeFrom > today
  const ending = habit.activeUntil !== null
  const otherKind: HabitKind = habit.kind === 'avoid' ? 'do' : 'avoid'
  const monday = nextMonday(today)

  const saveLook = () =>
    void run(
      () => source.updateHabitLook(habit.id, { name: cleanName, hint: cleanHint, emoji }),
      { text: `${emoji} ${cleanName} : c’est noté ✨`, color: me.color },
    )

  const proposeRule = (payload: Proposal['payload']) =>
    void run(() => source.propose(payload), { text: `Proposition envoyée à ${other.name} 📨`, color: other.color })

  return (
    <div className="px-3 pb-4">
      <Label htmlFor={nameId}>Nom</Label>
      <TextField id={nameId} value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} enterKeyHint="next" />
      <Label htmlFor={hintId}>Précision</Label>
      <TextField
        id={hintId}
        value={hint}
        maxLength={HINT_MAX}
        placeholder="ex. En dehors des repas"
        onChange={(e) => setHint(e.target.value)}
        enterKeyHint="done"
      />
      <Label>Emoji</Label>
      <EmojiGrid emojis={emojis} value={emoji} onPick={setEmoji} label={`Emoji de ${habit.name}`} color={me.color} />
      <AnimatePresence initial={false} mode="wait">
        {dirty ? (
          <motion.div key="save" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={springy}>
            <Button block className="mt-4" disabled={!cleanName || busy} onClick={saveLook}>
              Enregistrer ✨
            </Button>
          </motion.div>
        ) : (
          <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 px-1 text-center text-[15px] text-muted">
            ✏️ Nom, précision, emoji : c’est cosmétique, effet immédiat
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mt-5 mb-1 flex items-center gap-2 px-1">
        <span className="h-0.5 flex-1 rounded-full bg-line" />
        <span className="font-display text-[15px] font-semibold text-muted">Règles · à valider par {other.name}</span>
        <span className="h-0.5 flex-1 rounded-full bg-line" />
      </div>

      {pending ? (
        <StatusLine
          emoji="⏳"
          color={other.color}
          action={
            <MiniButton onClick={() => void run(() => source.cancelProposal(pending.id), 'Proposition annulée 🙅')} disabled={busy}>
              Annuler
            </MiniButton>
          }
        >
          {describe(pending).title} — en attente {deName(other.name)}
        </StatusLine>
      ) : upcoming ? (
        <Note emoji="🆕">Elle démarre {fromLabel(habit.activeFrom)}. Les règles se renégocieront après 😉</Note>
      ) : ending && habit.activeUntil ? (
        <Note emoji="👋">Désactivée {fromLabel(habit.activeUntil)}. Plus rien à négocier.</Note>
      ) : (
        <div className="mt-2 flex flex-col gap-3">
          <Button
            variant="soft"
            block
            disabled={busy}
            onClick={() => proposeRule({ kind: 'habit_kind', habitId: habit.id, habitKind: otherKind })}
          >
            🔄 Passer en « {KIND_LABEL[otherKind]} »
          </Button>
          <Button variant="soft" block disabled={busy} onClick={() => proposeRule({ kind: 'habit_disable', habitId: habit.id })}>
            👋 Désactiver
          </Button>
          <p className="px-1 text-center text-[15px] leading-snug text-muted">
            Si {other.name} accepte, ça change {fromLabel(monday)}
          </p>
        </div>
      )}
    </div>
  )
}

function PendingAddRow({ proposal, other }: { proposal: Proposal; other: Player }) {
  const { source } = useDuel()
  const { run, busy } = useAction()
  if (proposal.payload.kind !== 'habit_add') return null
  const pl = proposal.payload
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-3 rounded-3xl border-[3px] border-dashed border-line px-3 py-3"
    >
      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-sunken text-[32px] leading-none opacity-70" aria-hidden="true">
        {pl.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[18px] leading-tight font-semibold text-ink">{pl.name}</div>
        <div className="text-[15px] leading-snug text-muted">
          ⏳ {capitalize(KIND_LABEL[pl.habitKind])} · en attente {deName(other.name)}
        </div>
      </div>
      <MiniButton onClick={() => void run(() => source.cancelProposal(proposal.id), 'Proposition annulée 🙅')} disabled={busy}>
        Annuler
      </MiniButton>
    </motion.div>
  )
}

// ─── Proposer une habitude ───────────────────────────────────────────────────

function AddHabitForm({ existing, onDone }: { existing: Habit[]; onDone: () => void }) {
  const { me, other, snapshot, today, source } = useDuel()
  const { run, busy } = useAction()
  const reduced = useReducedMotion() ?? false
  const nameId = useId()
  const hintId = useId()
  const [name, setName] = useState('')
  const [hint, setHint] = useState('')
  const [emoji, setEmoji] = useState(HABIT_EMOJIS[4] ?? '✨')
  const [kind, setKind] = useState<HabitKind>('do')

  const pendingNames = snapshot.proposals
    .filter((p) => p.status === 'pending' && p.authorId === me.id && p.payload.kind === 'habit_add')
    .map((p) => (p.payload.kind === 'habit_add' ? p.payload.name : ''))
  const taken = [...existing.map((h) => h.name), ...pendingNames]
  const ideas = HABIT_IDEAS.filter((i) => !taken.some((t) => sameName(t, i.name)))

  const cleanName = name.trim().replace(/\s+/g, ' ')
  const duplicate = cleanName !== '' && taken.some((t) => sameName(t, cleanName))
  const valid = cleanName !== '' && !duplicate

  const submit = async () => {
    if (!valid) return
    const ok = await run(
      () => source.propose({ kind: 'habit_add', name: cleanName, emoji, hint: hint.trim(), habitKind: kind }),
      { text: `Proposition envoyée à ${other.name} 📨`, color: other.color },
    )
    if (ok) onDone()
  }

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      transition={springy}
      className="mt-3 rounded-3xl p-3"
      style={{ background: tint(me.color, 10, 'var(--color-sunken)'), boxShadow: `inset 0 0 0 2px ${tint(me.color, 40, 'transparent')}` }}
    >
      <div className="flex items-center gap-2 px-1 pt-1">
        <span className="text-[26px] leading-none" aria-hidden="true">
          🌱
        </span>
        <h3 className="flex-1 font-display text-[19px] font-bold text-ink">Nouvelle habitude</h3>
        <MiniButton onClick={onDone} ariaLabel="Fermer le formulaire">
          ✕
        </MiniButton>
      </div>

      {ideas.length > 0 && (
        <>
          <Label>Des idées ?</Label>
          <div className="flex flex-wrap gap-2">
            {ideas.map((i) => {
              const active = sameName(i.name, cleanName) && emoji === i.emoji
              return (
                <motion.button
                  key={i.name}
                  type="button"
                  whileTap={reduced ? undefined : { scale: 0.9 }}
                  onClick={() => {
                    setName(i.name)
                    setEmoji(i.emoji)
                    setKind(i.kind)
                  }}
                  aria-pressed={active}
                  className="flex min-h-12 items-center gap-1.5 rounded-full bg-surface px-3.5 font-display text-[16px] font-semibold text-ink shadow-[0_3px_0_var(--color-line)]"
                  style={{ boxShadow: `inset 0 0 0 3px ${active ? me.color : 'transparent'}, 0 3px 0 var(--color-line)` }}
                >
                  <span className="text-[20px] leading-none" aria-hidden="true">
                    {i.emoji}
                  </span>
                  {i.name}
                </motion.button>
              )
            })}
          </div>
        </>
      )}

      <Label htmlFor={nameId}>Nom</Label>
      <TextField
        id={nameId}
        value={name}
        maxLength={NAME_MAX}
        placeholder="ex. Eau, Sommeil, Lecture…"
        onChange={(e) => setName(e.target.value)}
        aria-invalid={duplicate}
        enterKeyHint="next"
      />
      {duplicate && (
        <p className="mt-1.5 px-1 text-[15px] font-semibold" style={{ color: 'var(--color-craquage)' }}>
          Tu as déjà « {cleanName} » 😉
        </p>
      )}
      <Label htmlFor={hintId}>Précision (facultatif)</Label>
      <TextField
        id={hintId}
        value={hint}
        maxLength={HINT_MAX}
        placeholder="ex. 1,5 L dans la journée"
        onChange={(e) => setHint(e.target.value)}
        enterKeyHint="done"
      />
      <Label>Emoji</Label>
      <EmojiGrid emojis={HABIT_EMOJIS.includes(emoji) ? HABIT_EMOJIS : [emoji, ...HABIT_EMOJIS]} value={emoji} onPick={setEmoji} label="Emoji de l’habitude" color={me.color} />
      <Label>Type</Label>
      <Segmented options={KIND_OPTIONS} value={kind} onChange={setKind} label="Type d’habitude" color={me.color} />
      <p className="mt-2 px-1 text-center text-[15px] text-muted">{KIND_SCALE[kind]}</p>

      <Button block size="lg" className="mt-4" disabled={!valid || busy} onClick={() => void submit()}>
        Proposer à {other.name} 📨
      </Button>
      <p className="mt-2.5 px-1 text-center text-[15px] leading-snug text-muted">
        Si {other.name} accepte, elle compte {fromLabel(nextMonday(today))}
      </p>
    </motion.div>
  )
}
