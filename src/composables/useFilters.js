// Global cross-filter state (module singleton — shared by every component that imports it).
import { reactive, ref, computed, watch } from 'vue'
import { STATUS, PRIORITY } from '../api/glpi.js'

const activeFilters = reactive({
  statuses:   [],
  priorities: [],
  groups:     [],
  entities:   [],
  compliance: null, // null | 'compliant' | 'nonCompliant'
  periods:    [],   // week/month label strings matching the current period granularity
  dateFrom:   null, // 'YYYY-MM-DD' | null — inclusive
  dateTo:     null, // 'YYYY-MM-DD' | null — inclusive
  searchField: 'name', // 'name' | 'category' | 'requester' | 'techName'
  searchQuery: '',     // free text, case-insensitive substring match against searchField
})

const SEARCH_FIELD_LABELS = {
  name:      'Titre',
  category:  'Catégorie',
  requester: 'Demandeur',
  techName:  'Technicien',
}

const period = ref('week') // 'week' | 'month'
const datePreset = ref(null) // null | 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'thisYear' | 'custom'

// Period labels no longer match after switching granularity — clear them
watch(period, () => { activeFilters.periods.length = 0 })

// ── Date range presets (GLPI-style quick filters) ─────────────────────────────
const PRESET_LABELS = {
  today:     "Aujourd'hui",
  yesterday: 'Hier',
  last7:     '7 derniers jours',
  last30:    '30 derniers jours',
  thisMonth: 'Ce mois-ci',
  thisYear:  'Cette année',
}

function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

function fmtDisplay(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const PRESETS = {
  today:     () => { const t = fmtDate(new Date()); return { from: t, to: t } },
  yesterday: () => { const y = fmtDate(daysAgo(1)); return { from: y, to: y } },
  last7:     () => ({ from: fmtDate(daysAgo(6)),  to: fmtDate(new Date()) }),
  last30:    () => ({ from: fmtDate(daysAgo(29)), to: fmtDate(new Date()) }),
  thisMonth: () => {
    const now = new Date()
    return { from: fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmtDate(now) }
  },
  thisYear: () => {
    const now = new Date()
    return { from: fmtDate(new Date(now.getFullYear(), 0, 1)), to: fmtDate(now) }
  },
}

function setDatePreset(preset) {
  const range = PRESETS[preset]?.()
  if (!range) return
  activeFilters.dateFrom = range.from
  activeFilters.dateTo = range.to
  datePreset.value = preset
}

function setCustomDateRange(from, to) {
  activeFilters.dateFrom = from || null
  activeFilters.dateTo = to || null
  datePreset.value = (activeFilters.dateFrom || activeFilters.dateTo) ? 'custom' : null
}

function clearDateFilter() {
  activeFilters.dateFrom = null
  activeFilters.dateTo = null
  datePreset.value = null
}

const hasActiveFilters = computed(() =>
  activeFilters.statuses.length > 0 ||
  activeFilters.priorities.length > 0 ||
  activeFilters.groups.length > 0 ||
  activeFilters.entities.length > 0 ||
  activeFilters.compliance !== null ||
  activeFilters.periods.length > 0 ||
  activeFilters.dateFrom !== null ||
  activeFilters.dateTo !== null ||
  activeFilters.searchQuery.trim() !== ''
)

// Toggle one value in a filter dimension. 'compliance' is scalar, the rest are arrays.
function toggleFilter(filterKey, value) {
  if (filterKey === 'compliance') {
    activeFilters.compliance = activeFilters.compliance === value ? null : value
    return
  }
  const arr = activeFilters[filterKey]
  if (!Array.isArray(arr)) return
  const idx = arr.indexOf(value)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(value)
}

// Toggle a stat-widget clause: all-or-nothing (like the legacy open/solved cards).
function toggleStatClause(clause) {
  if (!clause?.filterKey) return
  if (clause.scalar) {
    activeFilters.compliance = activeFilters.compliance === clause.value ? null : clause.value
    return
  }
  const arr = activeFilters[clause.filterKey]
  const allOn = arr.length === clause.values.length && clause.values.every(v => arr.includes(v))
  arr.length = 0
  if (!allOn) arr.push(...clause.values)
}

function clearFilter(key) {
  if (key === 'compliance') activeFilters.compliance = null
  else if (key === 'dateRange') clearDateFilter()
  else if (key === 'search') activeFilters.searchQuery = ''
  else if (Array.isArray(activeFilters[key])) activeFilters[key].length = 0
}

function clearFilters() {
  activeFilters.statuses.length   = 0
  activeFilters.priorities.length = 0
  activeFilters.groups.length     = 0
  activeFilters.entities.length   = 0
  activeFilters.periods.length    = 0
  activeFilters.compliance        = null
  activeFilters.searchQuery       = ''
  clearDateFilter()
}

// French description of every active filter — drives the chips bar and the PPT subtitle.
const filterSummaryParts = computed(() => {
  const parts = []
  if (activeFilters.statuses.length)   parts.push({ key: 'statuses',   text: `Statut : ${activeFilters.statuses.map(s => STATUS[s]).join(', ')}` })
  if (activeFilters.priorities.length) parts.push({ key: 'priorities', text: `Priorité : ${activeFilters.priorities.map(p => PRIORITY[p]).join(', ')}` })
  if (activeFilters.groups.length)     parts.push({ key: 'groups',     text: `Groupe : ${activeFilters.groups.join(', ')}` })
  if (activeFilters.entities.length)   parts.push({ key: 'entities',   text: `Entité : ${activeFilters.entities.join(', ')}` })
  if (activeFilters.periods.length)    parts.push({ key: 'periods',    text: `${period.value === 'week' ? 'Semaine' : 'Mois'} : ${activeFilters.periods.join(', ')}` })
  if (activeFilters.compliance)        parts.push({ key: 'compliance', text: activeFilters.compliance === 'compliant' ? 'Conformes seulement' : 'Non conformes seulement' })
  if (activeFilters.dateFrom || activeFilters.dateTo) {
    const label = PRESET_LABELS[datePreset.value]
      ?? `${fmtDisplay(activeFilters.dateFrom) ?? '…'} → ${fmtDisplay(activeFilters.dateTo) ?? '…'}`
    parts.push({ key: 'dateRange', text: `Dates : ${label}` })
  }
  if (activeFilters.searchQuery.trim()) {
    parts.push({ key: 'search', text: `${SEARCH_FIELD_LABELS[activeFilters.searchField]} contient : "${activeFilters.searchQuery.trim()}"` })
  }
  return parts
})

export function useFilters() {
  return {
    activeFilters,
    period,
    datePreset,
    hasActiveFilters,
    filterSummaryParts,
    toggleFilter,
    toggleStatClause,
    clearFilter,
    clearFilters,
    setDatePreset,
    setCustomDateRange,
    clearDateFilter,
    SEARCH_FIELD_LABELS,
  }
}
