// Declarative registries for the widget-builder dashboard.
// A widget = { metric, dimension, segmentBy, chartType, filters, options } —
// everything the aggregation engine (lib/aggregate.js) needs is described here.
import { STATUS, PRIORITY, TYPE, toISOWeek } from '../api/glpi.js'

export const STATUS_COLORS = {
  1: '#3b82f6',
  2: '#f59e0b',
  3: '#8b5cf6',
  4: '#6b7280',
  5: '#10b981',
  6: '#374151',
}

export const PRIORITY_COLORS = {
  1: '#6ee7b7',
  2: '#34d399',
  3: '#f59e0b',
  4: '#f97316',
  5: '#ef4444',
  6: '#7f1d1d',
}

export const COMPLIANCE_COLORS = {
  compliant:    'rgba(16,185,129,0.8)',
  nonCompliant: 'rgba(239,68,68,0.8)',
}

// Fallback palette for dimensions without a dedicated color map
export const CATEGORICAL_PALETTE = [
  '#38bdf8', '#a78bfa', '#34d399', '#fb923c',
  '#f87171', '#fbbf24', '#e879f9', '#4ade80',
  '#60a5fa', '#f472b6',
]

function avgHours(rows, field) {
  let sum = 0, count = 0
  for (const r of rows) {
    if (r[field] != null) { sum += r[field]; count++ }
  }
  return count > 0 ? +(sum / count / 3600000).toFixed(1) : null
}

const fmtDuration = (v, unit) =>
  v == null ? '—' : unit === 'days' ? `${+(v / 24).toFixed(1)}j` : `${Math.round(v)}h`

// Metrics: how to reduce a set of rows to one number.
// source 'tickets' rows = processedTickets items; 'satisfaction' rows = fetchSatisfaction() records.
// Duration metrics return HOURS (renderers/formatters convert to days on demand).
export const METRICS = {
  count: {
    label: 'Nombre de tickets',
    source: 'tickets',
    compute: rows => rows.length,
    format: v => String(v ?? 0),
  },
  slaCompliance: {
    label: 'Conformité SLA (%)',
    source: 'tickets',
    compute: rows => rows.length ? Math.round(rows.filter(r => !r.breached).length / rows.length * 100) : null,
    format: v => v == null ? '—' : `${v}%`,
  },
  mttr: {
    label: 'Temps de résolution moy. (MTTR)',
    source: 'tickets',
    isDuration: true,
    compute: rows => avgHours(rows, 'resolveMs'),
    format: fmtDuration,
  },
  tto: {
    label: 'Temps de prise en compte moy. (TTO)',
    source: 'tickets',
    isDuration: true,
    compute: rows => avgHours(rows, 'actualTTOMs'),
    format: fmtDuration,
  },
  noTTOCount: {
    label: 'Tickets non pris en compte',
    source: 'tickets',
    compute: rows => rows.filter(r => r.hasNoTTO).length,
    format: v => String(v ?? 0),
  },
  avgSatisfaction: {
    label: 'Satisfaction moyenne',
    source: 'satisfaction',
    compute: rows => rows.length ? +(rows.reduce((s, r) => s + r.score, 0) / rows.length).toFixed(2) : null,
    format: v => v == null ? '—' : `${v}/5`,
  },
  satisfactionCount: {
    label: 'Nombre d’enquêtes',
    source: 'satisfaction',
    compute: rows => rows.length,
    format: v => String(v ?? 0),
  },
}

