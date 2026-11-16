// @vitest-environment jsdom
/**
 * Toasts en maquette (UX-1) : le toast « 👀 Laetitia vient de faire son check-in » se pose pile
 * sur la pastille 🧪 ; il doit donc dire lui-même que c'est la maquette. Hors maquette, rien.
 */
import { act, createElement, useEffect, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { DEMO_LABEL } from './DemoPill'
import { ToastProvider, useToast } from './toast'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function ShowOnMount({ text }: { text: string }) {
  const toast = useToast()
  useEffect(() => toast({ text }), [toast, text])
  return null
}

let cleanup: (() => void) | null = null
afterEach(() => {
  cleanup?.()
  cleanup = null
})

async function renderToast(note: string | undefined): Promise<HTMLElement[]> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    // (Les enfants passés à part : TypeScript veut les voir dans les props.)
    const props = { note } as ComponentProps<typeof ToastProvider>
    root.render(createElement(ToastProvider, props, createElement(ShowOnMount, { text: '👀 Laetitia vient de faire son check-in' })))
  })
  cleanup = () => {
    act(() => root.unmount())
    host.remove()
  }
  return [...host.querySelectorAll<HTMLElement>('[role="status"]')]
}

describe('ToastProvider · maquette', () => {
  it('en maquette, chaque toast porte « 🧪 Maquette · données inventées »', async () => {
    const toasts = await renderToast(`🧪 ${DEMO_LABEL}`)
    expect(toasts).toHaveLength(1)
    expect(toasts[0].textContent).toContain('Laetitia vient de faire son check-in')
    expect(toasts[0].textContent).toContain('🧪 Maquette · données inventées')
  })

  it('avec la vraie base : le toast seul', async () => {
    const toasts = await renderToast(undefined)
    expect(toasts).toHaveLength(1)
    expect(toasts[0].textContent).toBe('👀 Laetitia vient de faire son check-in')
  })
})
