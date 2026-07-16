// Named dashboards + widget persistence (module singleton).
// Single versioned localStorage document replaces the legacy
// glpi-chart-order / glpi-card-order / glpi-chart-spans keys (migrated once, then removed).
import { reactive, computed, watch } from 'vue'
import {
  DEFAULT_WIDGETS, newWidgetId,
  LEGACY_CHART_IDS, LEGACY_CARD_IDS, legacyChartSeedId, legacyCardSeedId,
} from '../lib/registry.js'

const STORAGE_KEY = 'glpi-dashboards'
const LEGACY_KEYS = { chartOrder: 'glpi-chart-order', cardOrder: 'glpi-card-order', spans: 'glpi-chart-spans' }

const clone = (o) => JSON.parse(JSON.stringify(o))

function newDashboardId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? `d-${crypto.randomUUID()}`
    : `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function defaultDashboard() {
  return { id: newDashboardId(), name: 'Tableau de bord', widgets: clone(DEFAULT_WIDGETS) }
}

// Apply the legacy order/span keys onto a freshly seeded widget list, then drop them.
function migrateLegacyLayout(widgets) {
  let chartOrder = null, cardOrder = null, spans = null
  try { chartOrder = JSON.parse(localStorage.getItem(LEGACY_KEYS.chartOrder) ?? 'null') } catch {}
  try { cardOrder  = JSON.parse(localStorage.getItem(LEGACY_KEYS.cardOrder)  ?? 'null') } catch {}
  try { spans      = JSON.parse(localStorage.getItem(LEGACY_KEYS.spans)      ?? 'null') } catch {}
  if (!chartOrder && !cardOrder && !spans) return widgets

  const byId = Object.fromEntries(widgets.map(w => [w.id, w]))

  if (spans && typeof spans === 'object') {
    for (const legacyId of LEGACY_CHART_IDS) {
      const span = spans[legacyId]
      const w = byId[legacyChartSeedId(legacyId)]
      if (w && span?.col != null && span?.row != null) w.span = { col: span.col, row: span.row }
    }
  }

  const orderedIds = []
  const cardIds = Array.isArray(cardOrder) ? cardOrder : LEGACY_CARD_IDS
  for (const id of cardIds) {
    if (LEGACY_CARD_IDS.includes(id)) orderedIds.push(legacyCardSeedId(id))
  }
  const chartIds = Array.isArray(chartOrder) ? chartOrder : LEGACY_CHART_IDS
  for (const id of chartIds) {
    if (LEGACY_CHART_IDS.includes(id)) orderedIds.push(legacyChartSeedId(id))
  }

  const seen = new Set()
  const ordered = []
  for (const id of orderedIds) {
    if (byId[id] && !seen.has(id)) { ordered.push(byId[id]); seen.add(id) }
  }
  for (const w of widgets) {
    if (!seen.has(w.id)) ordered.push(w)
  }

  localStorage.removeItem(LEGACY_KEYS.chartOrder)
  localStorage.removeItem(LEGACY_KEYS.cardOrder)
  localStorage.removeItem(LEGACY_KEYS.spans)
  return ordered
}

function loadDoc() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (saved && saved.version === 1 && Array.isArray(saved.dashboards) && saved.dashboards.length > 0) {
      return saved
    }
  } catch {}
  const dash = defaultDashboard()
  dash.widgets = migrateLegacyLayout(dash.widgets)
  return { version: 1, activeId: dash.id, dashboards: [dash] }
}

const doc = reactive(loadDoc())

let saveTimer = null
watch(doc, () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(doc)) } catch {}
  }, 250)
}, { deep: true })

const dashboards = computed(() => doc.dashboards)

const activeDashboard = computed(() => {
  return doc.dashboards.find(d => d.id === doc.activeId) ?? doc.dashboards[0]
})

// Writable — vuedraggable v-model binds here for drag-reorder
const activeWidgets = computed({
  get: () => activeDashboard.value?.widgets ?? [],
  set: (widgets) => { if (activeDashboard.value) activeDashboard.value.widgets = widgets },
})

function setActive(id) {
  if (doc.dashboards.some(d => d.id === id)) doc.activeId = id
}

function createDashboard(name, { seedDefaults = false } = {}) {
  const dash = {
    id: newDashboardId(),
    name: name?.trim() || 'Nouveau tableau de bord',
    widgets: seedDefaults ? clone(DEFAULT_WIDGETS).map(w => ({ ...w, id: newWidgetId() })) : [],
  }
  doc.dashboards.push(dash)
  doc.activeId = dash.id
  return dash
}

function renameDashboard(id, name) {
  const dash = doc.dashboards.find(d => d.id === id)
  if (dash && name?.trim()) dash.name = name.trim()
}

function duplicateDashboard(id) {
  const src = doc.dashboards.find(d => d.id === id)
  if (!src) return
  const copy = clone(src)
  copy.id = newDashboardId()
  copy.name = `${src.name} (copie)`
  copy.widgets = copy.widgets.map(w => ({ ...w, id: newWidgetId() }))
  const idx = doc.dashboards.findIndex(d => d.id === id)
  doc.dashboards.splice(idx + 1, 0, copy)
  doc.activeId = copy.id
  return copy
}

function deleteDashboard(id) {
  const idx = doc.dashboards.findIndex(d => d.id === id)
  if (idx < 0) return
  doc.dashboards.splice(idx, 1)
  if (doc.dashboards.length === 0) doc.dashboards.push(defaultDashboard())
  if (doc.activeId === id) doc.activeId = doc.dashboards[Math.max(0, idx - 1)].id
}

// ── Widget operations (on the active dashboard) ──────────────────────────────
function addWidget(widget) {
  activeDashboard.value?.widgets.push(widget)
}

function updateWidget(widget) {
  const list = activeDashboard.value?.widgets
  if (!list) return
  const idx = list.findIndex(w => w.id === widget.id)
  if (idx >= 0) list.splice(idx, 1, widget)
}

function removeWidget(id) {
  const list = activeDashboard.value?.widgets
  if (!list) return
  const idx = list.findIndex(w => w.id === id)
  if (idx >= 0) list.splice(idx, 1)
}

function duplicateWidget(id) {
  const list = activeDashboard.value?.widgets
  if (!list) return
  const idx = list.findIndex(w => w.id === id)
  if (idx < 0) return
  const copy = clone(list[idx])
  copy.id = newWidgetId()
  list.splice(idx + 1, 0, copy)
  return copy
}

function setSpan(id, span) {
  const w = activeDashboard.value?.widgets.find(w => w.id === id)
  if (w) w.span = { ...span }
}

export function useDashboards() {
  return {
    dashboards,
    activeDashboard,
    activeWidgets,
    setActive,
    createDashboard,
    renameDashboard,
    duplicateDashboard,
    deleteDashboard,
    addWidget,
    updateWidget,
    removeWidget,
    duplicateWidget,
    setSpan,
  }
}
