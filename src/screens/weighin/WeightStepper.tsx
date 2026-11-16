/**
 * Le gros sélecteur de poids : énorme affichage, boutons − / + (appui long qui
 * accélère), et on peut toucher le nombre pour le taper directement.
 */
import { motion, useReducedMotion } from 'motion/react'
import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { RULES } from '../../config/rules'
import { Button, springy } from '../../ui/kit'
import { deep } from './format'
import { useHoldRepeat } from './useHoldRepeat'
import { clampTenths, TENTHS, tenthsLabel } from './useWeighIn'

const STEP_LABEL = String(RULES.weighIn.stepKg).replace('.', ',')

export function WeightStepper({
  tenths,
  onChange,
  color,
}: {
  tenths: number
  onChange: Dispatch<SetStateAction<number>>
  color: string
}) {
  const reduced = useReducedMotion() ?? false
  const minus = useHoldRepeat((mult) => onChange((v) => clampTenths(v - TENTHS.step * mult)))
  const plus = useHoldRepeat((mult) => onChange((v) => clampTenths(v + TENTHS.step * mult)))
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const label = tenthsLabel(tenths)
  const big = label.length > 4 // 100,0 kg et plus : un peu plus petit pour tenir

  const startEditing = () => {
    setText(label)
    setEditing(true)
    requestAnimationFrame(() => input.current?.select())
  }
  const commit = () => {
    const n = Number.parseFloat(text.replace(',', '.').replace(/[^\d.]/g, ''))
    if (Number.isFinite(n)) onChange(clampTenths(n * 10))
    setEditing(false)
  }

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
      <StepButton dir="minus" color={color} handlers={minus} disabled={tenths <= TENTHS.min} />

      <div className="flex min-w-0 flex-col items-center">
        {editing ? (
          <input
            ref={input}
            className="score-num w-full rounded-[20px] bg-sunken py-1 text-center text-[56px] leading-none text-ink outline-none focus:ring-4"
            style={{ ['--tw-ring-color' as string]: `color-mix(in oklab, ${color} 45%, transparent)` }}
            inputMode="decimal"
            enterKeyHint="done"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            aria-label="Ton poids en kg"
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="flex min-h-12 min-w-0 flex-col items-center rounded-[20px] px-1"
            aria-label={`${label} kg. Toucher pour taper le poids`}
          >
            <motion.span
              key={label}
              className={`score-num block leading-none whitespace-nowrap ${big ? 'text-[clamp(44px,14vw,60px)]' : 'text-[clamp(52px,17vw,74px)]'}`}
              style={{ color: deep(color, 78) }}
              initial={reduced ? false : { scale: 1.07, y: -2 }}
              animate={{ scale: 1, y: 0 }}
              transition={springy}
            >
              {label}
            </motion.span>
          </button>
        )}
        <span className="mt-1 font-display text-lg font-semibold text-muted">kg</span>
      </div>

      <StepButton dir="plus" color={color} handlers={plus} disabled={tenths >= TENTHS.max} />
    </div>
  )
}

function StepButton({
  dir,
  color,
  handlers,
  disabled,
}: {
  dir: 'minus' | 'plus'
  color: string
  handlers: ReturnType<typeof useHoldRepeat>
  disabled: boolean
}) {
  return (
    <Button
      color={color}
      size="lg"
      className="size-16! min-h-0! rounded-full! px-0! text-[40px]! leading-none"
      aria-label={dir === 'minus' ? `Retirer ${STEP_LABEL} kg (maintenir pour aller vite)` : `Ajouter ${STEP_LABEL} kg (maintenir pour aller vite)`}
      whileTap={{ scale: 0.9 }}
      disabled={disabled}
      {...handlers}
    >
      <span aria-hidden="true" className="-mt-1">
        {dir === 'minus' ? '−' : '+'}
      </span>
    </Button>
  )
}
