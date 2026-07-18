// Pure aggregation engine: (widget config, ctx) → normalized render payload.
// ctx = { tickets, satisfaction, activeFilters, period }
//   tickets      — processedTickets from fetchMetrics()
//   satisfaction — records from fetchSatisfaction() (may be empty/[])
//   activeFilters — { statuses, priorities, groups, entities, compliance, periods }
//   period       — 'week' | 'month' (global toggle)
import {
  METRICS, DIMENSIONS, CATEGORICAL_PALETTE, WIDGET_FILTER_DEFS,
} from './registry.js'
import { toISOWeek } from '../api/glpi.js'

// Resolve the 'period' pseudo-dimension to week/month
export function resolveDimKey(dimKey, period) {
  const dim = DIMENSIONS[dimKey]
  return dim?.resolvesTo ? dim.resolvesTo(period) : dimKey
}

// Period bucket of a row at the global toggle's granularity (for the global periods filter)
function periodLabelOf(row, source, period) {
  if (source === 'tickets') return period === 'week' ? row.week : row.month
  if (!row.date) return null
  return period === 'week' ? toISOWeek(row.date) : row.date.substring(0, 7)
}

// Apply the global cross-filters. `skip` is a Set of activeFilters keys to ignore
// (a widget never filters itself by its own dimension; time widgets skip 'periods').
export function applyGlobalFilters(rows, activeFilters, { skip = new Set(), source = 'tickets', period = 'week' } = {}) {
  let ts = rows
  if (source === 'tickets') {
    if (!skip.has('statuses') && activeFilters.statuses.length)     ts = ts.filter(t => activeFilters.statuses.includes(t.status))
    if (!skip.has('priorities') && activeFilters.priorities.length) ts = ts.filter(t => activeFilters.priorities.includes(t.priority))
    if (!skip.has('groups') && activeFilters.groups.length)         ts = ts.filter(t => activeFilters.groups.includes(t.group))
    if (!skip.has('entities') && activeFilters.entities.length)     ts = ts.filter(t => activeFilters.entities.includes(t.entity))
    if (!skip.has('compliance')) {
      if (activeFilters.compliance === 'compliant')    ts = ts.filter(t => !t.breached)
      if (activeFilters.compliance === 'nonCompliant') ts = ts.filter(t => t.breached)
    }
  } else {
    // Satisfaction records only carry group + date — other global filters don't apply
    if (!skip.has('groups') && activeFilters.groups.length) ts = ts.filter(r => activeFilters.groups.includes(r.group))
  }
  if (!skip.has('periods') && activeFilters.periods.length) {
    ts = ts.filter(r => activeFilters.periods.includes(periodLabelOf(r, source, period)))
  }
  return ts
}