// Dimensions: how to bucket rows.
// accessor      — value for a ticket row
// satAccessor   — value for a satisfaction row (absent ⇒ unavailable for satisfaction metrics)
// filterKey     — matching key in the global activeFilters (null ⇒ clicks don't cross-filter)
// scalarFilter  — global filter holds a single value, not an array (compliance)
// fixedOrder    — canonical value order (otherwise: time dims sort by label, rest by count desc)
export const DIMENSIONS = {
  status: {
    label: 'Statut',
    accessor: t => t.status,
    valueLabel: v => STATUS[v] ?? `Statut ${v}`,
    colors: STATUS_COLORS,
    fixedOrder: [1, 2, 3, 4, 5, 6],
    filterKey: 'statuses',
  },
  priority: {
    label: 'Priorité',
    accessor: t => t.priority,
    valueLabel: v => PRIORITY[v] ?? `Priorité ${v}`,
    colors: PRIORITY_COLORS,
    fixedOrder: [1, 2, 3, 4, 5, 6],
    filterKey: 'priorities',
  },
  type: {
    label: 'Type',
    accessor: t => t.type,
    valueLabel: v => TYPE[v] ?? `Type ${v}`,
    fixedOrder: [1, 2],
    filterKey: null,
  },
  group: {
    label: 'Groupe',
    accessor: t => t.group,
    satAccessor: r => r.group,
    filterKey: 'groups',
  },
  entity: {
    label: 'Entité',
    accessor: t => t.entity,
    filterKey: 'entities',
  },
  category: {
    label: 'Catégorie',
    accessor: t => t.category,
    filterKey: null,
  },
  technician: {
    label: 'Technicien',
    accessor: t => t.techName,
    satAccessor: r => r.technician === '—' ? null : r.technician,
    skipNull: true,
    filterKey: null,
  },
  requester: {
    label: 'Demandeur',
    accessor: t => t.requester,
    satAccessor: r => r.requester === '—' ? null : r.requester,
    skipNull: true,
    filterKey: null,
  },
  compliance: {
    label: 'Conformité SLA',
    accessor: t => t.breached ? 'nonCompliant' : 'compliant',
    valueLabel: v => v === 'compliant' ? 'Conforme' : 'Non conforme',
    colors: COMPLIANCE_COLORS,
    fixedOrder: ['compliant', 'nonCompliant'],
    filterKey: 'compliance',
    scalarFilter: true,
  },
  slaTTR: {
    label: 'Type SLA (résolution)',
    accessor: t => t.slaTTRName ?? 'No SLA',
    filterKey: null,
  },
  slaTTO: {
    label: 'Type SLA (prise en compte)',
    accessor: t => t.ttoSlaName ?? 'No SLA',
    filterKey: null,
  },
  week: {
    label: 'Semaine',
    accessor: t => t.week,
    satAccessor: r => r.date ? toISOWeek(r.date) : null,
    isTime: true,
    filterKey: 'periods',
  },
  month: {
    label: 'Mois',
    accessor: t => t.month,
    satAccessor: r => r.date ? r.date.substring(0, 7) : null,
    isTime: true,
    filterKey: 'periods',
  },
  // Pseudo-dimension: follows the global Hebdomadaire/Mensuel toggle
  period: {
    label: 'Période (suit Hebdo/Mensuel)',
    isTime: true,
    resolvesTo: p => (p === 'week' ? 'week' : 'month'),
    filterKey: 'periods',
  },
}

// Field getters for user-defined custom groups (keys match WidgetEditor.vue's
// SEARCH_FIELD_OPTIONS). Satisfaction records only carry requester/technician,
// so name/category rules simply never match satisfaction-sourced widgets.
const CUSTOM_GROUP_FIELD_ACCESSORS = {
  name:      { ticket: t => t.name,      sat: null },
  category:  { ticket: t => t.category,  sat: null },
  requester: { ticket: t => t.requester, sat: r => r.requester },
  techName:  { ticket: t => t.techName,  sat: r => r.technician },
}

// Builds a DIMENSIONS-shaped object from a widget's user-defined match rules
// (each { label, field, query }). A row falls into the first rule whose field
// contains query (case-insensitive); unmatched rows go to 'Autre'.
export function buildCustomDimension(rules = []) {
  const validRules = (rules ?? []).filter(r => r.label?.trim() && r.query?.trim())
  const OTHER = 'Autre'

  function matchRow(row, source) {
    if (!validRules.length) return null
    for (const rule of validRules) {
      const fa = CUSTOM_GROUP_FIELD_ACCESSORS[rule.field]
      const getter = source === 'tickets' ? fa?.ticket : fa?.sat
      if (!getter) continue
      const value = getter(row)
      if (value != null && String(value).toLowerCase().includes(rule.query.trim().toLowerCase())) {
        return rule.label.trim()
      }
    }
    return OTHER
  }

  return {
    label: 'Personnalisé',
    accessor: t => matchRow(t, 'tickets'),
    satAccessor: r => matchRow(r, 'satisfaction'),
    valueLabel: v => v,
    fixedOrder: validRules.length ? [...new Set(validRules.map(r => r.label.trim()))].concat(OTHER) : undefined,
    filterKey: null,
  }
}

