/**
 * 🔌 « L'app n'est pas encore branchée à ta base » : le site déployé n'a pas reçu de
 * réglages Supabase utilisables (variables absentes, mal nommées, pas de redéploiement, ou
 * secret collé par erreur : clé secrète, mot de passe de la base). Plutôt que de tomber en maquette en silence (manches et
 * points inventés), on le dit, avec la marche à suivre adaptée au diagnostic.
 *
 * Écrit pour Arthus, pas pour un développeur : où cliquer sur Vercel, quel nom de variable
 * (jamais de valeur), et la date de version pour vérifier que le redéploiement a eu lieu.
 * Affiché par App à la place de tout (pas de DuelProvider).
 */
import { motion, useReducedMotion } from 'motion/react'
import { Fragment, useEffect, useId, useState, type ReactNode } from 'react'
import { typo } from '../core/fr'
import { versionText } from '../data/build'
import { isUrlVar, KEY_VAR, URL_VAR, type Diagnosis, type SupabaseVar } from '../data/mode'
import type { SecretKind, UrlHint } from '../data/supabase/config'
import { tint } from '../ui/color'
import { Button, springy } from '../ui/kit'

type Status = 'ok' | 'missing' | 'invalid' | 'secret'

const STATUS: Record<Status, { emoji: string; color: string }> = {
  ok: { emoji: '✅', color: 'var(--color-nickel)' },
  missing: { emoji: '❌', color: 'var(--color-craquage)' },
  invalid: { emoji: '⚠️', color: 'var(--color-unpeu)' },
  secret: { emoji: '🚨', color: 'var(--color-craquage)' },
}

function urlStatus(d: Diagnosis): Status {
  if (d.secrets.some((s) => isUrlVar(s.name))) return 'secret'
  if (d.problems.includes('missingUrl')) return 'missing'
  if (d.problems.includes('invalidUrl')) return 'invalid'
  return 'ok'
}

function keyStatus(d: Diagnosis): Status {
  if (d.keyVar) return 'ok'
  return d.secrets.some((s) => !isUrlVar(s.name)) ? 'secret' : 'missing'
}

const URL_EXAMPLE = 'https://xxxx.supabase.co'

/** Le libellé du bouton, tel que l'étape 4 (et le README) le cite. */
const RELOAD_LABEL = typo('J’ai redéployé : recharger')

/** URL reçue mais pas la bonne : ce qui cloche, en clair. */
const INVALID_URL: Record<UrlHint, string> = {
  database: 'Reçue, mais c’est l’adresse de la base de données (postgresql://… ou db.…), pas celle de l’app.',
  dashboard: 'Reçue, mais c’est l’adresse du tableau de bord de Supabase.',
  dotCom: 'Reçue, mais elle finit par .supabase.com : un m de trop !',
  other: 'Reçue, mais ce n’est pas la bonne adresse.',
}

/** « une clé secrète », « le mot de passe de la base »… trouvé dans cette variable (ou une des clés). */
function secretOf(d: Diagnosis, name?: SupabaseVar): string {
  const found = d.secrets.find((s) => (name ? s.name === name : !isUrlVar(s.name)))
  return found?.kind === 'db_password' ? 'le mot de passe de la base' : 'une clé secrète'
}

/** Le titre de l'écran (aussi cité par le README). */
export const NOT_CONNECTED_TITLE = typo('L’app n’est pas encore branchée à ta base')

/** Sous l'en-tête : pourquoi elle ne démarre pas (rien reçu, un réglage qui cloche, ou un secret). */
export function notConnectedLead(d: Diagnosis): string {
  if (d.secrets.length > 0) {
    return typo('Elle a reçu un secret qu’il ne fallait surtout pas lui donner, alors elle refuse de démarrer 🙅')
  }
  return d.found.length === 0
    ? typo(
        'Elle ne trouve pas les réglages de ta base Supabase. Sans eux, ce serait la maquette, avec des manches et des points inventés : on préfère te le dire 🙅',
      )
    : typo(
        'Il lui manque un réglage de ta base Supabase, ou il n’est pas bon. Sinon, ce serait la maquette, avec des manches et des points inventés : on préfère te le dire 🙅',
      )
}

