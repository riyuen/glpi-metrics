// Color helpers shared by the widget renderers.

// Returns `color` with its alpha replaced by `a`. Accepts #rgb, #rrggbb, rgb(), rgba().
export function withAlpha(color, a) {
  if (!color) return `rgba(56,189,248,${a})`
  if (color.startsWith('#')) {
    let hex = color.slice(1)
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${a})`
  }
  const m = color.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const [r, g, b] = m[1].split(',').map(s => s.trim())
    return `rgba(${r},${g},${b},${a})`
  }
  return color
}
