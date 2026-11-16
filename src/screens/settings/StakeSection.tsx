/**
 * 6. Enjeu de la semaine : modifiable le lundi seulement (texte libre ou roulette 🎲),
 * puis verrouillé jusqu'à la fin de la manche. La liste des gages, elle, est libre.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { RULES } from '../../config/rules'
import { addDays, formatDay } from '../../core/dates'
import { isStakeEditable } from '../../core/season'
import { useDuel } from '../../data/DuelProvider'
import { Button, springy } from '../../ui/kit'
import { ANCHORS } from '../../ui/nav'
import { useToast } from '../../ui/toast'
import { Roulette } from './Roulette'
import { Collapsible, INPUT_CLASS, MiniButton, StatusLine, Section, useAction } from './ui'

const GAGE_MAX = 80

/**
 * Entrée valide la saisie (Maj+Entrée garde le retour à la ligne, et on ignore l'Entrée
 * qui confirme une saisie IME). Pas de <form> : dans un cadre sandboxé sans allow-forms,
 * la soumission native est bloquée avant même l'événement submit.
 */
function onEnter(action: () => void, onEscape?: () => void) {
  return (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      action()
    } else if (e.key === 'Escape' && onEscape) {
      e.preventDefault()
      onEscape()
    }
  }
}