export function NotConnectedScreen({ diagnosis }: { diagnosis: Diagnosis }) {
  const reduced = useReducedMotion() ?? false
  const secret = diagnosis.secrets.length > 0
  const version = versionText()

  const appear = (i: number) => ({
    initial: reduced ? false : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { ...springy, delay: 0.08 * i },
  })

  return (
    <div className="app-bg min-h-dvh text-ink">
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)]">
        <motion.header className="pt-2 text-center" {...appear(0)}>
          <motion.div
            className="emoji-xl inline-block origin-top"
            animate={reduced ? undefined : { rotate: [0, -10, 8, -4, 0] }}
            transition={{ duration: 1.2, delay: 0.6, repeat: Infinity, repeatDelay: 3 }}
            aria-hidden="true"
          >
            🔌
          </motion.div>
          <h1 className="mt-3 font-display text-[29px] leading-[1.05] font-bold tracking-tight text-balance text-ink min-[360px]:text-[32px]">
            {NOT_CONNECTED_TITLE}
          </h1>
          <p className="mx-auto mt-3 max-w-[22rem] text-[16px] leading-snug font-semibold text-balance text-ink-soft">
            {notConnectedLead(diagnosis)}
          </p>
        </motion.header>

        {secret && (
          <motion.div {...appear(1)}>
            <SecretAlert secrets={diagnosis.secrets} />
          </motion.div>
        )}

        <motion.div {...appear(secret ? 2 : 1)}>
          <Checklist diagnosis={diagnosis} />
        </motion.div>

        <motion.div className="mt-6 flex flex-col gap-3" {...appear(secret ? 3 : 2)}>
          <Button block size="lg" color="var(--color-electric)" className="font-bold" onClick={() => location.reload()}>
            🔄 {RELOAD_LABEL}
          </Button>
          {/* Clé secrète : la maquette ne démarre pas non plus, inutile de la proposer. */}
          {!secret && (
            <a href="?demo" className="btn-chunky btn-soft min-h-12 w-full px-5 py-2 text-[17px]">
              👀 Voir la maquette
            </a>
          )}
        </motion.div>

        {version && (
          <motion.p className="mt-6 text-center text-[14px] leading-snug font-semibold text-balance text-ink-soft" {...appear(secret ? 4 : 3)}>
            🏷️ {version}
            <br />
            <span className="font-medium">{typo('Elle change à chaque redéploiement (heure de Paris).')}</span>
          </motion.p>
        )}
      </main>
    </div>
  )
}

// ─── Secret publié : avertissement prioritaire ───────────────────────────────

/** « la clé secrète de Supabase », « le mot de passe de la base »… (dans une phrase). */
const SECRET_NAME: Record<SecretKind, string> = {
  sb_secret: 'la clé secrète de Supabase',
  service_role: 'la clé secrète de Supabase (l’ancienne « service_role »)',
  db_password: 'le mot de passe de ta base Supabase',
}

