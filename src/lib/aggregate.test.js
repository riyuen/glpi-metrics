import { describe, it, expect } from 'vitest'
import {
  applyGlobalFilters, applyWidgetFilters, computeSlaTargets, buildTechTree, computeWidgetData,
} from './aggregate.js'
import { toISOWeek } from '../api/glpi.js'

const emptyActiveFilters = () => ({
  statuses: [], priorities: [], groups: [], entities: [], compliance: null, periods: [],
})

function mkTicket(overrides = {}) {
  return {
    status: 1,
    priority: 3,
    type: 1,
    group: 'N1',
    entity: 'Siege',
    category: 'Reseau',
    breached: false,
    week: '2026-W01',
    month: '2026-01',
    date: '2026-01-05 10:00:00',
    resolveMs: null,
    actualTTOMs: null,
    hasNoTTO: false,
    techName: null,
    requester: null,
    name: '',
    slaTTRName: null,
    slaTTRTargetH: null,
    slaTTRMs: null,
    ttoSlaName: null,
    ttoSlaTargetH: null,
    slaTTOMs: null,
    ...overrides,
  }
}

function mkSatRow(overrides = {}) {
  return {
    score: 5,
    group: 'N1',
    date: '2026-01-05 10:00:00',
    requester: null,
    technician: null,
    ticketId: 1,
    ...overrides,
  }
}

describe('applyGlobalFilters', () => {
  const t1 = mkTicket({ status: 1, priority: 3, group: 'N1', entity: 'Siege', breached: false, week: '2026-W01', month: '2026-01' })
  const t2 = mkTicket({ status: 2, priority: 4, group: 'N1', entity: 'Siege', breached: true, week: '2026-W01', month: '2026-01' })
  const t3 = mkTicket({ status: 1, priority: 3, group: 'N2', entity: 'Antenne', breached: false, week: '2026-W02', month: '2026-01' })
  const t4 = mkTicket({ status: 5, priority: 5, group: 'N2', entity: 'Antenne', breached: true, week: '2026-W02', month: '2026-02' })
  const tickets = [t1, t2, t3, t4]

  it('returns all rows when every filter is empty', () => {
    expect(applyGlobalFilters(tickets, emptyActiveFilters(), { source: 'tickets', period: 'week' })).toEqual(tickets)
  })

  it('filters by statuses', () => {
    const af = { ...emptyActiveFilters(), statuses: [1] }
    expect(applyGlobalFilters(tickets, af, { source: 'tickets' })).toEqual([t1, t3])
  })

  it('filters by priorities', () => {
    const af = { ...emptyActiveFilters(), priorities: [4, 5] }
    expect(applyGlobalFilters(tickets, af, { source: 'tickets' })).toEqual([t2, t4])
  })

  it('filters by groups', () => {
    const af = { ...emptyActiveFilters(), groups: ['N2'] }
    expect(applyGlobalFilters(tickets, af, { source: 'tickets' })).toEqual([t3, t4])
  })

  it('filters by entities', () => {
    const af = { ...emptyActiveFilters(), entities: ['Siege'] }
    expect(applyGlobalFilters(tickets, af, { source: 'tickets' })).toEqual([t1, t2])
  })

  it('filters by compliance', () => {
    const compliant = { ...emptyActiveFilters(), compliance: 'compliant' }
    expect(applyGlobalFilters(tickets, compliant, { source: 'tickets' })).toEqual([t1, t3])
    const nonCompliant = { ...emptyActiveFilters(), compliance: 'nonCompliant' }
    expect(applyGlobalFilters(tickets, nonCompliant, { source: 'tickets' })).toEqual([t2, t4])
  })

  it('suppresses a filter key that is in the skip set', () => {
    const af = { ...emptyActiveFilters(), statuses: [1] }
    expect(applyGlobalFilters(tickets, af, { source: 'tickets', skip: new Set(['statuses']) })).toEqual(tickets)
  })

  it('filters by periods at week granularity (tickets use row.week)', () => {
    const af = { ...emptyActiveFilters(), periods: ['2026-W01'] }
    expect(applyGlobalFilters(tickets, af, { source: 'tickets', period: 'week' })).toEqual([t1, t2])
  })

  it('filters by periods at month granularity (tickets use row.month)', () => {
    const af = { ...emptyActiveFilters(), periods: ['2026-01'] }
    expect(applyGlobalFilters(tickets, af, { source: 'tickets', period: 'month' })).toEqual([t1, t2, t3])
  })

  it('satisfaction source only applies groups (ignores statuses/priorities/entities/compliance)', () => {
    const r1 = mkSatRow({ group: 'N1' })
    const r2 = mkSatRow({ group: 'N2' })
    const af = { ...emptyActiveFilters(), statuses: [1], groups: ['N1'] }
    expect(applyGlobalFilters([r1, r2], af, { source: 'satisfaction' })).toEqual([r1])
  })

  it('filters satisfaction rows by periods using toISOWeek/month of row.date', () => {
    const r1 = mkSatRow({ group: 'N1', date: '2026-01-05 10:00:00' })
    const r2 = mkSatRow({ group: 'N1', date: '2026-01-12 10:00:00' })
    const r3 = mkSatRow({ group: 'N1', date: null })
    const weekOfR1 = toISOWeek(r1.date)
    const af = { ...emptyActiveFilters(), periods: [weekOfR1] }
    expect(applyGlobalFilters([r1, r2, r3], af, { source: 'satisfaction', period: 'week' })).toEqual([r1])

    const monthAf = { ...emptyActiveFilters(), periods: ['2026-01'] }
    expect(applyGlobalFilters([r1, r2, r3], monthAf, { source: 'satisfaction', period: 'month' })).toEqual([r1, r2])
  })
})

