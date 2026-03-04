const APP_TOKEN = import.meta.env.VITE_GLPI_APP_TOKEN
const USER_TOKEN = import.meta.env.VITE_GLPI_USER_TOKEN

// In dev, requests go through the Vite proxy at /glpi-api
// In production, set BASE to your full GLPI URL + /apirest.php
const BASE = '/glpi-api/apirest.php'

// Base URL of the GLPI web UI — used to build ticket links
export const GLPI_URL = (import.meta.env.VITE_GLPI_URL ?? '').replace(/\/$/, '')

// GLPI ticket status codes
export const STATUS = {
  1: 'Nouveau',
  2: 'En cours',
  3: 'Planifié',
  4: 'En attente',
  5: 'Résolu',
  6: 'Clôturé',
}

// GLPI priority codes
export const PRIORITY = {
  1: 'Très faible',
  2: 'Faible',
  3: 'Moyen',
  4: 'Élevé',
  5: 'Très élevé',
  6: 'Majeur',
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
let _userNames = null
let _userNamesExp = 0
let _slaMap = null
let _slaMapExp = 0
let _techMap = null        // { ticketId → techName }
let _techUserIdMap = null  // { ticketId → userId }
let _techMapExp = 0
let _groupMembership = null  // { userId → Set<groupName> }
let _groupMembershipExp = 0

const PAGE_SIZE = 1000
const TICKET_FIELDS = 'is_deleted=0'

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

async function getCachedUserNames(sessionToken) {
  if (_userNames && Date.now() < _userNamesExp) return _userNames
  const users = await fetchAll(sessionToken, 'User')
  _userNames = Object.fromEntries(
    users.map(u => [u.id, [u.firstname, u.realname].filter(Boolean).join(' ') || u.name])
  )
  _userNamesExp = Date.now() + STATIC_TTL
  return _userNames
}

// Returns { id → { name, targetH } } for all SLAs.
// resolution_time is stored in seconds in GLPI.
async function getCachedSlaMap(sessionToken) {
  if (_slaMap && Date.now() < _slaMapExp) return _slaMap
  const slas = await fetchAll(sessionToken, 'SLA')
  _slaMap = Object.fromEntries(
    slas.map(s => {
      const secs = Number(s.resolution_time)
      return [s.id, { name: s.name, targetH: secs > 0 ? +(secs / 3600).toFixed(1) : null }]
    })
  )
  _slaMapExp = Date.now() + STATIC_TTL
  return _slaMap
}

// Returns { techMap: { ticketId → techName }, techUserIdMap: { ticketId → userId } }
async function getCachedTechData(sessionToken) {
  if (_techMap && Date.now() < _techMapExp) return { techMap: _techMap, techUserIdMap: _techUserIdMap }
  const [ticketUsers, userNames] = await Promise.all([
    fetchAll(sessionToken, 'Ticket_User'),
    getCachedUserNames(sessionToken),
  ])
  _techMap = {}
  _techUserIdMap = {}
  for (const tu of ticketUsers) {
    if (Number(tu.type) === 2 && !_techMap[tu.tickets_id]) {
      _techMap[tu.tickets_id] = userNames[tu.users_id] ?? `User ${tu.users_id}`
      _techUserIdMap[tu.tickets_id] = tu.users_id
    }
  }
  _techMapExp = Date.now() + STATIC_TTL
  return { techMap: _techMap, techUserIdMap: _techUserIdMap }
}

// Returns { userId → Set<groupName> } from Group_User membership records.
async function getCachedGroupMembership(sessionToken) {
  if (_groupMembership && Date.now() < _groupMembershipExp) return _groupMembership
  const [groups, groupUsers] = await Promise.all([
    fetchAll(sessionToken, 'Group'),
    fetchAll(sessionToken, 'Group_User'),
  ])
  const cleanName = (name) => name.replace(/^G_SEC_USR_TAUTURU_/i, '')
  const groupNames = Object.fromEntries(groups.map(g => [g.id, cleanName(g.name)]))
  _groupMembership = {}
  for (const gu of groupUsers) {
    const gName = groupNames[gu.groups_id]
    if (!gName) continue
    if (!_groupMembership[gu.users_id]) _groupMembership[gu.users_id] = new Set()
    _groupMembership[gu.users_id].add(gName)
  }
  _groupMembershipExp = Date.now() + STATIC_TTL
  return _groupMembership
}

async function getCachedEntityNames(sessionToken) {
  if (_entityNames && Date.now() < _entityNamesExp) return _entityNames
  _entityNames = await fetchAll(sessionToken, 'Entity').then((list) =>
    Object.fromEntries(list.map((e) => [e.id, e.name]))
  )
  _entityNamesExp = Date.now() + STATIC_TTL
  return _entityNames
}

export async function fetchSatisfaction() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const sessionToken = await getSession()

      const [satisfactions, ticketUsers, groupMap, userNames, { techMap, techUserIdMap }, groupMembership] = await Promise.all([
        fetchAll(sessionToken, 'TicketSatisfaction'),
        fetchAll(sessionToken, 'Ticket_User'),
        getCachedGroupMap(sessionToken),
        getCachedUserNames(sessionToken),
        getCachedTechData(sessionToken),
        getCachedGroupMembership(sessionToken),
      ])

      // Build requester map (type 1) from the fresh Ticket_User fetch
      const requesterMap = {}
      for (const tu of ticketUsers) {
        if (Number(tu.type) === 1 && !requesterMap[tu.tickets_id]) {
          requesterMap[tu.tickets_id] = userNames[tu.users_id] ?? `User ${tu.users_id}`
        }
      }

      return satisfactions
        .filter(s => s.date_answered && Number(s.satisfaction) > 0)
        .map(s => {
          const group = groupMap[s.tickets_id] ?? 'Unassigned'
          const uid   = techUserIdMap[s.tickets_id]
          const technician = uid != null && groupMembership[uid]?.has(group)
            ? (techMap[s.tickets_id] ?? '—')
            : '—'
          return {
            ticketId:  s.tickets_id,
            score:     Number(s.satisfaction),
            comment:   (s.comment ?? '').trim(),
            date:      s.date_answered,
            group,
            technician,
            requester: requesterMap[s.tickets_id] ?? '—',
          }
        })
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    } catch (err) {
      if (attempt === 0 && (err.message?.includes('401') || err.message?.includes('403'))) {
        invalidateSession()
        _groupMap        = null
        _userNames       = null
        _techMap         = null
        _techUserIdMap   = null
        _groupMembership = null
        continue
      }
      throw err
    }
  }
}

