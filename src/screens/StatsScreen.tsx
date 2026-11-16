/**
 * 📊 Écran Stats : bilan des manches, course au poids (en %), calendriers des
 * habitudes avec séries 🔥 et records 🏆, historique des manches.
 * Toutes les données passent par useDuel() (démo aujourd'hui, Supabase demain).
 */
import { useDuel } from '../data/DuelProvider'
import { ScreenHeader, SectionTitle } from '../ui/kit'
import { useNav } from '../ui/nav'
import { Reveal } from './stats/bits'
import { HabitCalendars } from './stats/HabitCalendars'
import { RecordHero } from './stats/RecordHero'
import { WeekHistory } from './stats/WeekHistory'
import { WeightRace } from './stats/WeightRace'

export function StatsScreen() {
  const { snapshot, season, me, other, today, playerById } = useDuel()
  const { openSheet, setTab } = useNav()

  return (
    <div className="pb-2">
      <ScreenHeader
        title="Stats"
        emoji="📊"
        subtitle={season.notStarted ? 'Le duel n’a pas encore commencé ⏳' : `Manche ${season.current.index} · vos exploits (et vos craquages) 😏`}
      />

      <Reveal index={0}>
        <RecordHero season={season} me={me} other={other} />
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
        <SectionTitle>Historique des manches 📜</SectionTitle>
        <WeekHistory
          finished={season.finished}
          current={season.notStarted ? null : season.current}
          me={me}
          other={other}
          playerById={playerById}
          onOpen={(weekStart) => openSheet({ kind: 'results', weekStart })}
          onCurrent={() => setTab('ring')}
        />
      </Reveal>
    </div>
  )
}