describe('applyWidgetFilters', () => {
  const t1 = mkTicket({ status: 1, priority: 3, group: 'N1', entity: 'Siege', category: 'Reseau', type: 1, breached: false, hasNoTTO: false, date: '2026-01-15 10:00:00' })
  const t2 = mkTicket({ status: 2, priority: 4, group: 'N2', entity: 'Antenne', category: 'Materiel', type: 2, breached: true, hasNoTTO: true, date: '2026-01-05 10:00:00' })

  it('passes through when filters is undefined', () => {
    expect(applyWidgetFilters([t1, t2], undefined, 'tickets')).toEqual([t1, t2])
  })

  it('passes through when filters is an empty object', () => {
    expect(applyWidgetFilters([t1, t2], {}, 'tickets')).toEqual([t1, t2])
  })

  it('filters by each single-field key', () => {
    expect(applyWidgetFilters([t1, t2], { status: [1] }, 'tickets')).toEqual([t1])
    expect(applyWidgetFilters([t1, t2], { priority: [4] }, 'tickets')).toEqual([t2])
    expect(applyWidgetFilters([t1, t2], { group: ['N1'] }, 'tickets')).toEqual([t1])
    expect(applyWidgetFilters([t1, t2], { entity: ['Antenne'] }, 'tickets')).toEqual([t2])
    expect(applyWidgetFilters([t1, t2], { category: ['Reseau'] }, 'tickets')).toEqual([t1])
    expect(applyWidgetFilters([t1, t2], { type: [2] }, 'tickets')).toEqual([t2])
  })

  it('filters by compliance', () => {
    expect(applyWidgetFilters([t1, t2], { compliance: 'compliant' }, 'tickets')).toEqual([t1])
    expect(applyWidgetFilters([t1, t2], { compliance: 'nonCompliant' }, 'tickets')).toEqual([t2])
  })

  it('filters by hasNoTTO', () => {
    expect(applyWidgetFilters([t1, t2], { hasNoTTO: true }, 'tickets')).toEqual([t2])
  })

  it('filters by dateFrom/dateTo range, excluding rows with no date', () => {
    const noDate = mkTicket({ date: null })
    const rows = [t1, t2, noDate]
    expect(applyWidgetFilters(rows, { dateFrom: '2026-01-10' }, 'tickets')).toEqual([t1])
    expect(applyWidgetFilters(rows, { dateTo: '2026-01-10' }, 'tickets')).toEqual([t2])
    expect(applyWidgetFilters(rows, { dateFrom: '2026-01-01', dateTo: '2026-01-31' }, 'tickets')).toEqual([t1, t2])
  })

  describe('search clause chaining', () => {
    const r1 = mkTicket({ name: 'réseau lent bureau a', category: 'reseau' })
    const r2 = mkTicket({ name: 'ecran cassé bureau b', category: 'materiel' })
    const r3 = mkTicket({ name: 'réseau lent bureau b', category: 'reseau' })
    const r4 = mkTicket({ name: 'imprimante bureau a', category: 'materiel' })
    const rows = [r1, r2, r3, r4]

    it('matches a single clause case-insensitively', () => {
      const res = applyWidgetFilters(rows, { searches: [{ field: 'name', query: 'RÉSEAU' }] }, 'tickets')
      expect(res).toEqual([r1, r3])
    })

    it('defaults clause field to name when omitted', () => {
      const res = applyWidgetFilters(rows, { searches: [{ query: 'réseau' }] }, 'tickets')
      expect(res).toEqual([r1, r3])
    })

    it('chains a second clause with the default AND link', () => {
      const res = applyWidgetFilters(rows, {
        searches: [{ field: 'name', query: 'réseau' }, { field: 'name', query: 'bureau a' }],
      }, 'tickets')
      expect(res).toEqual([r1])
    })

    it('chains with an explicit OR link', () => {
      const res = applyWidgetFilters(rows, {
        searches: [{ field: 'name', query: 'réseau' }, { field: 'name', query: 'bureau a', link: 'OR' }],
      }, 'tickets')
      expect(res).toEqual([r1, r3, r4])
    })

    it('chains with an ANDNOT link', () => {
      const res = applyWidgetFilters(rows, {
        searches: [{ field: 'name', query: 'réseau' }, { field: 'name', query: 'bureau a', link: 'ANDNOT' }],
      }, 'tickets')
      expect(res).toEqual([r3])
    })

    it('chains with an ORNOT link', () => {
      const res = applyWidgetFilters(rows, {
        searches: [{ field: 'name', query: 'réseau' }, { field: 'name', query: 'bureau a', link: 'ORNOT' }],
      }, 'tickets')
      expect(res).toEqual([r1, r2, r3])
    })

    it('evaluates 3+ clauses strictly left-to-right, not with AND/OR precedence', () => {
      // A = name contains "réseau", B = name contains "bureau a" (AND), C = category contains "materiel" (OR)
      // Left-to-right fold: ((A AND B) OR C) — NOT the same as A AND (B OR C).
      const res = applyWidgetFilters(rows, {
        searches: [
          { field: 'name', query: 'réseau' },
          { field: 'name', query: 'bureau a', link: 'AND' },
          { field: 'category', query: 'materiel', link: 'OR' },
        ],
      }, 'tickets')
      expect(res).toEqual([r1, r2, r4])
    })

    it('treats a blank/whitespace-only clause as a no-op', () => {
      const res = applyWidgetFilters(rows, {
        searches: [{ field: 'name', query: 'réseau' }, { field: 'name', query: '   ', link: 'AND' }],
      }, 'tickets')
      expect(res).toEqual([r1, r3])
    })
  })

  it('satisfaction source only applies the group filter (plus date range)', () => {
    const s1 = mkSatRow({ group: 'N1', date: '2026-01-15 10:00:00' })
    const s2 = mkSatRow({ group: 'N2', date: '2026-01-15 10:00:00' })
    expect(applyWidgetFilters([s1, s2], { group: ['N1'], status: [1] }, 'satisfaction')).toEqual([s1])
    expect(applyWidgetFilters([s1, s2], { dateFrom: '2026-01-01', dateTo: '2026-01-31' }, 'satisfaction')).toEqual([s1, s2])
  })
})

