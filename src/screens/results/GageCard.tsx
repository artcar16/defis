/**
 * 😈 Le gage de la manche, et le bouton « Gage payé ✅ ».
 * C'est l'autre (le gagnant ; en cas d'égalité, chacun pour l'autre) qui valide.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { deName, NBSP } from '../../core/fr'
import type { Player } from '../../core/types'
import { useDuel } from '../../data/DuelProvider'
import { deep, themeColor } from '../../ui/color'
import { burst } from '../../ui/confetti'
import { errorText } from '../../ui/format'
import { Avatar, Button, Card } from '../../ui/kit'
import { useToast } from '../../ui/toast'
import type { WeekResults } from './useWeekResults'

export function GageCard({ results }: { results: WeekResults }) {
  const { playerById, me, other } = useDuel()
  const { week, stake, tie } = results
  const finished = week.finished
  const payers = week.outcome.gageFor.map(playerById)

  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className="emoji-xl text-[48px]" aria-hidden="true">
          {finished ? '😈' : '🎲'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold tracking-wide text-muted uppercase">{finished ? (tie ? 'Le gage (pour les deux)' : 'Le gage') : 'L’enjeu de la manche'}</p>
          <p className="font-display text-[22px] leading-tight font-semibold text-ink">{stake ?? 'Pas de gage défini 🤷'}</p>
        </div>
      </div>

      {finished ? (
        <div className="mt-4 flex flex-col gap-3">
          {payers.map((payer) => (
            <GageRow
              key={payer.id}
              weekStart={week.weekStart}
              payer={payer}
              validator={payer.id === me.id ? other : me}
              paid={week.meta?.gagePaid[payer.id] === true}
              meId={me.id}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[15px] font-semibold text-ink-soft">
          Qui perd s’y collera lundi 😈 (et en cas d’égalité, gage pour les deux{NBSP}!)
        </p>
      )}
    </Card>
  )
}

function GageRow({
  weekStart,
  payer,
  validator,
  paid,
  meId,
}: {
  weekStart: string
  payer: Player
  validator: Player
  paid: boolean
  meId: string
}) {
  const { source } = useDuel()
  const toast = useToast()
  const reduced = useReducedMotion() ?? false
  const [busy, setBusy] = useState(false)
  const iValidate = validator.id === meId
  const iPay = payer.id === meId

  const setPaid = async (value: boolean) => {
    setBusy(true)
    try {
      await source.setGagePaid(weekStart, payer.id, value)
      if (value) {
        burst([themeColor('nickel', '#22c55e'), themeColor('gold', '#ffc23d'), payer.color], { x: 0.5, y: 0.7 })
        toast({ text: `🫡 Gage ${deName(payer.name)} validé ✅`, color: 'var(--color-nickel)' })
      } else {
        toast({ text: '↩️ Validation annulée', color: validator.color })
      }
    } catch (e) {
      toast({ text: errorText(e, 'Oups, ça n’a pas marché 😕'), color: 'var(--color-craquage)' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-[22px] bg-sunken p-3">
      <div className="flex items-center gap-3">
        <Avatar player={payer} size="sm" />
        <p className="min-w-0 flex-1 text-[16px] leading-snug font-bold text-ink">
          {paid
            ? iPay
              ? 'Dette payée, bravo 🫡'
              : `${payer.name} a payé sa dette 🫡`
            : iPay
              ? 'C’est toi qui t’y colles 😬'
              : `${payer.name} s’y colle 😈`}
        </p>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {paid ? (
          <motion.div key="paid" className="mt-3 flex items-center justify-between gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Tampon « payé » */}
            <motion.span
              className="inline-flex shrink-0 -rotate-6 items-center rounded-[14px] border-[3px] px-2.5 py-1 font-display text-[17px] font-bold tracking-wide whitespace-nowrap uppercase"
              style={{
                borderColor: 'var(--color-nickel)',
                color: deep('var(--color-nickel)', 70),
                background: 'color-mix(in oklab, var(--color-nickel) 12%, transparent)',
              }}
              initial={reduced ? false : { scale: 2.2, opacity: 0, rotate: -20 }}
              animate={{ scale: 1, opacity: 1, rotate: -6 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
            >
              Gage payé ✅
            </motion.span>
            {iValidate ? (
              <button
                type="button"
                onClick={() => setPaid(false)}
                disabled={busy}
                className="min-h-12 rounded-[16px] px-3 font-display text-[15px] font-semibold text-muted underline decoration-2 underline-offset-4"
              >
                Annuler
              </button>
            ) : (
              <span className="min-w-0 text-right text-[13px] font-semibold text-muted">validé par {validator.name}</span>
            )}
          </motion.div>
        ) : iValidate ? (
          <motion.div key="validate" className="mt-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Button block size="lg" color="var(--color-nickel)" onClick={() => setPaid(true)} disabled={busy}>
              Gage payé ✅
            </Button>
            <p className="mt-2 text-center text-[13px] font-semibold text-muted">À toi de valider quand c’est fait 👀</p>
          </motion.div>
        ) : (
          <motion.p
            key="waiting"
            className="mt-3 flex items-center gap-2 rounded-[16px] bg-surface px-3 py-2.5 text-[15px] font-bold"
            style={{ color: deep(validator.color, 70) }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.span
              aria-hidden="true"
              animate={reduced ? undefined : { rotate: [0, 180, 180, 360] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              ⏳
            </motion.span>
            En attente de validation par {validator.name}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
