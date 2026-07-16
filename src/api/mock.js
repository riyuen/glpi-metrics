// Synthetic data generator for local UI preview when the real GLPI API is unreachable.
// Enabled via VITE_MOCK_DATA=true (see .env.local). Produces data shaped exactly like
// fetchMetrics()/fetchSatisfaction() so every widget/metric/dimension has something to show.
import { toISOWeek } from './glpi.js'

const GROUPS = ['Réseau', 'Support N1', 'Support N2', 'Applications', 'Postes de travail']
const ENTITIES = ['Siège', 'Agence Papeete', 'Agence Moorea', 'Agence Bora Bora', 'Direction générale']
const CATEGORIES = ['Matériel', 'Logiciel', 'Réseau', 'Compte utilisateur', 'Téléphonie', 'Sans catégorie']
const TECHS = ['Marama Teriipaia', 'Heimana Faua', 'Vaihere Tetuanui', 'Manutea Vernaudon', 'Teiva Mou']
const REQUESTERS = ['Alice Dupont', 'Bertrand Roux', 'Célestine Ah-Scha', 'David Temaru', 'Elise Wong']
const SLA_TTR = [{ name: 'SLA Standard', targetH: 48 }, { name: 'SLA Urgent', targetH: 8 }]
const SLA_TTO = [{ name: 'TTO Standard', targetH: 4 }, { name: 'TTO Urgent', targetH: 1 }]

function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}
const rand = seededRandom(42)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const H = 3600000
const DAY = 24 * H

function daysAgo(n, jitterH = 0) {
  const d = new Date(Date.now() - n * DAY - jitterH * H * rand())
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export function generateMockTickets(count = 420) {
  const tickets = []
  for (let i = 1; i <= count; i++) {
    const ageDays = Math.floor(rand() * 120)
    const createdAt = daysAgo(ageDays, 20)
    const created = new Date(createdAt)

    const roll = rand()
    const status = roll < 0.12 ? 1 : roll < 0.35 ? 2 : roll < 0.42 ? 3 : roll < 0.5 ? 4 : roll < 0.75 ? 5 : 6
    const priority = 1 + Math.floor(rand() * 6)
    const type = rand() < 0.6 ? 1 : 2
    const group = pick(GROUPS)
    const entity = pick(ENTITIES)
    const category = pick(CATEGORIES)
    const requester = pick(REQUESTERS)

    const isClosed = status === 5 || status === 6
    const ttr = pick(SLA_TTR)
    const tto = pick(SLA_TTO)
    const slaTTRMs = ttr.targetH * H
    const slaTTOMs = tto.targetH * H

    // ~78% compliant on both fronts
    const ttoOnTime = rand() < 0.82
    const actualTTOMs = Math.round(slaTTOMs * (ttoOnTime ? rand() * 0.9 : 1 + rand()))
    const hasNoTTO = rand() < 0.08
    const takeintoaccountdate = hasNoTTO ? null
      : new Date(created.getTime() + actualTTOMs).toISOString().slice(0, 19).replace('T', ' ')

    let solvedate = null, resolveMs = null
    if (isClosed) {
      const resolveOnTime = rand() < 0.75
      resolveMs = Math.round(slaTTRMs * (resolveOnTime ? rand() * 0.9 : 1 + rand() * 0.6))
      solvedate = new Date(created.getTime() + resolveMs).toISOString().slice(0, 19).replace('T', ' ')
    }

    const breached = (!hasNoTTO && actualTTOMs > slaTTOMs) || (isClosed && resolveMs > slaTTRMs)
    const techName = (status !== 1 && rand() < 0.85) ? pick(TECHS) : null

    tickets.push({
      id: i,
      name: `Ticket #${i} — ${category}`,
      date: createdAt,
      status,
      priority,
      type,
      week: toISOWeek(createdAt),
      month: createdAt.substring(0, 7),
      group,
      entity,
      category,
      requester,
      solvedate,
      breached,
      hasNoTTO,
      resolveMs: isClosed ? resolveMs : null,
      actualTTOMs: hasNoTTO ? null : actualTTOMs,
      slaTTOMs,
      slaTTRMs,
      slaTTRName: ttr.name,
      slaTTRTargetH: ttr.targetH,
      ttoSlaName: tto.name,
      ttoSlaTargetH: tto.targetH,
      techName,
    })
  }
  return tickets
}

export function generateMockSatisfaction(tickets) {
  const closed = tickets.filter(t => t.status === 5 || t.status === 6)
  return closed
    .filter(() => rand() < 0.55)
    .map(t => ({
      ticketId: t.id,
      score: Math.max(1, Math.min(5, Math.round(3.6 + (rand() - 0.5) * 3))),
      comment: rand() < 0.3 ? 'Merci pour la réactivité !' : '',
      date: t.solvedate ?? t.date,
      group: t.group,
      technician: t.techName ?? '—',
      requester: t.requester,
    }))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}