function SecretAlert({ secrets }: { secrets: { name: SupabaseVar; kind: SecretKind }[] }) {
  const titleId = useId()
  const names = [...new Set(secrets.map((s) => s.name))]
  const kinds = new Set(secrets.map((s) => s.kind))
  const password = kinds.has('db_password')
  const key = kinds.has('sb_secret') || kinds.has('service_role')
  const legacy = kinds.has('service_role')
  const what =
    kinds.size === 1
      ? SECRET_NAME[secrets[0].kind]
      : `${password ? 'des secrets de Supabase (clé secrète et mot de passe de la base)' : SECRET_NAME.sb_secret}`
  const urlHasPassword = secrets.some((s) => s.kind === 'db_password' && isUrlVar(s.name))
  return (
    <section
      role="alert"
      aria-labelledby={titleId}
      className="mt-5 rounded-[var(--radius-card)] px-4 py-4"
      style={{
        background: tint('var(--color-craquage)', 16),
        boxShadow: `inset 0 0 0 2.5px ${tint('var(--color-craquage)', 75, 'transparent')}, var(--shadow-card)`,
      }}
    >
      <h2 id={titleId} className="flex items-center gap-2 font-display text-[21px] leading-tight font-bold text-ink">
        <span className="text-[28px] leading-none" aria-hidden="true">
          🚨
        </span>
        {typo(key ? 'Stop : c’est la clé secrète !' : 'Stop : c’est le mot de passe de la base !')}
      </h2>
      <p className="mt-2 text-[15px] leading-snug font-semibold text-ink">
        {names.length > 1 ? 'Les variables ' : 'La variable '}
        {names.map((n, i) => (
          <span key={n}>
            {i > 0 && (i === names.length - 1 ? ' et ' : ', ')}
            <VarName>{n}</VarName>
          </span>
        ))}
        {typo(
          ` ${names.length > 1 ? 'contiennent' : 'contient'} ${what}, qui donne tous les droits sur la base. Elle a été publiée dans l’app : n’importe qui peut la lire. L’app refuse de s’en servir.`,
        )}
      </p>
      <p className="mt-3 font-display text-[16px] font-bold text-ink">Tout de suite&nbsp;:</p>
      <ol className="mt-1.5 flex flex-col gap-2 text-[15px] leading-snug font-semibold text-ink">
        <AlertStep n={1}>
          {typo(`Vercel › Settings › Environment Variables : supprime ${names.length > 1 ? 'ces variables' : 'cette variable'}.`)}
        </AlertStep>
        <AlertStep n={2}>
          {key && typo('Supabase › Project Settings › API Keys : régénère la clé secrète, pour que l’ancienne ne marche plus.')}
          {legacy && (
            <span className="block text-ink-soft">
              {typo('(Ancienne clé « service_role » : c’est en changeant le secret JWT, dans JWT Keys.)')}
            </span>
          )}
          {password && (
            <span className={key ? 'mt-1 block' : undefined}>
              {typo('Supabase › Project Settings › Database : « Reset database password », pour que l’ancien ne marche plus.')}
            </span>
          )}
        </AlertStep>
        <AlertStep n={3}>
          {key && (
            <>
              {typo('Mets à la place la Publishable key (sb_publishable_…) dans ')}
              <VarName>{KEY_VAR}</VarName>
              {urlHasPassword ? '.' : typo(', puis Redeploy (voir ci-dessous).')}
            </>
          )}
          {urlHasPassword && (
            <span className={key ? 'mt-1 block' : undefined}>
              {typo('Mets dans ')}
              <VarName>{URL_VAR}</VarName>
              {typo(' le Project URL (Supabase › Connect), du genre ')}
              <Example>{URL_EXAMPLE}</Example>
              {typo(', puis Redeploy (voir ci-dessous).')}
            </span>
          )}
          {password && !key && !urlHasPassword && typo('Puis Redeploy (voir ci-dessous).')}
        </AlertStep>
      </ol>
    </section>
  )
}

function AlertStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="font-display font-bold" aria-hidden="true">
        {n}.
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  )
}

// ─── La marche à suivre sur Vercel ───────────────────────────────────────────

function Checklist({ diagnosis }: { diagnosis: Diagnosis }) {
  const titleId = useId()
  const url = urlStatus(diagnosis)
  const key = keyStatus(diagnosis)
  const nothing = diagnosis.found.length === 0

  return (
    <section className="card mt-5 p-4" aria-labelledby={titleId}>
      <h2 id={titleId} className="font-display text-[22px] leading-tight font-bold text-ink">
        À faire sur Vercel 🛠️
      </h2>
      {nothing && (
        <p className="mt-1.5 text-[15px] leading-snug font-semibold text-ink-soft">
          {typo(
            'L’app n’a reçu aucune des deux variables. Le plus souvent : elles ont été ajoutées sans redéployer, ou leur nom est un peu différent.',
          )}
        </p>
      )}

      <ol className="mt-3 flex flex-col gap-4">
        <Step n={1}>
          {typo('Sur vercel.com, ouvre ton projet › ')}
          <b>Settings</b> › <b>Environment Variables</b>.
        </Step>
        <Step n={2}>
          {typo('Vérifie ces deux variables. Chaque nom doit être exactement celui affiché (ou sa version NEXT_PUBLIC_…), et Production cochée.')}
          {/* Toute la largeur de la carte (sous le numéro aussi) : les noms tiennent sur une ligne. */}
          <ul className="mt-2.5 -ml-11 flex flex-col gap-2">
            <VarRow name={diagnosis.found.find(isUrlVar) ?? URL_VAR} status={url}>
              {url === 'ok' && 'Reçue 👍'}
              {url === 'missing' && (
                <>
                  {typo('Pas reçue. Valeur : le Project URL (Supabase › Connect), du genre ')}
                  <Example>{URL_EXAMPLE}</Example>
                </>
              )}
              {url === 'invalid' && (
                <>
                  {typo(`${INVALID_URL[diagnosis.urlHint ?? 'other']} Il faut le Project URL (Supabase › Connect), du genre `)}
                  <Example>{URL_EXAMPLE}</Example>.
                </>
              )}
              {url === 'secret' && typo(`Contient ${secretOf(diagnosis, diagnosis.secrets.find((s) => isUrlVar(s.name))?.name)} ! À retirer (voir plus haut).`)}
            </VarRow>
            <VarRow name={KEY_VAR} status={key}>
              {key === 'ok' &&
                (diagnosis.keyVar === KEY_VAR ? (
                  'Reçue 👍'
                ) : (
                  <>
                    {typo('Reçue sous le nom ')}
                    <VarName>{diagnosis.keyVar ?? KEY_VAR}</VarName>
                    {typo(' : ça marche aussi 👍')}
                  </>
                ))}
              {key === 'missing' && (
                <>
                  {typo('Pas reçue. Valeur : la Publishable key (Supabase › Connect), qui commence par ')}
                  <Example>sb_publishable_</Example>
                </>
              )}
              {key === 'secret' && (
                <>
                  {typo(`Contient ${secretOf(diagnosis)} ! Mets la Publishable key à la place, qui commence par `)}
                  <Example>sb_publishable_</Example>
                </>
              )}
            </VarRow>
          </ul>
        </Step>
        <Step n={3}>
          <b>Deployments</b>
          {typo(' › ⋯ à droite du dernier › ')}
          <b>Redeploy</b>
          {typo('. Les variables ne comptent qu’après un redéploiement.')}
        </Step>
        <Step n={4}>
          {typo(`Une fois « Ready » (une minute environ), touche « ${RELOAD_LABEL} » ci-dessous : la date de version doit changer.`)}
        </Step>
      </ol>
    </section>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="grid size-8 shrink-0 place-items-center rounded-full font-display text-[17px] font-bold"
        style={{ background: tint('var(--color-electric)', 16), color: 'var(--color-ink)' }}
        aria-hidden="true"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-1 text-[15px] leading-snug font-semibold text-ink">{children}</div>
    </li>
  )
}