// Apply the widget's own pre-filters (widget.filters).
export function applyWidgetFilters(rows, filters, source = 'tickets') {
  if (!filters) return rows
  let ts = rows
  if (source === 'tickets') {
    if (filters.status?.length)   ts = ts.filter(t => filters.status.includes(t.status))
    if (filters.priority?.length) ts = ts.filter(t => filters.priority.includes(t.priority))
    if (filters.group?.length)    ts = ts.filter(t => filters.group.includes(t.group))
    if (filters.entity?.length)   ts = ts.filter(t => filters.entity.includes(t.entity))
    if (filters.category?.length) ts = ts.filter(t => filters.category.includes(t.category))
    if (filters.type?.length)     ts = ts.filter(t => filters.type.includes(t.type))
    if (filters.compliance === 'compliant')    ts = ts.filter(t => !t.breached)
    if (filters.compliance === 'nonCompliant') ts = ts.filter(t => t.breached)
    if (filters.hasNoTTO === true) ts = ts.filter(t => t.hasNoTTO)
    if (filters.searches?.length) {
      const clauses = filters.searches
        .map(c => ({ field: c?.field || 'name', query: c?.query?.trim().toLowerCase(), link: c?.link || 'AND' }))
        .filter(c => c.query)
      if (clauses.length) {
        // GLPI-style: each clause (after the first) chains onto the running result via
        // its own link (ET/OU/ET NON/OU NON), evaluated left-to-right, not a single global mode.
        const matches = (t, c) => (t[c.field] ?? '').toString().toLowerCase().includes(c.query)
        ts = ts.filter(t => {
          let acc = matches(t, clauses[0])
          for (let i = 1; i < clauses.length; i++) {
            const c = clauses[i]
            const m = matches(t, c)
            if (c.link === 'OR') acc = acc || m
            else if (c.link === 'ANDNOT') acc = acc && !m
            else if (c.link === 'ORNOT') acc = acc || !m
            else acc = acc && m
          }
          return acc
        })
      }
    }
  } else {
    if (filters.group?.length) ts = ts.filter(r => filters.group.includes(r.group))
  }
  if (filters.dateFrom || filters.dateTo) {
    ts = ts.filter(r => {
      if (!r.date) return false
      const day = r.date.slice(0, 10)
      if (filters.dateFrom && day < filters.dateFrom) return false
      if (filters.dateTo && day > filters.dateTo) return false
      return true
    })
  }
  return ts
}

// Rows a widget aggregates over, after global + widget filters.
export function rowsForWidget(widget, ctx) {
  const metric = METRICS[widget.metric]
  const source = metric?.source ?? 'tickets'
  const rows = source === 'tickets' ? (ctx.tickets ?? []) : (ctx.satisfaction ?? [])

  const skip = new Set()
  if (widget.kind === 'chart' && widget.dimension) {
    const dimKey = resolveDimKey(widget.dimension, ctx.period)
    const dim = DIMENSIONS[dimKey]
    if (dim?.filterKey) skip.add(dim.filterKey)
    // Time widgets keep every period visible and highlight instead of hiding
    if (dim?.isTime) skip.add('periods')
  }

  const globallyFiltered = applyGlobalFilters(rows, ctx.activeFilters, { skip, source, period: ctx.period })
  return applyWidgetFilters(globallyFiltered, widget.filters, source)
}

// SLA target hours per SLA name — explicit SLA target when known, otherwise the
// most optimistic observed calendar window (min deadline-minus-creation) as fallback.
const SLA_FIELDS = {
  slaTTR: { name: 'slaTTRName', target: 'slaTTRTargetH', ms: 'slaTTRMs' },
  slaTTO: { name: 'ttoSlaName', target: 'ttoSlaTargetH', ms: 'slaTTOMs' },
}

export function computeSlaTargets(rows, segKey) {
  const fields = SLA_FIELDS[segKey]
  if (!fields) return {}
  const groups = new Map() // name → { targetH, minMs }
  for (const t of rows) {
    const name = t[fields.name]
    if (name == null || t[fields.ms] == null) continue
    let g = groups.get(name)
    if (!g) { g = { targetH: null, minMs: Infinity }; groups.set(name, g) }
    if (g.targetH == null && t[fields.target] != null) g.targetH = t[fields.target]
    if (t[fields.ms] < g.minMs) g.minMs = t[fields.ms]
  }
  const out = {}
  for (const [name, g] of groups) {
    out[name] = g.targetH ?? (g.minMs !== Infinity ? +(g.minMs / 3600000).toFixed(1) : null)
  }
  return out
}

