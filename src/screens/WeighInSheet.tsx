/**
 * ⚖️ Feuille Pesée (SPEC « 3. Pesée » + décisions 3 et 8).
 * - Le jour J : gros sélecteur au 0,1 kg, aperçu en direct (variation en %,
 *   réaction, points), enregistrement puis écran de victoire.
 * - Les autres jours : état verrouillé sympa + prochaine date + historique.
 * On parle de points et d'effort, jamais du corps.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { RULES } from '../config/rules'
import { weighInPoints } from '../core/scoring'
import { formatPts, weighInReaction } from '../core/taunts'
import { formatKg, formatPct } from '../core/weight'
import { useDuel } from '../data/DuelProvider'
import { burst } from '../ui/confetti'
import { Button, Card, Pill, Sheet, springy } from '../ui/kit'
import { useToast } from '../ui/toast'
import { capitalize, deep, inDays, longDay, shortDay, tint, tokenColor } from './weighin/format'
import { SheetGlow } from './weighin/SheetGlow'
import { GoalCard, OpponentCard, WeighInHistory } from './weighin/WeighInCards'
import { WeighInPreview } from './weighin/WeighInPreview'
import { WeightStepper } from './weighin/WeightStepper'
import { previewWeighIn, useWeighInData, type WeighInData, type WeighInPreview as Preview } from './weighin/useWeighIn'

/** Valeur de départ du sélecteur quand on n'a encore aucune pesée. */
const DEFAULT_KG = 70

export function WeighInSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useDuel()
  return (
    <Sheet open={open} onClose={onClose} title="⚖️ Pesée">
      <SheetGlow color={me.color} />
      <WeighInContent onClose={onClose} />
    </Sheet>
  )
}

