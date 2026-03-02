const APP_TOKEN = import.meta.env.VITE_GLPI_APP_TOKEN
const USER_TOKEN = import.meta.env.VITE_GLPI_USER_TOKEN

// In dev, requests go through the Vite proxy at /glpi-api
// In production, set BASE to your full GLPI URL + /apirest.php
const BASE = '/glpi-api/apirest.php'

// Base URL of the GLPI web UI — used to build ticket links
export const GLPI_URL = (import.meta.env.VITE_GLPI_URL ?? '').replace(/\/$/, '')

// GLPI ticket status codes
export const STATUS = {
  1: 'New',
  2: 'Assigned',
  3: 'Planned',
  4: 'Pending',
  5: 'Solved',
  6: 'Closed',
}

// GLPI priority codes
export const PRIORITY = {
  1: 'Very Low',
  2: 'Low',
  3: 'Medium',
  4: 'High',
  5: 'Very High',
  6: 'Major',
}

// --- Session cache (reused across refreshes, invalidated on 401/403) ---
const SESSION_TTL = 6 * 3600_000 // 6 hours
let _sessionToken = null
let _sessionExp = 0

async function initSession() {
  const res = await fetch(`${BASE}/initSession`, {
    headers: {
      Authorization: `user_token ${USER_TOKEN}`,
      'App-Token': APP_TOKEN,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`initSession failed: ${res.status} ${res.statusText}`)
  const data = await res.json()
  return data.session_token
}

async function getSession() {
  if (_sessionToken && Date.now() < _sessionExp) return _sessionToken
  _sessionToken = await initSession()
  _sessionExp = Date.now() + SESSION_TTL
  return _sessionToken
}

function invalidateSession() {
  _sessionToken = null
  _sessionExp = 0
}

// --- Static data caches (groups/entities change rarely) ---
const STATIC_TTL = 5 * 60_000 // 5 minutes
let _groupMap = null
let _groupMapExp = 0
let _entityNames = null
let _entityNamesExp = 0

const PAGE_SIZE = 1000
// fields: 1=id, 2=name, 10=priority, 12=status, 15=opening date
const TICKET_FIELDS = 'forcedisplay[0]=1&forcedisplay[1]=2&forcedisplay[2]=12&forcedisplay[3]=10&forcedisplay[4]=15'

// Returns true if the ticket has breached its TTO or TTR SLA.
// A ticket with no SLA deadlines at all is considered compliant.
function isBreached(ticket) {
  const now = new Date()

  if (ticket.time_to_own) {
    const deadline = new Date(ticket.time_to_own)
    const achieved = ticket.takeintoaccountdate ? new Date(ticket.takeintoaccountdate) : null
    if (achieved ? achieved > deadline : now > deadline) return true
  }

  if (ticket.time_to_resolve) {
    const deadline = new Date(ticket.time_to_resolve)
    const solved = ticket.solvedate ? new Date(ticket.solvedate) : null
    if (solved ? solved > deadline : now > deadline) return true
  }

  return false
}

// Returns "YYYY-WXX" ISO week label for a GLPI date string ("YYYY-MM-DD HH:MM:SS")
function toISOWeek(dateStr) {
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

function ticketHeaders(sessionToken) {
  return { 'Session-Token': sessionToken, 'App-Token': APP_TOKEN }
}

async function fetchTicketPage(sessionToken, start) {
  const end = start + PAGE_SIZE - 1
  const res = await fetch(
    `${BASE}/Ticket?range=${start}-${end}&${TICKET_FIELDS}`,
    { headers: ticketHeaders(sessionToken) }
  )
  // 206 = partial, 200 = full (fits in one page)
  if (res.status !== 200 && res.status !== 206) {
    throw new Error(`Ticket fetch failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  // Content-Range: 0-999/5432
  const total = parseInt(res.headers.get('Content-Range')?.split('/')[1] ?? '0', 10)
  return { data, total }
}

async function fetchAllTickets(sessionToken) {
  const first = await fetchTicketPage(sessionToken, 0)
  if (first.total <= PAGE_SIZE) return first.data

  const starts = []
  for (let s = PAGE_SIZE; s < first.total; s += PAGE_SIZE) starts.push(s)
  const rest = await Promise.all(starts.map((s) => fetchTicketPage(sessionToken, s)))

  return first.data.concat(...rest.map((r) => r.data))
}

// Paginate any GLPI list endpoint, returns all records.
async function fetchAll(sessionToken, path) {
  async function fetchPage(start) {
    const res = await fetch(`${BASE}/${path}${path.includes('?') ? '&' : '?'}range=${start}-${start + PAGE_SIZE - 1}`, {
      headers: ticketHeaders(sessionToken),
    })
    if (!res.ok) return { data: [], total: 0 }
    const data = await res.json()
    const total = parseInt(res.headers.get('Content-Range')?.split('/')[1] ?? '0', 10)
    return { data, total }
  }

  const first = await fetchPage(0)
  if (first.total <= PAGE_SIZE) return first.data

  const starts = []
  for (let s = PAGE_SIZE; s < first.total; s += PAGE_SIZE) starts.push(s)
  const rest = await Promise.all(starts.map((s) => fetchPage(s)))
  return first.data.concat(...rest.map((r) => r.data))
}

// Returns a map of { ticketId → groupName } using Group_Ticket (type 2 = assigned technician group).
async function fetchGroupMap(sessionToken) {
  const [groups, groupTickets] = await Promise.all([
    fetchAll(sessionToken, 'Group'),
    fetchAll(sessionToken, 'Group_Ticket'),
  ])

  const cleanName = (name) => name.replace(/^G_SEC_USR_TAUTURU_/i, '')
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, cleanName(g.name)]))

  const map = {}
  for (const item of groupTickets) {
    // type 2 = assigned/technician group; keep first group found per ticket
    if (item.type === 2 && !map[item.tickets_id]) {
      map[item.tickets_id] = groupNames[item.groups_id] ?? 'Unknown'
    }
  }
  return map
}

async function getCachedGroupMap(sessionToken) {
  if (_groupMap && Date.now() < _groupMapExp) return _groupMap
  _groupMap = await fetchGroupMap(sessionToken)
  _groupMapExp = Date.now() + STATIC_TTL
  return _groupMap
}

async function getCachedEntityNames(sessionToken) {
  if (_entityNames && Date.now() < _entityNamesExp) return _entityNames
  _entityNames = await fetchAll(sessionToken, 'Entity').then((list) =>
    Object.fromEntries(list.map((e) => [e.id, e.name]))
  )
  _entityNamesExp = Date.now() + STATIC_TTL
  return _entityNames
}

export async function fetchMetrics() {
  // Retry once if the cached session has expired server-side (401/403)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const sessionToken = await getSession()

      const [tickets, groupMap, entityNames] = await Promise.all([
        fetchAllTickets(sessionToken),
        getCachedGroupMap(sessionToken),
        getCachedEntityNames(sessionToken),
      ])

      const byStatus = {}
      const byPriority = {}
      let openCount = 0
      let totalResolveMs = 0
      let resolvedCount = 0

      const byWeek = {}, byMonth = {}
      const byWeekCompliance = {}, byMonthCompliance = {}
      const byWeekNoTTO = {}, byMonthNoTTO = {}
      const byGroupCompliance = {}
      const byEntity = {}
      const processedTickets = []

      for (const ticket of tickets) {
        const id = ticket.id ?? ticket[1]
        const name = ticket[2] ?? ticket.name ?? ''
        const status = ticket[12] ?? ticket.status
        const priority = ticket[10] ?? ticket.priority
        const date = ticket[15] ?? ticket.date
        const breached = isBreached(ticket)
        const week = date ? toISOWeek(date) : null
        const month = date ? date.substring(0, 7) : null
        const group = groupMap[id] ?? 'Unassigned'
        const entity = entityNames[ticket.entities_id] ?? `Entity ${ticket.entities_id}`

        byStatus[status] = (byStatus[status] ?? 0) + 1
        byPriority[priority] = (byPriority[priority] ?? 0) + 1
        if (status !== 5 && status !== 6) openCount++

        if ((status === 5 || status === 6) && ticket.solvedate && date) {
          const ms = new Date(ticket.solvedate) - new Date(date)
          if (ms > 0) { totalResolveMs += ms; resolvedCount++ }
        }

        if (week) {
          byWeek[week] = (byWeek[week] ?? 0) + 1
          byMonth[month] = (byMonth[month] ?? 0) + 1

          if (!byWeekCompliance[week]) byWeekCompliance[week] = { compliant: 0, nonCompliant: 0 }
          if (!byMonthCompliance[month]) byMonthCompliance[month] = { compliant: 0, nonCompliant: 0 }
          if (breached) { byWeekCompliance[week].nonCompliant++; byMonthCompliance[month].nonCompliant++ }
          else { byWeekCompliance[week].compliant++; byMonthCompliance[month].compliant++ }

          if (!ticket.begin_waiting_date) {
            byWeekNoTTO[week] = (byWeekNoTTO[week] ?? 0) + 1
            byMonthNoTTO[month] = (byMonthNoTTO[month] ?? 0) + 1
          }
        }

        if (!byGroupCompliance[group]) byGroupCompliance[group] = { compliant: 0, nonCompliant: 0 }
        if (breached) byGroupCompliance[group].nonCompliant++
        else byGroupCompliance[group].compliant++

        byEntity[entity] = (byEntity[entity] ?? 0) + 1

        const statusNum = Number(status)
        const rawResolveMs = (statusNum === 5 || statusNum === 6) && ticket.solvedate && date
          ? new Date(ticket.solvedate) - new Date(date)
          : null

        processedTickets.push({
          id,
          name,
          date,
          status: statusNum,
          priority: Number(priority),
          week,
          month,
          group,
          entity,
          breached,
          hasNoTTO: !ticket.begin_waiting_date,
          resolveMs: rawResolveMs > 0 ? rawResolveMs : null,
        })
      }

      const sortWeeks = (obj) =>
        Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))

      const topEntities = Object.entries(byEntity)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)

      return {
        openCount,
        byStatus,
        byPriority,
        byWeek: sortWeeks(byWeek),
        byWeekCompliance: sortWeeks(byWeekCompliance),
        byWeekNoTTO: sortWeeks(byWeekNoTTO),
        byMonth: sortWeeks(byMonth),
        byMonthCompliance: sortWeeks(byMonthCompliance),
        byMonthNoTTO: sortWeeks(byMonthNoTTO),
        byGroupCompliance,
        topEntities,
        processedTickets,
        total: tickets.length,
        avgResolveHours: resolvedCount > 0 ? Math.round(totalResolveMs / resolvedCount / 3600000) : null,
      }
    } catch (err) {
      // If session was rejected by the server, invalidate and retry once
      if (attempt === 0 && err.message?.includes('401') || err.message?.includes('403')) {
        invalidateSession()
        _groupMap = null
        _entityNames = null
        continue
      }
      throw err
    }
  }
}
