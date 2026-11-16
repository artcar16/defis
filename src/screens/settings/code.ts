/**
 * 🔐 Code secret (décision 20) : règles de saisie partagées par l'écran de connexion et
 * les réglages. Module pur, sans React : la saisie, le collage, et les petits parcours
 * « choisis / confirme » et « ancien / nouveau / confirme ».
 */
import { typo } from '../../core/fr'
import { CODE_LENGTH } from '../../data/source'

export const CODE_MESSAGES = {
  /** Les deux saisies (choix + confirmation) ne sont pas identiques. */
  mismatch: typo('Les deux codes ne sont pas pareils 🙃 On recommence ?'),
  /** Le nouveau code est le même que l'ancien. */
  sameAsOld: typo('C’est déjà ton code actuel 😄 Choisis-en un autre'),
}

/** Garde seulement les chiffres (« 12 34 56 », « 12-34-56 »…), CODE_LENGTH au plus. */
export function cleanCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, CODE_LENGTH)
}

/** Le code a-t-il tous ses chiffres ? */
export function isCodeComplete(code: string): boolean {
  return code.length === CODE_LENGTH && /^\d+$/.test(code)
}

/**
 * Collage : un texte qui contient un code entier (« Mon code : 123456 ») le remplace ;
 * quelques chiffres seulement s'ajoutent à ce qui est déjà tapé.
 */
export function pasteCode(current: string, pasted: string): string {
  const digits = pasted.replace(/\D/g, '')
  return digits.length >= CODE_LENGTH ? digits.slice(0, CODE_LENGTH) : cleanCode(current + digits)
}

// ─── Connexion : premier code (choisir puis confirmer) ───────────────────────

/** Où en est la saisie du premier code : `first` = code choisi, en attente de confirmation. */
export interface NewCodeState {
  first: string | null
}

export type NewCodeResult =
  | { kind: 'next'; state: NewCodeState }
  | { kind: 'error'; state: NewCodeState; error: string }
  | { kind: 'submit'; state: NewCodeState; code: string }

/** Un code complet vient d'être tapé pendant le choix du premier code. */
export function newCodeStep(state: NewCodeState, code: string): NewCodeResult {
  if (state.first === null) return { kind: 'next', state: { first: code } }
  if (code !== state.first) return { kind: 'error', state: { first: null }, error: CODE_MESSAGES.mismatch }
  return { kind: 'submit', state, code }
}

// ─── Réglages : changer de code (ancien, nouveau, confirmation) ──────────────

export type ChangeCodeState =
  | { step: 'old' }
  | { step: 'new'; old: string }
  | { step: 'confirm'; old: string; next: string }

export type ChangeCodeResult =
  | { kind: 'next'; state: ChangeCodeState }
  | { kind: 'error'; state: ChangeCodeState; error: string }
  | { kind: 'submit'; state: ChangeCodeState; oldCode: string; newCode: string }

/** Un code complet vient d'être tapé pendant le changement de code. */
export function changeCodeStep(state: ChangeCodeState, code: string): ChangeCodeResult {
  switch (state.step) {
    case 'old':
      return { kind: 'next', state: { step: 'new', old: code } }
    case 'new':
      if (code === state.old) return { kind: 'error', state, error: CODE_MESSAGES.sameAsOld }
      return { kind: 'next', state: { step: 'confirm', old: state.old, next: code } }
    case 'confirm':
      if (code !== state.next) return { kind: 'error', state: { step: 'new', old: state.old }, error: CODE_MESSAGES.mismatch }
      return { kind: 'submit', state, oldCode: state.old, newCode: state.next }
  }
}