export async function fetchMetrics() {
  // Retry once if the cached session has expired server-side (401/403)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const sessionToken = await getSession()

      const [tickets, groupMap, entityNames, slaMap, { techMap, techUserIdMap }, groupMembership] = await Promise.all([
        fetchAllTickets(sessionToken),
        getCachedGroupMap(sessionToken),
        getCachedEntityNames(sessionToken),
        getCachedSlaMap(sessionToken),
        getCachedTechData(sessionToken),
        getCachedGroupMembership(sessionToken),
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

          if (!ticket.takeintoaccountdate) {
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

        const rawActualTTOMs = ticket.takeintoaccountdate && date
          ? new Date(ticket.takeintoaccountdate) - new Date(date)
          : null
        const rawSlaTTOMs = ticket.time_to_own && date
          ? new Date(ticket.time_to_own) - new Date(date)
          : null
        const rawSlaTTRMs = ticket.time_to_resolve && date
          ? new Date(ticket.time_to_resolve) - new Date(date)
          : null

        const ttrSlaId = Number(ticket.slas_id_ttr)
        const ttrSla   = ttrSlaId > 0 ? slaMap[ttrSlaId] : undefined
        const ttoSlaId = Number(ticket.slas_id_tto)
        const ttoSla   = ttoSlaId > 0 ? slaMap[ttoSlaId] : undefined

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
          hasNoTTO: !ticket.takeintoaccountdate,
          resolveMs:    rawResolveMs    > 0 ? rawResolveMs    : null,
          actualTTOMs:   rawActualTTOMs  > 0 ? rawActualTTOMs  : null,
          slaTTOMs:      rawSlaTTOMs     > 0 ? rawSlaTTOMs     : null,
          slaTTRMs:      rawSlaTTRMs     > 0 ? rawSlaTTRMs     : null,
          slaTTRName:    ttrSla?.name    ?? null,
          slaTTRTargetH: ttrSla?.targetH ?? null,
          ttoSlaName:    ttoSla?.name    ?? null,
          ttoSlaTargetH: ttoSla?.targetH ?? null,
          techName: (() => {
            const uid = techUserIdMap[id]
            return uid != null && groupMembership[uid]?.has(group) ? techMap[id] : null
          })(),
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
        _groupMap        = null
        _entityNames     = null
        _slaMap          = null
        _techMap         = null
        _techUserIdMap   = null
        _groupMembership = null
        continue
      }
      throw err
    }
  }
}