export function StakeSection({ index }: { index: number }) {
  const { season, today, source, me, other, snapshot } = useDuel()
  const { run, busy } = useAction()
  const reduced = useReducedMotion() ?? false
  const toast = useToast()
  const inputId = useId()
  const week = season.current
  const stake = week.meta?.stake ?? null
  const editable = isStakeEditable(week.weekStart, today)
  const lastEditable = addDays(week.weekStart, RULES.stake.editableDays - 1)
  const [writing, setWriting] = useState(false)
  const [draft, setDraft] = useState('')

  const gages = snapshot.settings.gages

  const saveDraft = async () => {
    const clean = draft.trim().replace(/\s+/g, ' ')
    if (!clean) return
    const ok = await run(() => source.setStake(week.weekStart, clean), { text: `Enjeu fixé : ${clean} 🤝`, color: me.color })
    if (ok) setWriting(false)
  }

  return (
    <Section
      id={ANCHORS.stake}
      index={index}
      emoji="🎰"
      title="Enjeu de la semaine"
      subtitle={`Manche ${week.index} · qui perd s’y colle\u00a0😈`}
    >
      <Roulette
        gages={gages}
        current={stake}
        editable={editable}
        colors={[me.color, other.color]}
        onResult={async (gage) => {
          await run(() => source.setStake(week.weekStart, gage), { text: `🎲 La roulette a parlé : ${gage}`, color: 'var(--color-gold)', duration: 4500 })
        }}
      />

      {editable ? (
        <>
          <AnimatePresence initial={false} mode="wait">
            {writing ? (
              <motion.div
                key="write"
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={springy}
                className="mt-4"
              >
                <label htmlFor={inputId} className="mb-1.5 block px-1 font-display text-[15px] font-semibold text-ink-soft">
                  Ton gage sur mesure
                </label>
                <textarea
                  id={inputId}
                  value={draft}
                  maxLength={GAGE_MAX}
                  rows={2}
                  autoFocus
                  placeholder="ex. Porter le pull moche de Noël toute une soirée 🎄"
                  enterKeyHint="done"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onEnter(
                    () => void saveDraft(),
                    () => setWriting(false),
                  )}
                  className={`${INPUT_CLASS} resize-none`}
                />
                <div className="mt-3 flex gap-2.5">
                  <Button className="flex-1" disabled={!draft.trim() || busy} onClick={() => void saveDraft()}>
                    Valider 🤝
                  </Button>
                  <Button variant="soft" onClick={() => setWriting(false)}>
                    Annuler
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="btn" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Button
                  variant="soft"
                  block
                  className="mt-4"
                  onClick={() => {
                    setDraft(stake ?? '')
                    setWriting(true)
                  }}
                >
                  ✏️ Écrire mon propre gage
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <StatusLine emoji="⏰" color="var(--color-unpeu)">
            Modifiable {lastEditable === today ? 'jusqu’à ce soir minuit' : `jusqu’au ${formatDay(lastEditable, 'EEEE')} minuit`}, ensuite c’est verrouillé 🔒
          </StatusLine>
        </>
      ) : (
        <StatusLine emoji="🔒" color="var(--color-muted)">
          {stake ? (
            <>
              <b>Verrouillé jusqu’à {week.weekEnd === today ? 'ce soir minuit' : formatDay(week.weekEnd, 'EEEE')}.</b> Plus moyen de
              se défiler 😈
            </>
          ) : (
            <>
              <b>Pas d’enjeu cette semaine.</b> L’honneur suffira 😇
            </>
          )}
        </StatusLine>
      )}

      <Collapsible
        summary={
          <>
            <span aria-hidden="true">📜</span> La liste des gages ({gages.length})
          </>
        }
      >
        <GagesEditor
          gages={gages}
          onChange={(list, msg) => run(() => source.setGages(list), msg)}
          onRefuse={(text) => toast({ text })}
        />
      </Collapsible>
    </Section>
  )
}

// ─── Liste des gages ─────────────────────────────────────────────────────────

function GagesEditor({
  gages,
  onChange,
  onRefuse,
}: {
  gages: string[]
  onChange: (list: string[], message: string) => Promise<boolean>
  onRefuse: (text: string) => void
}) {
  const reduced = useReducedMotion() ?? false
  const addId = useId()
  const [editing, setEditing] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [newGage, setNewGage] = useState('')
  // Pas d'animation d'entrée à l'ouverture de la liste, seulement pour les gages ajoutés / modifiés.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 50)
    return () => window.clearTimeout(t)
  }, [])

  const clean = (s: string) => s.trim().replace(/\s+/g, ' ')
  const exists = (s: string, except?: number) =>
    gages.some((g, i) => i !== except && g.localeCompare(s, 'fr', { sensitivity: 'base' }) === 0)

  const add = async () => {
    const g = clean(newGage)
    if (!g) return
    if (exists(g)) return onRefuse('Ce gage est déjà dans la liste 😉')
    if (await onChange([...gages, g], 'Gage ajouté à la roulette 🎁')) setNewGage('')
  }

  const saveEdit = async (i: number) => {
    const g = clean(editText)
    if (!g) return onRefuse('Un gage vide ? Trop facile 😏')
    if (exists(g, i)) return onRefuse('Ce gage est déjà dans la liste 😉')
    if (g !== gages[i] && !(await onChange(gages.map((x, k) => (k === i ? g : x)), 'Gage modifié ✏️'))) return
    setEditing(null)
  }

  const remove = (i: number) => {
    if (gages.length <= 1) return onRefuse('Il faut au moins un gage pour la roulette 🎲')
    void onChange(
      gages.filter((_, k) => k !== i),
      'Gage supprimé 🗑️',
    )
    if (editing === i) setEditing(null)
  }

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {gages.map((g, i) => (
          <motion.li
            key={g}
            layout={!reduced}
            initial={reduced || !mounted ? false : { opacity: 0, x: -20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={springy}
            className="rounded-2xl bg-surface"
          >
            {editing === i ? (
              <div className="flex items-center gap-2 p-2">
                <input
                  value={editText}
                  maxLength={GAGE_MAX}
                  autoFocus
                  enterKeyHint="done"
                  aria-label="Modifier le gage"
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={onEnter(
                    () => void saveEdit(i),
                    () => setEditing(null),
                  )}
                  className={`${INPUT_CLASS} min-w-0 flex-1 px-3`}
                />
                <IconButton label="Valider" onClick={() => void saveEdit(i)}>
                  ✅
                </IconButton>
                <IconButton label="Annuler la modification" onClick={() => setEditing(null)}>
                  ↩️
                </IconButton>
              </div>
            ) : (
              <div className="flex items-center gap-1 py-1 pr-1 pl-3.5">
                <span className="min-w-0 flex-1 py-2 text-[15px] leading-snug font-semibold text-ink">{g}</span>
                <IconButton
                  label={`Modifier «\u00a0${g}\u00a0»`}
                  onClick={() => {
                    setEditing(i)
                    setEditText(g)
                  }}
                >
                  ✏️
                </IconButton>
                <IconButton label={`Supprimer «\u00a0${g}\u00a0»`} onClick={() => remove(i)}>
                  🗑️
                </IconButton>
              </div>
            )}
          </motion.li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        <label htmlFor={addId} className="sr-only">
          Nouveau gage
        </label>
        <input
          id={addId}
          value={newGage}
          maxLength={GAGE_MAX}
          placeholder="Nouveau gage… 😈"
          enterKeyHint="done"
          onChange={(e) => setNewGage(e.target.value)}
          onKeyDown={onEnter(() => void add())}
          className={`${INPUT_CLASS} min-w-0 flex-1 bg-surface!`}
        />
        <MiniButton onClick={() => void add()} disabled={!clean(newGage)} ariaLabel="Ajouter le gage">
          ➕ Ajouter
        </MiniButton>
      </div>
    </div>
  )
}

function IconButton({ children, label, onClick }: { children: string; label: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.8 }}
      aria-label={label}
      className="grid size-12 shrink-0 place-items-center rounded-xl text-[20px] leading-none"
    >
      <span aria-hidden="true">{children}</span>
    </motion.button>
  )
}
