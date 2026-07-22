import { describe, it, expect } from 'vitest'
import {
  buildCustomDimension, resolveTitle, autoTitle, emptyWidget, DIMENSIONS,
} from './registry.js'

describe('buildCustomDimension', () => {
  it('returns null accessors when there are no rules', () => {
    const dim = buildCustomDimension()
    expect(dim.accessor({ category: 'x' })).toBeNull()
    expect(dim.satAccessor({ requester: 'x' })).toBeNull()
    expect(dim.fixedOrder).toBeUndefined()

    const dimEmpty = buildCustomDimension([])
    expect(dimEmpty.accessor({ category: 'x' })).toBeNull()
  })

  it('filters out rules with a blank label or query', () => {
    const dim = buildCustomDimension([{ label: '  ', query: 'x' }, { label: 'Y', query: '   ' }])
    expect(dim.accessor({ category: 'x' })).toBeNull()
    expect(dim.fixedOrder).toBeUndefined()
  })

  it('matches the first rule that applies, even if a later rule would also match', () => {
    const dim = buildCustomDimension([
      { label: 'A', field: 'category', query: 'net' },
      { label: 'B', field: 'category', query: 'network' },
    ])
    expect(dim.accessor({ category: 'Network issue' })).toBe('A')
  })

  it('falls through to "Autre" when no rule matches', () => {
    const dim = buildCustomDimension([{ label: 'A', field: 'category', query: 'net' }])
    expect(dim.accessor({ category: 'Other stuff' })).toBe('Autre')
  })

  it('skips a rule whose field has no accessor for the given source, falling through to "Autre"', () => {
    // "name" has no satAccessor in CUSTOM_GROUP_FIELD_ACCESSORS
    const dim = buildCustomDimension([{ label: 'A', field: 'name', query: 'x' }])
    expect(dim.satAccessor({ requester: 'x' })).toBe('Autre')
  })

  it('deduplicates fixedOrder labels while preserving first-occurrence order, with Autre last', () => {
    const dim = buildCustomDimension([
      { label: 'A', field: 'name', query: 'x' },
      { label: 'B', field: 'name', query: 'y' },
      { label: 'A', field: 'name', query: 'z' },
    ])
    expect(dim.fixedOrder).toEqual(['A', 'B', 'Autre'])
  })

  it('matches case-insensitively regardless of rule/row casing', () => {
    const dim = buildCustomDimension([{ label: 'A', field: 'category', query: 'NET' }])
    expect(dim.accessor({ category: 'network issue' })).toBe('A')
  })
})

describe('resolveTitle', () => {
  it('substitutes {période} for the current period', () => {
    expect(resolveTitle('Tickets par {période}', 'week')).toBe('Tickets par semaine')
    expect(resolveTitle('Tickets par {période}', 'month')).toBe('Tickets par mois')
  })

  it('substitutes {hebdo} for the current period', () => {
    expect(resolveTitle('SLA {hebdo}', 'week')).toBe('SLA hebdo.')
    expect(resolveTitle('SLA {hebdo}', 'month')).toBe('SLA mensuel')
  })

  it('substitutes both tokens in the same string', () => {
    expect(resolveTitle('{période} — {hebdo}', 'week')).toBe('semaine — hebdo.')
  })

  it('returns the string unchanged when it has no tokens', () => {
    expect(resolveTitle('No tokens here', 'week')).toBe('No tokens here')
  })
})

describe('autoTitle', () => {
  it('is just the metric label for a stat widget', () => {
    expect(autoTitle({ kind: 'stat', metric: 'count' })).toBe('Nombre de tickets')
  })

  it('is just the metric label for a chart with no dimension', () => {
    expect(autoTitle({ kind: 'chart', metric: 'count', dimension: null })).toBe('Nombre de tickets')
  })

  it('appends "par <dimension label>" for a normal dimension', () => {
    expect(autoTitle({ kind: 'chart', metric: 'count', dimension: 'status' })).toBe('Nombre de tickets par statut')
  })

  it('uses "personnalisé" for the custom dimension', () => {
    expect(autoTitle({ kind: 'chart', metric: 'count', dimension: 'custom' })).toBe('Nombre de tickets par personnalisé')
  })

  it('resolves the "period" pseudo-dimension via the period toggle', () => {
    expect(autoTitle({ kind: 'chart', metric: 'count', dimension: 'period' }, 'week')).toBe('Nombre de tickets par semaine')
    expect(autoTitle({ kind: 'chart', metric: 'count', dimension: 'period' }, 'month')).toBe('Nombre de tickets par mois')
  })

  it('resolves the "closePeriod" pseudo-dimension via the period toggle', () => {
    expect(autoTitle({ kind: 'chart', metric: 'count', dimension: 'closePeriod' }, 'week')).toBe('Nombre de tickets par semaine de clôture')
    expect(autoTitle({ kind: 'chart', metric: 'count', dimension: 'closePeriod' }, 'month')).toBe('Nombre de tickets par mois de clôture')
  })

  it('appends the segment dimension label when segmented', () => {
    expect(autoTitle({ kind: 'chart', metric: 'count', dimension: 'group', segmentBy: 'compliance' }))
      .toBe(`Nombre de tickets par groupe — ${DIMENSIONS.compliance.label}`)
  })

  it('appends "Personnalisé" when the segment is custom', () => {
    expect(autoTitle({ kind: 'chart', metric: 'count', dimension: 'group', segmentBy: 'custom' }))
      .toBe('Nombre de tickets par groupe — Personnalisé')
  })

  it('falls back to "Widget" for an unknown metric', () => {
    expect(autoTitle({ kind: 'chart', metric: 'doesNotExist' })).toBe('Widget')
  })
})

describe('emptyWidget', () => {
  it('defaults for a chart widget', () => {
    const w = emptyWidget('chart')
    expect(w.kind).toBe('chart')
    expect(w.dimension).toBe('status')
    expect(w.chartType).toBe('bar')
    expect(w.filters).toEqual({})
    expect(w.options).toEqual({})
    expect(w.span).toEqual({ col: 6, row: 4 })
    expect(w.id).toMatch(/^w-/)
  })

  it('defaults for a stat widget', () => {
    const w = emptyWidget('stat')
    expect(w.kind).toBe('stat')
    expect(w.dimension).toBeNull()
    expect(w.span).toEqual({ col: 2, row: 2 })
  })

  it('defaults to kind "chart" when called with no argument', () => {
    expect(emptyWidget().kind).toBe('chart')
  })

  it('generates a unique id on each call', () => {
    expect(emptyWidget().id).not.toBe(emptyWidget().id)
  })
})
