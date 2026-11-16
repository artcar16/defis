/**
 * 1. Mon profil : prénom, avatar, couleur, « montrer mes kilos ». Tout est immédiat.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useState } from 'react'
import { AVATAR_EMOJIS, PLAYER_COLORS } from '../../config/defaults'
import { useDuel } from '../../data/DuelProvider'
import { Avatar, springy } from '../../ui/kit'
import { useToast } from '../../ui/toast'
import { deName } from './format'
import { EmojiGrid, Label, Section, TextField, Toggle, useAction } from './ui'

const NAME_MAX = 20

const COLOR_NAMES: Record<string, string> = {
  '#FF6F61': 'Corail',
  '#2E6BFF': 'Bleu électrique',
  '#8B5CF6': 'Violet',
  '#10B981': 'Émeraude',
  '#F59E0B': 'Ambre',
  '#EC4899': 'Rose bonbon',
  '#06B6D4': 'Turquoise',
  '#EF4444': 'Rouge',
}

export function ProfileSection({ index }: { index: number }) {
  const { me, other, source } = useDuel()
  const { run } = useAction()
  const toast = useToast()
  const reduced = useReducedMotion() ?? false
  const nameId = useId()

  const [name, setName] = useState(me.name)
  // Si le prénom change ailleurs (autre appareil…), on suit (ajustement pendant le rendu).
  const [syncedName, setSyncedName] = useState(me.name)
  if (me.name !== syncedName) {
    setSyncedName(me.name)
    setName(me.name)
  }

  const preview = { ...me, name: name.trim() || me.name }

  const saveName = () => {
    const clean = name.trim().replace(/\s+/g, ' ')
    if (!clean) {
      setName(me.name)
      toast({ text: 'Un prénom vide ? Même pas en rêve 😅' })
      return
    }
    if (clean === me.name) return
    void run(() => source.updateProfile({ name: clean }), { text: `C’est noté, ${clean} ✏️`, color: me.color })
  }

  const pickEmoji = (emoji: string) => {
    if (emoji === me.emoji) return
    if (emoji === other.emoji) {
      toast({ text: `${emoji} est déjà pris par ${other.name} 😏`, color: other.color })
      return
    }
    void run(() => source.updateProfile({ emoji }))
  }

  const pickColor = (color: string) => {
    if (color.toLowerCase() === me.color.toLowerCase()) return
    if (color.toLowerCase() === other.color.toLowerCase()) {
      toast({ text: `Cette couleur, c’est celle ${deName(other.name)} 🙅`, color: other.color })
      return
    }
    void run(() => source.updateProfile({ color }))
  }

  return (
    <Section index={index} emoji="😎" title="Mon profil" subtitle="Change tout quand tu veux, c’est immédiat">
      {/* Aperçu en direct */}
      <div
        className="flex items-center gap-4 rounded-3xl px-4 py-4"
        style={{ background: `linear-gradient(135deg, color-mix(in oklab, ${me.color} 20%, var(--color-surface)), var(--color-sunken))` }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={`${me.emoji}-${me.color}`}
            initial={reduced ? false : { scale: 0.4, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { scale: 0.4, rotate: 20, opacity: 0 }}
            transition={springy}
          >
            <Avatar player={preview} size="lg" ring />
          </motion.div>
        </AnimatePresence>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[26px] leading-tight font-bold" style={{ color: `color-mix(in oklab, ${me.color} 75%, var(--color-ink))` }}>
            {preview.name}
          </div>
          <div className="mt-0.5 text-[15px] font-semibold text-ink-soft">
            {me.emoji} vs {other.emoji} — prêt·e à en découdre ?
          </div>
        </div>
      </div>

      <Label htmlFor={nameId}>Prénom</Label>
      <TextField
        id={nameId}
        value={name}
        maxLength={NAME_MAX}
        autoComplete="given-name"
        enterKeyHint="done"
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setName(me.name)
            e.currentTarget.blur()
          }
        }}
      />

      <Label>Avatar</Label>
      <EmojiGrid
        emojis={AVATAR_EMOJIS}
        value={me.emoji}
        onPick={pickEmoji}
        color={me.color}
        label="Choisis ton avatar"
        taken={{ emoji: other.emoji, color: other.color, by: other.name }}
      />

      <Label>Couleur</Label>
      <div role="radiogroup" aria-label="Choisis ta couleur" className="grid grid-cols-4 justify-items-center gap-y-3">
        {PLAYER_COLORS.map((c) => {
          const active = c.toLowerCase() === me.color.toLowerCase()
          const taken = c.toLowerCase() === other.color.toLowerCase()
          const name = COLOR_NAMES[c] ?? c
          return (
            <motion.button
              key={c}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={taken ? `${name} (couleur ${deName(other.name)})` : name}
              onClick={() => pickColor(c)}
              whileTap={reduced ? undefined : { scale: 0.85 }}
              animate={active && !reduced ? { scale: [1, 1.15, 1] } : { scale: 1 }}
              transition={springy}
              className="relative grid size-[52px] place-items-center rounded-full"
              style={{
                background: c,
                boxShadow: active
                  ? `0 0 0 4px var(--color-surface), 0 0 0 7px ${c}, 0 4px 0 color-mix(in oklab, ${c} 65%, black)`
                  : `0 4px 0 color-mix(in oklab, ${c} 65%, black)`,
                opacity: taken ? 0.5 : 1,
              }}
            >
              {active && (
                <motion.span
                  initial={reduced ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={springy}
                  className="text-[22px] leading-none"
                  aria-hidden="true"
                >
                  {me.emoji}
                </motion.span>
              )}
              {taken && (
                <span className="text-[20px] leading-none" aria-hidden="true">
                  {other.emoji}
                </span>
              )}
            </motion.button>
          )
        })}
      </div>

      <div className="mt-5">
        <Toggle
          checked={me.showKg}
          onChange={(showKg) =>
            void run(
              () => source.updateProfile({ showKg }),
              showKg ? `${other.name} peut voir tes kilos 👀` : `Tes kilos sont de nouveau secrets 🤫`,
            )
          }
          label={`Montrer mes kilos à ${other.name}`}
          description={me.showKg ? `${other.name} voit tes pesées en kg` : `Sinon, ${other.name} ne voit que tes % 🤫`}
        />
      </div>
    </Section>
  )
}