// group → tech tree of average resolution times (in days) — feeds TechTimeChart.
export function buildTechTree(rows) {
  const byTechGroup = {}
  for (const t of rows) {
    if (t.resolveMs == null || !t.techName) continue
    if (!byTechGroup[t.group]) byTechGroup[t.group] = {}
    const tg = byTechGroup[t.group]
    if (!tg[t.techName]) tg[t.techName] = { sum: 0, count: 0 }
    tg[t.techName].sum   += t.resolveMs
    tg[t.techName].count += 1
  }
  return Object.entries(byTechGroup)
    .map(([group, techs]) => {
      const techList = Object.entries(techs)
        .map(([name, v]) => ({ name, avgDays: +(v.sum / v.count / 86400000).toFixed(2), count: v.count }))
        .sort((a, b) => b.avgDays - a.avgDays)
      const groupSum   = Object.values(techs).reduce((s, v) => s + v.sum, 0)
      const groupCount = Object.values(techs).reduce((s, v) => s + v.count, 0)
      return { group, avgDays: +(groupSum / groupCount / 86400000).toFixed(2), count: groupCount, techs: techList }
    })
    .sort((a, b) => b.avgDays - a.avgDays)
}

function accessorFor(dim, source) {
  return source === 'tickets' ? dim.accessor : dim.satAccessor
}

// Bucket rows by dimension value → Map(value → rows), skipping null buckets.
function bucketBy(rows, accessor) {
  const buckets = new Map()
  for (const r of rows) {
    const v = accessor(r)
    if (v == null) continue
    let b = buckets.get(v)
    if (!b) { b = []; buckets.set(v, b) }
    b.push(r)
  }
  return buckets
}

function orderValues(buckets, dim, options = {}) {
  let vals = [...buckets.keys()]
  if (dim.fixedOrder) {
    vals = dim.fixedOrder.filter(v => buckets.has(v))
  } else if (dim.isTime) {
    vals.sort((a, b) => String(a).localeCompare(String(b)))
  } else {
    vals.sort((a, b) => buckets.get(b).length - buckets.get(a).length)
  }
  if (options.excludeValues?.length) vals = vals.filter(v => !options.excludeValues.includes(v))
  if (options.topN > 0 && !dim.isTime) vals = vals.slice(0, options.topN)
  return vals
}

// The single toggleable filter clause of a stat widget, or null when not clickable.
// Clickable ⇔ the widget has exactly one filter clause and it maps to a global filter.
export function statClause(widget) {
  const f = widget.filters ?? {}
  const clauses = []
  for (const [key, def] of Object.entries(WIDGET_FILTER_DEFS)) {
    if (Array.isArray(f[key]) && f[key].length) {
      clauses.push({ filterKey: DIMENSIONS[def.dimension]?.filterKey ?? null, scalar: false, values: f[key] })
    }
  }
  if (f.compliance) clauses.push({ filterKey: 'compliance', scalar: true, value: f.compliance })
  if (f.hasNoTTO === true) clauses.push({ filterKey: null })
  if (clauses.length !== 1 || !clauses[0].filterKey) return null
  return clauses[0]
}

function statClauseActive(clause, activeFilters) {
  if (!clause) return false
  if (clause.scalar) return activeFilters.compliance === clause.value
  const arr = activeFilters[clause.filterKey] ?? []
  return arr.length === clause.values.length && clause.values.every(v => arr.includes(v))
}

