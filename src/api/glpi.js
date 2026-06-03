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
