import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Measures the element a chart is drawn into, in CSS pixels.
 *
 * Both charts in the app size their SVG from the box rather than scaling a
 * `viewBox`, so axis ticks and labels keep their real px size at every
 * breakpoint instead of growing with the panel. That needs a measurement, and
 * the measurement must not feed back into the thing being measured — the
 * canvas is absolutely positioned inside this box (see `.chart` in
 * styles/primitives.css), so it cannot influence the box's own layout.
 *
 * Lives outside lib/ because it is a hook: lib/ is pure, DOM-free maths.
 */
export function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width: Math.round(width), height: Math.round(height) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}