function VarRow({ name, status, children }: { name: SupabaseVar; status: Status; children: ReactNode }) {
  const s = STATUS[status]
  return (
    <li
      className="rounded-2xl px-3 py-2.5"
      style={{ background: tint(s.color, 12), boxShadow: `inset 0 0 0 2px ${tint(s.color, 35, 'transparent')}` }}
    >
      <code className="block font-mono text-[13px] leading-snug font-bold text-ink">{breakAfterUnderscores(name)}</code>
      <div className="mt-1 flex flex-wrap items-end gap-x-2 gap-y-1.5">
        <p className="flex min-w-0 flex-1 basis-40 gap-1.5 text-[14px] leading-snug font-semibold text-ink-soft">
          <span aria-hidden="true">{s.emoji}</span>
          <span className="min-w-0 flex-1">{children}</span>
        </p>
        <span className="ml-auto shrink-0">
          <CopyName name={name} />
        </span>
      </div>
    </li>
  )
}

/** Copier le nom exact de la variable (une faute de frappe suffit à tout casser). */
function CopyName({ name }: { name: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(t)
  }, [copied])

  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard
  if (!canCopy) return null
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={() => {
        navigator.clipboard.writeText(name).then(
          () => setCopied(true),
          () => {},
        )
      }}
      aria-label={copied ? `${name} copié` : `Copier le nom ${name}`}
      className="min-h-11 shrink-0 rounded-xl bg-surface px-3 font-display text-[14px] font-semibold text-ink-soft shadow-[0_3px_0_var(--color-line)]"
    >
      {copied ? 'Copié ✓' : '📋 Copier le nom'}
    </motion.button>
  )
}

/**
 * Un nom de variable, à recopier au caractère près : coupé seulement après un « _ »
 * (VITE_SUPABASE_PUBLISHABLE_/KEY), jamais au milieu d'un mot.
 */
export function VarName({ children }: { children: string }) {
  return <code className="font-mono text-[0.92em] font-bold">{breakAfterUnderscores(children)}</code>
}

/** « VITE_SUPABASE_URL » → VITE_<wbr>SUPABASE_<wbr>URL. */
function breakAfterUnderscores(name: string): ReactNode {
  return name.split(/(?<=_)/).map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <wbr />}
      {part}
    </Fragment>
  ))
}

function Example({ children }: { children: ReactNode }) {
  return <b className="font-bold [overflow-wrap:anywhere] text-ink">{children}</b>
}