function WeighInContent({ onClose }: { onClose: () => void }) {
  const data = useWeighInData()
  const { me, other } = useDuel()
  // Ce jour-là, on arrive sur le résumé si la pesée est déjà faite, sinon sur la saisie.
  const [mode, setMode] = useState<'edit' | 'done'>(() => (data.todayWeighIn ? 'done' : 'edit'))
  const [justSaved, setJustSaved] = useState(false)
  const [tenths, setTenths] = useState(() =>
    Math.round((data.todayWeighIn?.weightKg ?? data.prev?.weightKg ?? me.goalKg ?? DEFAULT_KG) * 10),
  )

  const prevKg = data.prev?.weightKg ?? null
  const preview = previewWeighIn(tenths / 10, prevKg, data.start?.weightKg ?? null, me.goalKg)
  const latest = data.mine.at(-1) ?? null
  const root = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion() ?? false
  const switchTo = (next: 'edit' | 'done') => {
    setMode(next)
    root.current?.closest('[role="dialog"]')?.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
  }
  const fromStartPct = data.open && mode === 'edit' && data.start ? preview.fromStartPct : (latest?.fromStartPct ?? null)

  return (
    <div ref={root} className="pb-4">
      {!data.open ? (
        <LockedView data={data} />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          {mode === 'edit' ? (
            <motion.div key="edit" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
              <Editor
                data={data}
                tenths={tenths}
                setTenths={setTenths}
                preview={preview}
                onSaved={() => {
                  setJustSaved(true)
                  switchTo('done')
                }}
              />
            </motion.div>
          ) : (
            <motion.div key="done" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.2 }}>
              <DoneView
                data={data}
                justSaved={justSaved}
                onEdit={() => {
                  if (data.todayWeighIn?.weightKg != null) setTenths(Math.round(data.todayWeighIn.weightKg * 10))
                  setJustSaved(false)
                  switchTo('edit')
                }}
                onClose={onClose}
              />
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <GoalCard me={me} fromStartPct={fromStartPct} hasStart={data.mine.some((w) => w.day < data.today) || !!data.todayWeighIn} />
      <OpponentCard other={other} latest={data.otherLatest} today={data.today} open={data.open} />
      <WeighInHistory me={me} mine={data.mine} />
    </div>
  )
}

// ─── Saisie (le jour J) ──────────────────────────────────────────────────────

function Editor({
  data,
  tenths,
  setTenths,
  preview,
  onSaved,
}: {
  data: WeighInData
  tenths: number
  setTenths: Dispatch<SetStateAction<number>>
  preview: Preview
  onSaved: () => void
}) {
  const { me, other, source } = useDuel()
  const toast = useToast()
  const reduced = useReducedMotion() ?? false
  const [saving, setSaving] = useState(false)
  const correcting = data.todayWeighIn !== null
  const unchanged = correcting && data.todayWeighIn?.weightKg != null && Math.round(data.todayWeighIn.weightKg * 10) === tenths

  const save = async () => {
    setSaving(true)
    try {
      await source.saveWeighIn(data.today, tenths / 10)
      const pts = preview.points
      if (pts > 0) burst([me.color, tokenColor('--color-gold', '#ffc23d'), tokenColor('--color-nickel', '#22c55e')], { x: 0.5, y: 0.35 })
      toast({
        text: preview.first ? '📍 Point de départ enregistré !' : `⚖️ Pesée ${correcting ? 'corrigée' : 'enregistrée'} : ${pts > 0 ? '+' : ''}${formatPts(pts)}`,
        color: me.color,
      })
      onSaved()
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : 'Oups, la pesée n’est pas passée 😕', color: 'var(--color-craquage)' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* En-tête : c'est le jour J ! */}
      <div className="flex items-center gap-3 px-1 pt-1">
        <motion.span
          className="emoji-xl text-[56px]"
          animate={reduced ? undefined : { rotate: [0, -10, 10, -6, 0], y: [0, -4, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 2.4 }}
          aria-hidden="true"
        >
          ⚖️
        </motion.span>
        <div className="min-w-0">
          <h2 className="font-display text-[28px] leading-tight font-bold text-ink">{correcting ? 'Correction ✏️' : 'C’est le jour J !'}</h2>
          <p className="text-[15px] font-semibold text-muted">
            {correcting ? 'Modifiable jusqu’à 23:59 ce soir' : `Jusqu’à ${formatPts(RULES.weighIn.maxPoints)} à gagner 🎯`}
          </p>
        </div>
      </div>

      <Card className="pt-4 pb-4">
        <p className="mb-2 text-center font-display text-[17px] font-semibold text-ink-soft">Ton poids du jour</p>
        <WeightStepper tenths={tenths} onChange={setTenths} color={me.color} />
        <p className="mt-3 text-center text-[14px] font-semibold text-muted">
          {data.prev?.weightKg != null
            ? `Dernière pesée : ${formatKg(data.prev.weightKg)} · ${shortDay(data.prev.day)}`
            : 'Première pesée : elle sert de point de départ 📍'}
          <br />
          <span className="text-[13px]">Touche le nombre pour le taper ⌨️</span>
        </p>
      </Card>

      <WeighInPreview preview={preview} seed={data.today} />

      <Button size="xl" block onClick={save} disabled={saving || unchanged} aria-busy={saving}>
        {saving ? 'Enregistrement…' : unchanged ? 'Déjà enregistré ✅' : correcting ? 'Corriger ma pesée ✏️' : 'Valider ma pesée ⚖️'}
      </Button>
      <p className="-mt-1 text-center text-[13px] font-semibold text-muted">
        {me.showKg ? `👀 ${other.name} voit aussi tes kilos (option dans les Réglages)` : `🔒 ${other.name} ne verra que ta variation en %`}
      </p>
    </div>
  )
}

// ─── Pesée du jour faite ─────────────────────────────────────────────────────

function DoneView({ data, justSaved, onEdit, onClose }: { data: WeighInData; justSaved: boolean; onEdit: () => void; onClose: () => void }) {
  const reduced = useReducedMotion() ?? false
  const w = data.todayWeighIn
  if (!w) return null
  const points = weighInPoints(w)
  const first = w.changePct === null
  const reaction = weighInReaction(w.changePct, points, data.today)

  return (
    <div className="flex flex-col items-center px-1 pt-2 text-center">
      <motion.div
        className="emoji-xl text-[96px]"
        initial={reduced ? false : { scale: 0, rotate: -40, y: 30 }}
        animate={{ scale: 1, rotate: 0, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 13, delay: justSaved ? 0.05 : 0 }}
        aria-hidden="true"
      >
        {first ? '📍' : reaction.emoji}
      </motion.div>
      <h2 className="mt-2 font-display text-[28px] leading-tight font-bold text-ink">
        {first ? 'Point de départ 📍' : justSaved ? 'Pesée enregistrée !' : 'Pesée du jour ✅'}
      </h2>

      <motion.div
        className="mt-1 flex items-baseline gap-1.5"
        style={{ color: points > 0 ? 'color-mix(in oklab, var(--color-nickel) 70%, var(--color-ink))' : 'var(--color-ink-soft)' }}
        initial={reduced ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...springy, delay: 0.15 }}
      >
        <span className="score-num text-[64px] leading-none">
          {points > 0 ? '+' : ''}
          {points}
        </span>
        <span className="font-display text-2xl font-semibold text-muted">{points > 1 ? 'pts' : 'pt'}</span>
      </motion.div>

      <p className="mt-2 max-w-[320px] text-[16px] leading-snug font-bold text-ink-soft">
        {first ? 'Les points, c’est pour la prochaine fois 😉 Cette pesée sert de référence.' : reaction.text}
      </p>

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {w.weightKg !== null && <Pill color={'var(--me)'}>{formatKg(w.weightKg)}</Pill>}
        {!first && <Pill color={'var(--me)'}>{formatPct(w.changePct, 2)} vs la dernière</Pill>}
      </div>

      <div className="mt-6 flex w-full flex-col gap-3">
        <Button size="xl" block onClick={onClose}>
          Retour au duel 🥊
        </Button>
        <Button variant="soft" size="md" block onClick={onEdit}>
          ✏️ Corriger ma pesée
        </Button>
      </div>
      <p className="mt-3 text-[13px] font-semibold text-muted">Tu peux corriger jusqu’à 23:59 ce soir.</p>
    </div>
  )
}

// ─── Pas le jour J ───────────────────────────────────────────────────────────

function LockedView({ data }: { data: WeighInData }) {
  const { me } = useDuel()
  const reduced = useReducedMotion() ?? false
  const last = data.mine.at(-1) ?? null
  const lastPoints = weighInPoints(last)
  const lastReaction = last ? weighInReaction(last.changePct, lastPoints, last.day) : null

  return (
    <div className="flex flex-col items-center px-1 pt-2 text-center">
      <div className="relative">
        <motion.span
          className="emoji-xl block text-[92px]"
          animate={reduced ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          ⚖️
        </motion.span>
        <motion.span
          className="absolute -right-3 -bottom-1 text-[40px]"
          initial={reduced ? false : { scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ ...springy, delay: 0.25 }}
          aria-hidden="true"
        >
          🔒
        </motion.span>
      </div>
      <h2 className="mt-3 font-display text-[28px] leading-tight font-bold text-ink">Pas de pesée aujourd’hui</h2>
      <p className="mt-1 text-[16px] font-semibold text-ink-soft">La balance ne compte que le jour J 😉</p>

      <motion.div
        className="card mt-5 w-full px-4 py-4"
        style={{ background: tint(me.color, 14) }}
        initial={reduced ? false : { scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...springy, delay: 0.1 }}
      >
        <p className="text-[13px] font-bold tracking-wide text-muted uppercase">Prochaine pesée</p>
        <p className="mt-1 font-display text-[26px] leading-tight font-bold" style={{ color: deep(me.color, 78) }}>
          <span className="sr-only">Prochaine pesée : </span>
          {capitalize(longDay(data.nextDate))}
        </p>
        <div className="mt-2 flex justify-center">
          <Pill color={me.color}>⏳ {inDays(data.today, data.nextDate)}</Pill>
        </div>
      </motion.div>

      <p className="mt-4 max-w-[330px] text-[15px] font-semibold text-ink-soft">
        D’ici là, chaque check-in compte : jusqu’à {formatPts(RULES.week.dailyMax)} par jour 💪
      </p>

      {last && lastReaction && (
        <Card className="mt-4 flex w-full items-center gap-3 text-left">
          <span className="emoji-xl text-[44px]" aria-hidden="true">
            {last.changePct === null ? '📍' : lastReaction.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] leading-tight font-semibold text-ink">Ta dernière pesée</p>
            <p className="text-[15px] font-semibold text-muted">
              {capitalize(shortDay(last.day))} · {last.changePct === null ? 'point de départ' : formatPct(last.changePct)}
            </p>
          </div>
          <span className="score-num text-[28px]" style={{ color: lastPoints > 0 ? 'color-mix(in oklab, var(--color-nickel) 70%, var(--color-ink))' : 'var(--color-muted)' }}>
            {last.changePct === null ? '—' : lastPoints > 0 ? `+${lastPoints}` : '0'}
            <span className="ml-0.5 font-display text-[14px] font-semibold text-muted">{last.changePct === null ? '' : lastPoints > 1 ? 'pts' : 'pt'}</span>
          </span>
        </Card>
      )}
    </div>
  )
}
