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
})

const period = ref('week') // 'week' | 'month'

// Period labels no longer match after switching granularity — clear them
watch(period, () => { activeFilters.periods.length = 0 })

const hasActiveFilters = computed(() =>
  activeFilters.statuses.length > 0 ||
  activeFilters.priorities.length > 0 ||
  activeFilters.groups.length > 0 ||
  activeFilters.entities.length > 0 ||
  activeFilters.compliance !== null ||
  activeFilters.periods.length > 0
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
  else if (Array.isArray(activeFilters[key])) activeFilters[key].length = 0
}

function clearFilters() {
  activeFilters.statuses.length   = 0
  activeFilters.priorities.length = 0
  activeFilters.groups.length     = 0
  activeFilters.entities.length   = 0
  activeFilters.periods.length    = 0
  activeFilters.compliance        = null
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
  return parts
})

export function useFilters() {
  return {
    activeFilters,
    period,
    hasActiveFilters,
    filterSummaryParts,
    toggleFilter,
    toggleStatClause,
    clearFilter,
    clearFilters,
  }
}