describe('computeSlaTargets', () => {
  it('returns {} for an unknown segKey', () => {
    expect(computeSlaTargets([mkTicket()], 'notReal')).toEqual({})
  })

  it('uses the explicit target hours when present', () => {
    const rows = [
      mkTicket({ slaTTRName: 'SLA-A', slaTTRTargetH: 24, slaTTRMs: 3600000 * 10 }),
      mkTicket({ slaTTRName: 'SLA-A', slaTTRTargetH: 24, slaTTRMs: 3600000 * 5 }),
    ]
    expect(computeSlaTargets(rows, 'slaTTR')).toEqual({ 'SLA-A': 24 })
  })

  it('falls back to the minimum observed hours when no target is ever set', () => {
    const rows = [
      mkTicket({ slaTTRName: 'SLA-B', slaTTRTargetH: null, slaTTRMs: 3600000 * 10 }),
      mkTicket({ slaTTRName: 'SLA-B', slaTTRTargetH: null, slaTTRMs: 3600000 * 7 }),
    ]
    expect(computeSlaTargets(rows, 'slaTTR')).toEqual({ 'SLA-B': 7 })
  })

  it('skips rows with a null name or null ms field', () => {
    const rows = [
      mkTicket({ slaTTRName: null, slaTTRMs: 3600000 * 5, slaTTRTargetH: 10 }),
      mkTicket({ slaTTRName: 'SLA-C', slaTTRMs: null, slaTTRTargetH: 10 }),
    ]
    expect(computeSlaTargets(rows, 'slaTTR')).toEqual({})
  })
})