export const CHART_TYPES = {
  bar:        'Barres',
  hbar:       'Barres horizontales',
  line:       'Courbe',
  pie:        'Camembert',
  donut:      'Anneau',
  stackedBar: 'Barres empilées',
  table:      'Tableau',
  techTree:   'Arbre par technicien',
  heatmap:    'Carte de chaleur (groupe × semaine)',
}

// Maps widget-filter keys → { global activeFilters key, ticket field }
export const WIDGET_FILTER_DEFS = {
  status:   { label: 'Statut',   dimension: 'status' },
  priority: { label: 'Priorité', dimension: 'priority' },
  group:    { label: 'Groupe',   dimension: 'group' },
  entity:   { label: 'Entité',   dimension: 'entity' },
  category: { label: 'Catégorie', dimension: 'category' },
  type:     { label: 'Type',     dimension: 'type' },
}

// Titles may contain {période} → 'semaine'/'mois' and {hebdo} → 'hebdo.'/'mensuel'.
export function resolveTitle(title, period) {
  return title
    .replaceAll('{période}', period === 'week' ? 'semaine' : 'mois')
    .replaceAll('{hebdo}', period === 'week' ? 'hebdo.' : 'mensuel')
}

// Auto title for widgets without an explicit one.
export function autoTitle(widget, period = 'week') {
  const metric = METRICS[widget.metric]
  if (!metric) return 'Widget'
  if (widget.kind === 'stat' || !widget.dimension) return metric.label
  let dimLabel
  if (widget.dimension === 'custom') {
    dimLabel = 'personnalisé'
  } else {
    const dimKey = widget.dimension === 'period'
      ? DIMENSIONS.period.resolvesTo(period)
      : widget.dimension
    const dim = DIMENSIONS[dimKey]
    dimLabel = dim?.label?.toLowerCase() ?? dimKey
  }
  let title = `${metric.label} par ${dimLabel}`
  if (widget.segmentBy === 'custom') {
    title += ' — Personnalisé'
  } else if (widget.segmentBy && DIMENSIONS[widget.segmentBy]) {
    title += ` — ${DIMENSIONS[widget.segmentBy].label}`
  }
  return title
}

export function displayTitle(widget, period = 'week') {
  return widget.title ? resolveTitle(widget.title, period) : autoTitle(widget, period)
}

let _uid = 0
export function newWidgetId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? `w-${crypto.randomUUID()}`
    : `w-${Date.now()}-${_uid++}`
}

export function emptyWidget(kind = 'chart') {
  return {
    id: newWidgetId(),
    kind,
    title: null,
    metric: 'count',
    dimension: kind === 'chart' ? 'status' : null,
    segmentBy: null,
    chartType: 'bar',
    filters: {},
    span: kind === 'chart' ? { col: 6, row: 4 } : { col: 2, row: 2 },
    options: {},
  }
}

