/** Écran de connexion — à construire. */
import { useDuel } from '../data/DuelProvider'
import { Button } from '../ui/kit'

export function LoginScreen() {
  const { demo, snapshot } = useDuel()
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      {snapshot.players.map((p) => (
        <Button key={p.id} color={p.color} onClick={() => demo?.signIn(p.id)}>
          {p.emoji} {p.name}
        </Button>
      ))}
    </div>
  )
}