describe('buildTechTree', () => {
  const rows = [
    mkTicket({ group: 'N1', techName: 'Alice', resolveMs: 86400000 * 2 }),
    mkTicket({ group: 'N1', techName: 'Alice', resolveMs: 86400000 * 4 }),
    mkTicket({ group: 'N1', techName: 'Bob', resolveMs: 86400000 * 1 }),
    mkTicket({ group: 'N2', techName: 'Carol', resolveMs: 86400000 * 3 }),
    mkTicket({ group: 'N1', techName: null, resolveMs: 86400000 * 5 }),
    mkTicket({ group: 'N1', techName: 'Dave', resolveMs: null }),
  ]

  it('excludes rows missing resolveMs or techName, and aggregates the rest', () => {
    expect(buildTechTree(rows)).toEqual([
      { group: 'N2', avgDays: 3, count: 1, techs: [{ name: 'Carol', avgDays: 3, count: 1 }] },
      {
        group: 'N1',
        avgDays: 2.33,
        count: 3,
        techs: [
          { name: 'Alice', avgDays: 3, count: 2 },
          { name: 'Bob', avgDays: 1, count: 1 },
        ],
      },
    ])
  })
})

describe('computeWidgetData', () => {
  const t1 = mkTicket({ status: 1, priority: 3, type: 1, group: 'N1', entity: 'Siege', category: 'Reseau', breached: false, week: '2026-W01', month: '2026-01' })
  const t2 = mkTicket({ status: 1, priority: 4, type: 1, group: 'N1', entity: 'Siege', category: 'Materiel', breached: true, week: '2026-W01', month: '2026-01' })
  const t3 = mkTicket({ status: 2, priority: 3, type: 2, group: 'N2', entity: 'Antenne', category: 'Reseau', breached: false, week: '2026-W01', month: '2026-01' })
  const t4 = mkTicket({ status: 5, priority: 5, type: 1, group: 'N2', entity: 'Antenne', category: 'Materiel', breached: true, week: '2026-W01', month: '2026-01' })
  const tickets = [t1, t2, t3, t4]

  const baseCtx = () => ({ tickets, satisfaction: [], activeFilters: emptyActiveFilters(), period: 'week' })

  it('stat widget: clickable+active when its single filter clause matches the active filters', () => {
    const widget = { kind: 'stat', metric: 'count', filters: { status: [1] } }
    const ctx = { ...baseCtx(), activeFilters: { ...emptyActiveFilters(), statuses: [1] } }
    expect(computeWidgetData(widget, ctx)).toEqual({
      kind: 'stat',
      value: '2',
      clickable: true,
      active: true,
      clause: { filterKey: 'statuses', scalar: false, values: [1] },
    })
  })

  it('stat widget: clickable but not active when the active filters differ', () => {
    const widget = { kind: 'stat', metric: 'count', filters: { status: [1] } }
    const result = computeWidgetData(widget, baseCtx())
    expect(result.clickable).toBe(true)
    expect(result.active).toBe(false)
  })

  it('stat widget: not clickable with zero filter clauses', () => {
    const widget = { kind: 'stat', metric: 'count', filters: {} }
    const result = computeWidgetData(widget, baseCtx())
    expect(result.value).toBe('4')
    expect(result.clickable).toBe(false)
    expect(result.clause).toBeNull()
  })

  it('stat widget: not clickable with multiple filter clauses', () => {
    const widget = { kind: 'stat', metric: 'count', filters: { status: [1], group: ['N1'] } }
    expect(computeWidgetData(widget, baseCtx()).clickable).toBe(false)
  })

  it('stat widget: not clickable when the single clause maps to a null filterKey (category/type)', () => {
    const widget = { kind: 'stat', metric: 'count', filters: { category: ['Reseau'] } }
    expect(computeWidgetData(widget, baseCtx()).clickable).toBe(false)
  })

  it('simple single-series chart, ordered by the dimension\'s fixedOrder', () => {
    const widget = { kind: 'chart', metric: 'count', dimension: 'status', chartType: 'bar', filters: {} }
    expect(computeWidgetData(widget, baseCtx())).toEqual({
      kind: 'chart',
      chartType: 'bar',
      labels: ['Nouveau', 'En cours', 'Résolu'],
      values: [1, 2, 5],
      itemColors: ['#3b82f6', '#f59e0b', '#10b981'],
      series: [{ name: 'Nombre de tickets', color: null, targetH: null, data: [2, 1, 1] }],
      meta: {
        dimensionKey: 'status', filterKey: 'statuses', scalarFilter: false, isTime: false,
        highlighted: null, dimmedValues: null, percent: false, isDuration: false, unit: null,
      },
    })
  })

  it('segmented/stacked chart splits into one series per segment value', () => {
    const widget = { kind: 'chart', metric: 'count', dimension: 'group', segmentBy: 'compliance', chartType: 'stackedBar', filters: {} }
    const result = computeWidgetData(widget, baseCtx())
    expect(result.kind).toBe('chart')
    expect(result.labels).toEqual(['N1', 'N2'])
    expect(result.meta.filterKey).toBe('groups')
    expect(result.series).toEqual([
      { name: 'Conforme', color: 'rgba(16,185,129,0.8)', targetH: null, data: [1, 1] },
      { name: 'Non conforme', color: 'rgba(239,68,68,0.8)', targetH: null, data: [1, 1] },
    ])
  })

  it('techTree chartType returns buildTechTree output for the same filtered rows', () => {
    const rows = [
      mkTicket({ group: 'N1', techName: 'Alice', resolveMs: 86400000 * 2 }),
      mkTicket({ group: 'N1', techName: 'Alice', resolveMs: 86400000 * 4 }),
    ]
    const widget = { kind: 'chart', chartType: 'techTree', metric: 'mttr' }
    const ctx = { tickets: rows, satisfaction: [], activeFilters: emptyActiveFilters(), period: 'week' }
    expect(computeWidgetData(widget, ctx)).toEqual({ kind: 'techTree', groups: buildTechTree(rows), meta: { filterKey: null } })
  })

  it('heatmap chartType buckets compliant/nonCompliant counts by group x week, excluding rows missing group or week', () => {
    const rows = [
      mkTicket({ group: 'N1', week: '2026-W01', breached: false }),
      mkTicket({ group: 'N1', week: '2026-W01', breached: true }),
      mkTicket({ group: 'N1', week: '2026-W02', breached: false }),
      mkTicket({ group: 'N2', week: '2026-W01', breached: true }),
      mkTicket({ group: 'N1', week: null, breached: false }),
      mkTicket({ group: null, week: '2026-W01', breached: false }),
    ]
    const widget = { kind: 'chart', chartType: 'heatmap', metric: 'count' }
    const ctx = { tickets: rows, satisfaction: [], activeFilters: emptyActiveFilters(), period: 'week' }
    expect(computeWidgetData(widget, ctx)).toEqual({
      kind: 'heatmap',
      groups: [
        { name: 'N1', weekMap: { '2026-W01': { compliant: 1, nonCompliant: 1 }, '2026-W02': { compliant: 1, nonCompliant: 0 } } },
        { name: 'N2', weekMap: { '2026-W01': { compliant: 0, nonCompliant: 1 } } },
      ],
      meta: { filterKey: null },
    })
  })

  it('custom dimension buckets rows by first-matching rule, else "Autre"', () => {
    const rows = [
      mkTicket({ category: 'Réseau interne', name: 'Ticket réseau 1' }),
      mkTicket({ category: 'Matériel', name: 'Ticket matériel 1' }),
      mkTicket({ category: 'Téléphonie', name: 'Ticket tel 1' }),
    ]
    const widget = {
      kind: 'chart', metric: 'count', dimension: 'custom', chartType: 'bar',
      customGroups: [{ label: 'Réseau', field: 'category', query: 'rés' }], filters: {},
    }
    const ctx = { tickets: rows, satisfaction: [], activeFilters: emptyActiveFilters(), period: 'week' }
    expect(computeWidgetData(widget, ctx)).toEqual({
      kind: 'chart',
      chartType: 'bar',
      labels: ['Réseau', 'Autre'],
      values: ['Réseau', 'Autre'],
      itemColors: ['#38bdf8', '#a78bfa'],
      series: [{ name: 'Nombre de tickets', color: null, targetH: null, data: [1, 2] }],
      meta: {
        dimensionKey: 'custom', filterKey: null, scalarFilter: false, isTime: false,
        highlighted: null, dimmedValues: null, percent: false, isDuration: false, unit: null,
      },
    })
  })

  it('dims (does not hide) values excluded by the widget\'s own-dimension global filter', () => {
    const widget = { kind: 'chart', metric: 'count', dimension: 'group', chartType: 'bar', filters: {} }
    const ctx = { ...baseCtx(), activeFilters: { ...emptyActiveFilters(), groups: ['N1'] } }
    const result = computeWidgetData(widget, ctx)
    expect(result.labels).toEqual(['N1', 'N2'])
    expect(result.meta.dimmedValues).toEqual(['N2'])
  })

  it('returns empty for an unknown metric', () => {
    expect(computeWidgetData({ kind: 'stat', metric: 'doesNotExist' }, baseCtx())).toEqual({ kind: 'empty' })
  })

  it('returns empty for an unresolvable dimension key', () => {
    const widget = { kind: 'chart', metric: 'count', dimension: 'notARealDimension', chartType: 'bar', filters: {} }
    expect(computeWidgetData(widget, baseCtx())).toEqual({ kind: 'empty' })
  })
})
