/**
 * Le gros sélecteur de poids : énorme affichage, boutons − / + (appui long qui
 * accélère), et on peut toucher le nombre pour le taper directement.
 * Saisie au clavier : Entrée valide, Échap annule (sans fermer la feuille) ; un poids
 * hors bornes est refusé avec un message (jamais ramené en silence à 30 ou 250 kg).
 */
import { motion, useReducedMotion } from 'motion/react'
import { useId, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { RULES } from '../../config/rules'
import { NBSP } from '../../core/fr'
import { deep } from '../../ui/color'
import { Button, springy } from '../../ui/kit'
import { clampTenths, frNum, KG_RANGE_TEXT, parseWeightInput, TENTHS, tenthsLabel } from './format'
import { useHoldRepeat } from './useHoldRepeat'

const STEP_LABEL = frNum(RULES.weighIn.stepKg)

type Note = { kind: 'error' | 'info'; text: string } | null

export function WeightStepper({
  tenths,
  onChange,
  color,
  onInvalidChange,
}: {
  tenths: number
  onChange: Dispatch<SetStateAction<number>>
  color: string
  /** Vrai tant qu'une saisie refusée reste à corriger (le bouton Valider doit attendre). */
  onInvalidChange?: (invalid: boolean) => void
}) {
  const reduced = useReducedMotion() ?? false
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [note, setNote] = useState<Note>(null)
  const input = useRef<HTMLInputElement>(null)
  // Refs lues par les gestionnaires (appui long, blur après fermeture) : jamais de valeur périmée.
  const editingRef = useRef(false)
  const textRef = useRef('')
  const noteId = useId()

  const label = tenthsLabel(tenths)
  const big = label.length > 4 // 100,0 kg et plus : un peu plus petit pour tenir

  const close = () => {
    editingRef.current = false
    setEditing(false)
    onInvalidChange?.(false)
  }
  const startEditing = () => {
    textRef.current = label
    setText(label)
    setNote(null)
    editingRef.current = true
    setEditing(true)
    requestAnimationFrame(() => input.current?.select())
  }
  /** Valide la saisie. Renvoie la valeur retenue (null si rien de changé). */
  const commit = (): number | null => {
    if (!editingRef.current) return null // déjà fermée (Échap, ou Entrée suivie du blur)
    const r = parseWeightInput(textRef.current)
    if (r.ok) {
      onChange(r.tenths)
      setNote(r.guessed ? { kind: 'info', text: `Virgule ajoutée${NBSP}: ${tenthsLabel(r.tenths)}${NBSP}kg 😉` } : null)
      close()
      return r.tenths
    }
    if (r.reason === 'empty') {
      setNote(null)
      close()
      return null
    }
    // Hors bornes : on garde le champ ouvert, l'ancienne valeur ne bouge pas.
    setNote({ kind: 'error', text: KG_RANGE_TEXT })
    onInvalidChange?.(true)
    return null
  }
  const cancel = () => {
    setNote(null)
    close()
  }
  /** − / + pendant la saisie : on part du nombre tapé s'il est valable, sinon on l'abandonne. */
  const step = (delta: number) => {
    let base: number | null = null
    if (editingRef.current) {
      base = commit()
      if (editingRef.current) cancel()
    }
    setNote(null)
    onChange((v) => clampTenths((base ?? v) + delta))
  }
  const minus = useHoldRepeat((mult) => step(-TENTHS.step * mult))
  const plus = useHoldRepeat((mult) => step(TENTHS.step * mult))
  const invalid = editing && note?.kind === 'error'

  return (
    <div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <StepButton dir="minus" color={color} handlers={minus} disabled={!editing && tenths <= TENTHS.min} />

        <div className="flex min-w-0 flex-col items-center">
          {editing ? (
            <input
              ref={input}
              className="score-num w-full rounded-[20px] bg-sunken py-1 text-center text-[56px] leading-none text-ink outline-none focus:ring-4"
              style={{
                ['--tw-ring-color' as string]: invalid
                  ? 'color-mix(in oklab, var(--color-craquage) 55%, transparent)'
                  : `color-mix(in oklab, ${color} 45%, transparent)`,
                boxShadow: invalid ? 'inset 0 0 0 3px var(--color-craquage)' : undefined,
              }}
              inputMode="decimal"
              enterKeyHint="done"
              autoFocus
              value={text}
              onChange={(e) => {
                textRef.current = e.target.value
                setText(e.target.value)
              }}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commit()
                }
                if (e.key === 'Escape') {
                  // Annule la saisie seulement : la feuille ignore un Échap déjà traité.
                  e.preventDefault()
                  e.stopPropagation()
                  cancel()
                }
              }}
              aria-label="Ton poids en kg"
              aria-invalid={invalid || undefined}
              aria-describedby={note ? noteId : undefined}
            />
          ) : (
            <button
              type="button"
              onClick={startEditing}
              className="flex min-h-12 min-w-0 flex-col items-center rounded-[20px] px-1"
              aria-label={`${label}${NBSP}kg. Toucher pour taper le poids`}
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

        <StepButton dir="plus" color={color} handlers={plus} disabled={!editing && tenths >= TENTHS.max} />
      </div>
      {note && (
        <p
          id={noteId}
          role={note.kind === 'error' ? 'alert' : 'status'}
          className="mt-2 text-center text-[15px] font-bold"
          style={{ color: note.kind === 'error' ? deep('var(--color-craquage)', 75) : 'var(--color-ink-soft)' }}
        >
          {note.text}
        </p>
      )}
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