// Main entry: normalized payload for any widget.
export function computeWidgetData(widget, ctx) {
  const metric = METRICS[widget.metric]
  if (!metric) return { kind: 'empty' }
  const rows = rowsForWidget(widget, ctx)

  // ── Stat card ──────────────────────────────────────────────────────────────
  if (widget.kind === 'stat') {
    const clause = statClause(widget)
    return {
      kind: 'stat',
      value: metric.format(metric.compute(rows), widget.options?.unit),
      clickable: clause != null,
      active: statClauseActive(clause, ctx.activeFilters),
      clause,
    }
  }

  // ── Technician tree (special renderer, keeps the legacy feature) ──────────
  if (widget.chartType === 'techTree') {
    return { kind: 'techTree', groups: buildTechTree(rows), meta: { filterKey: null } }
  }

  // ── SLA compliance heatmap by group × week (special renderer) ─────────────
  if (widget.chartType === 'heatmap') {
    const groupWeeks = new Map() // group → { week → { compliant, nonCompliant } }
    for (const t of rows) {
      if (!t.group || !t.week) continue
      if (!groupWeeks.has(t.group)) groupWeeks.set(t.group, {})
      const weekMap = groupWeeks.get(t.group)
      if (!weekMap[t.week]) weekMap[t.week] = { compliant: 0, nonCompliant: 0 }
      weekMap[t.week][t.breached ? 'nonCompliant' : 'compliant']++
    }
    const groups = [...groupWeeks.entries()].map(([name, weekMap]) => ({ name, weekMap }))
    return { kind: 'heatmap', groups, meta: { filterKey: null } }
  }

  // ── Regular chart ──────────────────────────────────────────────────────────
  const dimKey = resolveDimKey(widget.dimension, ctx.period)
  const dim = DIMENSIONS[dimKey]
  const source = metric.source
  const accessor = dim ? accessorFor(dim, source) : null
  if (!dim || !accessor) return { kind: 'empty' }

  const buckets = bucketBy(rows, accessor)
  const values = orderValues(buckets, dim, widget.options)
  const labels = values.map(v => dim.valueLabel ? dim.valueLabel(v) : String(v))

  // Own-dimension global filter → dim the non-selected items instead of hiding them
  let dimmedValues = null
  const af = ctx.activeFilters
  if (dim.filterKey && !dim.isTime) {
    if (dim.scalarFilter) {
      if (af.compliance) dimmedValues = values.filter(v => v !== af.compliance)
    } else if (af[dim.filterKey]?.length) {
      dimmedValues = values.filter(v => !af[dim.filterKey].includes(v))
    }
  }

  // Time widgets: highlight the globally selected periods (only meaningful when the
  // widget's granularity matches the global toggle — otherwise labels can't match)
  let highlighted = null
  if (dim.isTime && af.periods.length && dimKey === resolveDimKey('period', ctx.period)) {
    highlighted = [...af.periods]
  }

  const meta = {
    dimensionKey: dimKey,
    filterKey: dim.filterKey,
    scalarFilter: dim.scalarFilter === true,
    isTime: dim.isTime === true,
    highlighted,
    dimmedValues,
    percent: widget.options?.percent === true,
    isDuration: metric.isDuration === true,
    unit: metric.isDuration ? (widget.options?.unit === 'days' ? 'j' : 'h') : null,
  }

  // ── Segmented (stacked / multi-series) ─────────────────────────────────────
  if (widget.segmentBy && DIMENSIONS[widget.segmentBy]) {
    const segDim = DIMENSIONS[widget.segmentBy]
    const segAccessor = accessorFor(segDim, source)
    const segBuckets = bucketBy(rows, segAccessor)
    const segValues = orderValues(segBuckets, segDim)
    const targets = (metric.isDuration && widget.options?.showTargets !== false)
      ? computeSlaTargets(rows, widget.segmentBy)
      : {}

    const series = segValues.map((sv, i) => {
      const segLabel = segDim.valueLabel ? segDim.valueLabel(sv) : String(sv)
      return {
        name: segLabel,
        color: segDim.colors?.[sv] ?? CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
        targetH: targets[sv] ?? null,
        data: values.map(v => {
          const subset = buckets.get(v).filter(r => segAccessor(r) === sv)
          return subset.length ? metric.compute(subset) : (widget.metric === 'count' ? 0 : null)
        }),
      }
    })
    return { kind: 'chart', chartType: widget.chartType, labels, values, itemColors: null, series, meta }
  }

  // ── Single series ──────────────────────────────────────────────────────────
  const itemColors = values.map((v, i) =>
    widget.options?.color
      ?? dim.colors?.[v]
      ?? CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]
  )
  const series = [{
    name: metric.label,
    color: widget.options?.color ?? null,
    targetH: null,
    data: values.map(v => metric.compute(buckets.get(v))),
  }]
  return { kind: 'chart', chartType: widget.chartType, labels, values, itemColors, series, meta }
}