// Default widget set — reproduces the pre-builder dashboard exactly.
// Seed ids are stable ('seed-…') so the one-time legacy localStorage migration
// (glpi-chart-order / glpi-card-order / glpi-chart-spans) can map onto them.
export const DEFAULT_WIDGETS = [
  // Stat cards (legacy card ids → seed-card-<id>)
  { id: 'seed-card-open',         kind: 'stat', title: 'Tickets ouverts',    metric: 'count',         dimension: null, segmentBy: null, chartType: 'bar', filters: { status: [1, 2, 3, 4] }, span: { col: 2, row: 2 }, options: {} },
  { id: 'seed-card-total',        kind: 'stat', title: 'Total tickets',      metric: 'count',         dimension: null, segmentBy: null, chartType: 'bar', filters: {},                        span: { col: 2, row: 2 }, options: {} },
  { id: 'seed-card-solved',       kind: 'stat', title: 'Clôturés / Résolus', metric: 'count',         dimension: null, segmentBy: null, chartType: 'bar', filters: { status: [5, 6] },        span: { col: 2, row: 2 }, options: {} },
  { id: 'seed-card-compliance',   kind: 'stat', title: 'Conformité SLA',     metric: 'slaCompliance', dimension: null, segmentBy: null, chartType: 'bar', filters: {},                        span: { col: 2, row: 2 }, options: {} },
  { id: 'seed-card-compliant',    kind: 'stat', title: 'Conformes',          metric: 'count',         dimension: null, segmentBy: null, chartType: 'bar', filters: { compliance: 'compliant' },    span: { col: 2, row: 2 }, options: {} },
  { id: 'seed-card-nonCompliant', kind: 'stat', title: 'Non conformes',      metric: 'count',         dimension: null, segmentBy: null, chartType: 'bar', filters: { compliance: 'nonCompliant' }, span: { col: 2, row: 2 }, options: {} },
  { id: 'seed-card-avgResolve',   kind: 'stat', title: 'Rés. moyenne',       metric: 'mttr',          dimension: null, segmentBy: null, chartType: 'bar', filters: {},                        span: { col: 2, row: 2 }, options: { unit: 'hours' } },

  // Charts (legacy chart ids → seed-<id>)
  { id: 'seed-status',     kind: 'chart', title: 'Par statut',   metric: 'count', dimension: 'status',   segmentBy: null, chartType: 'bar', filters: {}, span: { col: 6, row: 4 }, options: {} },
  { id: 'seed-priority',   kind: 'chart', title: 'Par priorité', metric: 'count', dimension: 'priority', segmentBy: null, chartType: 'bar', filters: {}, span: { col: 6, row: 4 }, options: {} },
  { id: 'seed-line',       kind: 'chart', title: 'Tickets ouverts par {période}', metric: 'count', dimension: 'period', segmentBy: null, chartType: 'line', filters: {}, span: { col: 6, row: 4 }, options: {} },
  { id: 'seed-compliance', kind: 'chart', title: 'Conformité SLA par {période}', metric: 'count', dimension: 'period', segmentBy: 'compliance', chartType: 'stackedBar', filters: {}, span: { col: 6, row: 4 }, options: {} },
  { id: 'seed-noTTO',      kind: 'chart', title: 'Tickets non pris en compte', metric: 'noTTOCount', dimension: 'period', segmentBy: null, chartType: 'bar', filters: {}, span: { col: 6, row: 4 }, options: { color: 'rgba(245,158,11,0.8)' } },
  { id: 'seed-tto',        kind: 'chart', title: 'TTO moy. par type SLA — {hebdo}', metric: 'tto', dimension: 'period', segmentBy: 'slaTTO', chartType: 'line', filters: {}, span: { col: 6, row: 5 }, options: {} },
  { id: 'seed-mttr',       kind: 'chart', title: 'MTTR par type SLA — {hebdo}', metric: 'mttr', dimension: 'period', segmentBy: 'slaTTR', chartType: 'line', filters: {}, span: { col: 6, row: 5 }, options: {} },
  { id: 'seed-group',      kind: 'chart', title: 'Conformité SLA par groupe', metric: 'count', dimension: 'group', segmentBy: 'compliance', chartType: 'hbar', filters: {}, span: { col: 6, row: 5 }, options: { percent: true } },
  { id: 'seed-groupHeatmap', kind: 'chart', title: 'Conformité SLA par groupe et semaine', metric: 'count', dimension: 'group', segmentBy: null, chartType: 'heatmap', filters: {}, span: { col: 12, row: 6 }, options: {} },
  { id: 'seed-entities',   kind: 'chart', title: 'Top 10 entités', metric: 'count', dimension: 'entity', segmentBy: null, chartType: 'pie', filters: {}, span: { col: 6, row: 5 }, options: { topN: 10 } },
  { id: 'seed-techTime',   kind: 'chart', title: 'Temps de traitement moy. par technicien', metric: 'mttr', dimension: 'group', segmentBy: null, chartType: 'techTree', filters: {}, span: { col: 6, row: 5 }, options: {} },
]

// legacy id ↔ seed id mapping used by the one-time migration
export const LEGACY_CHART_IDS = ['status', 'priority', 'line', 'compliance', 'noTTO', 'tto', 'mttr', 'group', 'entities', 'techTime']
export const LEGACY_CARD_IDS  = ['open', 'total', 'solved', 'compliance', 'compliant', 'nonCompliant', 'avgResolve']
export const legacyChartSeedId = id => `seed-${id}`
export const legacyCardSeedId  = id => `seed-card-${id}`
