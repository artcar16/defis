/**
 * Description lisible d'une proposition, avec le contexte du duel en cours.
 */
import { useCallback } from 'react'
import { weighInDayFor } from '../../core/scoring'
import type { Proposal } from '../../core/types'
import { useDuel } from '../../data/DuelProvider'
import { describeProposal, type ProposalText } from './format'

export function useDescribe(): (p: Proposal) => ProposalText {
  const { me, snapshot, today, playerById } = useDuel()
  const currentWeighDay = weighInDayFor(today, snapshot.settings)
  return useCallback(
    (p: Proposal) => describeProposal(p, { meId: me.id, habits: snapshot.habits, playerById, currentWeighDay }),
    [me.id, snapshot.habits, playerById, currentWeighDay],
  )
}
