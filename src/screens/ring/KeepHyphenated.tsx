/**
 * Texte où les mots composés (« check-in », « petit-déj ») ne se coupent pas au trait d'union
 * en fin de ligne : chacun est gardé d'un bloc.
 */
export function KeepHyphenated({ text }: { text: string }) {
  const parts = text.split(/(\S+-\S+)/)
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="whitespace-nowrap">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  )
}
