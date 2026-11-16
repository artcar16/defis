/**
 * Lueur colorée en haut d'une feuille plein écran.
 * (Remplace la prop `tone` de <Sheet>, dont le dégradé est répété en mosaïque
 * par le `background-size` de .app-bg.)
 */
export function SheetGlow({ color, height = 340 }: { color: string; height?: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 transition-[background] duration-700"
      style={{ height, background: `linear-gradient(180deg, color-mix(in oklab, ${color} 24%, transparent), transparent)` }}
    />
  )
}
