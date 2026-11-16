/**
 * 📊 Écran Stats : bilan des manches, course au poids (en %), calendriers des
 * habitudes avec séries 🔥 et records 🏆, historique des manches.
 * Toutes les données passent par useDuel() (démo aujourd'hui, Supabase demain).
 */
import { addDays } from '../core/dates'
import { useDuel } from '../data/DuelProvider'
import { ScreenHeader, SectionTitle } from '../ui/kit'
import { ANCHORS, useNav } from '../ui/nav'
import { Reveal } from './stats/bits'
import { verdictLabel } from './stats/format'
import { HabitCalendars } from './stats/HabitCalendars'
import { RecordHero } from './stats/RecordHero'
import { WeekHistory } from './stats/WeekHistory'
import { WeightRace } from './stats/WeightRace'

export function StatsScreen() {
  const { snapshot, season, me, other, today, playerById } = useDuel()
  const { openSheet } = useNav()
  // Premier verdict : le lundi qui suit la première manche (affiché tant que rien n'est joué).
  const verdict = verdictLabel(today, addDays(season.weeks[0]?.weekStart ?? season.current.weekStart, 7))

  return (
    <div className="pb-2">
      <ScreenHeader
        title="Stats"
        emoji="📊"
        subtitle={season.notStarted ? 'Le duel n’a pas encore commencé ⏳' : `Manche ${season.current.index} · vos exploits (et vos craquages) 😏`}
      />

      <Reveal index={0}>
        <RecordHero season={season} me={me} other={other} verdict={verdict} />
      </Reveal>

      <Reveal index={1}>
        <SectionTitle>La course au poids 🏁</SectionTitle>
        <WeightRace weighIns={snapshot.weighIns} me={me} other={other} />
      </Reveal>

      <Reveal index={2}>
        <SectionTitle>Le calendrier des habitudes 📅</SectionTitle>
        <HabitCalendars
          me={me}
          other={other}
          habits={snapshot.habits}
          checkins={season.data.checkins}
          today={today}
          seasonStart={snapshot.settings.seasonStart}
        />
      </Reveal>

      <Reveal index={3}>
        {/*
         * Cible du raccourci « Bilan · Historique › » du Ring : setTab('stats', { anchor: ANCHORS.history }).
         * La marge de défilement (encoche + 12 px) vient de la règle globale [id] d'index.css :
         * pas de scroll-mt-* ici, il l'écraserait.
         */}
        <section id={ANCHORS.history} aria-label="Historique des manches">
          <SectionTitle>Historique des manches 📜</SectionTitle>
          <WeekHistory
            finished={season.finished}
            current={season.notStarted ? null : season.current}
            verdict={verdict}
            me={me}
            other={other}
            playerById={playerById}
            onOpen={(weekStart) => openSheet({ kind: 'results', weekStart })}
          />
        </section>
      </Reveal>
    </div>
  )
}
