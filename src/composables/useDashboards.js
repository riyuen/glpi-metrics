// Named dashboards + widget persistence (module singleton).
// Fully shared, server-backed document — everyone using the app sees the same
// dashboards (there's no auth anywhere in this app, so no per-user scoping).
// Backed by the tiny dashboards-api service (GET/PUT /api/dashboards), which
// stores one JSON file on the same volume the Airflow DAG writes metrics to.
import { reactive, ref, computed, watch, nextTick } from 'vue'
import {
  DEFAULT_WIDGETS, newWidgetId,
  LEGACY_CHART_IDS, LEGACY_CARD_IDS, legacyChartSeedId, legacyCardSeedId,
} from '../lib/registry.js'

const API_URL = '/api/dashboards'
const LOCAL_STORAGE_KEY = 'glpi-dashboards' // read once, as a seed source only — no longer written
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

function isValidDoc(saved) {
  return saved && saved.version === 1 && Array.isArray(saved.dashboards) && saved.dashboards.length > 0
}

// Used only as a one-time seed when the shared server document doesn't exist yet —
// preserves whatever this browser already had locally instead of starting everyone blank.
function loadLocalSeed() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) ?? 'null')
    if (isValidDoc(saved)) return saved
  } catch {}
  const dash = defaultDashboard()
  dash.widgets = migrateLegacyLayout(dash.widgets)
  return { version: 1, activeId: dash.id, dashboards: [dash] }
}

async function fetchServerDoc() {
  try {
    const res = await fetch(API_URL, { cache: 'no-store' })
    if (!res.ok) return null
    const saved = await res.json()
    return isValidDoc(saved) ? saved : null
  } catch {
    return null
  }
}

// Returns { ok: true, rev } on success, { ok: false, conflict: true } if the
// server rejects the write because someone else saved a newer revision first,
// or { ok: false } on any other failure.
async function persistDoc(d) {
  try {
    // POST, not PUT: some front-line WAFs/proxies block PUT by default.
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    })
    if (res.status === 409) return { ok: false, conflict: true }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { rev } = await res.json()
    return { ok: true, rev }
  } catch (e) {
    console.error('Failed to save dashboards to the server:', e)
    return { ok: false }
  }
}

// ── Reactive state ────────────────────────────────────────────────────────────
const doc = reactive({ version: 1, rev: 0, activeId: null, dashboards: [] })
const ready = ref(false)
const dirty = ref(false)
const saveStatus = ref('idle') // 'idle' | 'saving' | 'saved' | 'error' | 'conflict'
let savedStatusTimer = null
let suppressDirty = false

function applyDoc(d) {
  suppressDirty = true
  doc.version = d.version
  doc.rev = d.rev ?? 0
  doc.activeId = d.activeId
  doc.dashboards = d.dashboards
  nextTick(() => { suppressDirty = false })
}

async function init() {
  const fromServer = await fetchServerDoc()
  applyDoc(fromServer ?? loadLocalSeed())
  ready.value = true
  if (!fromServer) await save() // seed the server with this browser's state
}

init()

watch(doc, () => {
  if (!ready.value || suppressDirty) return
  dirty.value = true
}, { deep: true })

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (!dirty.value) return
    e.preventDefault()
    e.returnValue = ''
  })
}

// Only thing that talks to the network — fired by an explicit user action
// (the Save button), never automatically on edit.
async function save() {
  if (saveStatus.value === 'saving') return
  clearTimeout(savedStatusTimer)
  saveStatus.value = 'saving'
  const result = await persistDoc(doc)
  if (result.ok) {
    doc.rev = result.rev
    dirty.value = false
    saveStatus.value = 'saved'
    savedStatusTimer = setTimeout(() => { saveStatus.value = 'idle' }, 2000)
  } else if (result.conflict) {
    saveStatus.value = 'conflict'
  } else {
    saveStatus.value = 'error'
  }
}

// Recovery path from a conflict: discard local edits and pull the latest
// server state instead of overwriting it.
async function reloadFromServer() {
  const fromServer = await fetchServerDoc()
  if (fromServer) applyDoc(fromServer)
  dirty.value = false
  saveStatus.value = 'idle'
}

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
    ready,
    dirty,
    saveStatus,
    save,
    reloadFromServer,
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
