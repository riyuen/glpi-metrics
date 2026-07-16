export const GLPI_URL = (import.meta.env.VITE_GLPI_URL ?? '').replace(/\/$/, '')

export const STATUS = {
  1: 'Nouveau',
  2: 'En cours',
  3: 'Planifié',
  4: 'En attente',
  5: 'Résolu',
  6: 'Clôturé',
}

export const PRIORITY = {
  1: 'Très faible',
  2: 'Faible',
  3: 'Moyen',
  4: 'Élevé',
  5: 'Très élevé',
  6: 'Majeur',
}

// GLPI ticket type codes
export const TYPE = {
  1: 'Incident',
  2: 'Demande',
}

// Returns "YYYY-WXX" ISO week label for a GLPI date string ("YYYY-MM-DD HH:MM:SS")
export function toISOWeek(dateStr) {
  const d = new Date(dateStr)
  // Shift to the Thursday of the current week to get the ISO year/week
  const thursday = new Date(d)
  thursday.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3)
  const year = thursday.getFullYear()
  const jan4 = new Date(year, 0, 4)
  jan4.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + 3)
  const week = Math.round((thursday - jan4) / 604800000) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}

export async function fetchMetrics() {
  const res = await fetch('/api/metrics.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Metrics unavailable: ${res.status}`)
  return res.json()
}

export async function fetchSatisfaction() {
  const res = await fetch('/api/satisfaction.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Satisfaction unavailable: ${res.status}`)
  return res.json()
}
