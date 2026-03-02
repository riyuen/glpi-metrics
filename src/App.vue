<template>
  <div class="app">
    <header class="app-header">
      <h1>GLPI Metrics</h1>
      <div class="header-actions">
        <button class="theme-btn" @click="theme = theme === 'dark' ? 'light' : 'dark'">
          {{ theme === 'dark' ? 'Light mode' : 'Dark mode' }}
        </button>
        <button class="export-btn" :disabled="loading" @click="openExportDialog">
          Export PPT
        </button>
        <button class="outline-btn" :class="{ active: reorderMode }" @click="reorderMode = !reorderMode">
          {{ reorderMode ? 'Done' : 'Reorder' }}
        </button>
        <button class="refresh-btn" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div v-if="error" class="error-banner">
      {{ error }}
    </div>

    <main v-else class="content">
      <!-- Summary stat cards -->
      <draggable
        v-model="cardOrder"
        :disabled="!reorderMode"
        :item-key="id => id"
        tag="section"
        class="stat-row"
        :class="{ 'reorder-mode': reorderMode }"
        handle=".card-drag-handle"
        ghost-class="card-ghost"
      >
        <template #item="{ element: id }">
          <div
            class="card-wrapper"
            :class="{
              'card-clickable': !reorderMode && cardData[id].clickable,
              'card-active': cardData[id].active,
            }"
            @click="handleCardClick(id)"
          >
            <button v-if="reorderMode" class="card-drag-handle" title="Drag to reorder">⠿</button>
            <StatCard :label="cardData[id].label" :value="cardData[id].value" />
          </div>
        </template>
      </draggable>

      <!-- Active filter bar -->
      <div v-if="hasActiveFilters" class="filter-bar">
        <span class="filter-label">Filters:</span>
        <span v-if="activeFilters.statuses.length" class="filter-chip">
          Status: {{ activeFilters.statuses.map(s => STATUS[s]).join(', ') }}
          <button @click.stop="activeFilters.statuses.length = 0">×</button>
        </span>
        <span v-if="activeFilters.priorities.length" class="filter-chip">
          Priority: {{ activeFilters.priorities.map(p => PRIORITY[p]).join(', ') }}
          <button @click.stop="activeFilters.priorities.length = 0">×</button>
        </span>
        <span v-if="activeFilters.groups.length" class="filter-chip">
          Group: {{ activeFilters.groups.join(', ') }}
          <button @click.stop="activeFilters.groups.length = 0">×</button>
        </span>
        <span v-if="activeFilters.entities.length" class="filter-chip">
          Entity: {{ activeFilters.entities.join(', ') }}
          <button @click.stop="activeFilters.entities.length = 0">×</button>
        </span>
        <span v-if="activeFilters.periods.length" class="filter-chip">
          {{ period === 'week' ? 'Week' : 'Month' }}: {{ activeFilters.periods.join(', ') }}
          <button @click.stop="activeFilters.periods.length = 0">×</button>
        </span>
        <span v-if="activeFilters.compliance" class="filter-chip">
          {{ activeFilters.compliance === 'compliant' ? 'Compliant only' : 'Non-compliant only' }}
          <button @click.stop="activeFilters.compliance = null">×</button>
        </span>
        <button class="clear-all-btn" @click="clearFilters">Clear all</button>
      </div>

      <!-- Period toggle -->
      <div class="period-toggle">
        <button :class="{ active: period === 'week' }" @click="period = 'week'">Weekly</button>
        <button :class="{ active: period === 'month' }" @click="period = 'month'">Monthly</button>
      </div>

      <!-- Charts -->
      <draggable
        v-model="chartOrder"
        :disabled="!reorderMode"
        :item-key="id => id"
        tag="section"
        class="charts-row"
        :class="{ 'reorder-mode': reorderMode }"
        handle=".drag-handle"
        ghost-class="chart-ghost"
      >
        <template #item="{ element: id }">
          <div
            class="chart-wrapper"
            :ref="el => { if (el) chartRefs[id] = el; else delete chartRefs[id] }"
          >
            <button v-if="reorderMode" class="drag-handle" title="Drag to reorder">⠿</button>
            <component :is="COMP[id]" v-bind="chartProps[id]" v-on="chartEvents[id]" />
          </div>
        </template>
      </draggable>
    </main>

    <footer class="app-footer">
      <span v-if="lastUpdated">Last updated: {{ lastUpdated }}</span>
    </footer>

    <!-- Export PPT dialog -->
    <div v-if="showExportDialog" class="dialog-overlay" @click.self="showExportDialog = false">
      <div class="dialog">
        <h3 class="dialog-title">Select charts to export</h3>

        <div class="dialog-select-all">
          <button class="select-toggle-btn" @click="toggleAllExport">
            {{ selectedCharts.length === chartOrder.length ? 'Deselect all' : 'Select all' }}
          </button>
          <span class="dialog-count">{{ selectedCharts.length }} / {{ chartOrder.length }} selected</span>
        </div>

        <ul class="export-chart-list">
          <li v-for="id in chartOrder" :key="id" class="export-chart-item">
            <label>
              <input type="checkbox" :value="id" v-model="selectedCharts" />
              <span>{{ getChartTitle(id) }}</span>
            </label>
          </li>
        </ul>

        <div class="dialog-footer">
          <button class="outline-btn" @click="showExportDialog = false">Cancel</button>
          <button
            class="refresh-btn"
            :disabled="selectedCharts.length === 0 || exporting"
            @click="runExport"
          >
            {{ exporting ? 'Exporting…' : `Export ${selectedCharts.length} slide${selectedCharts.length === 1 ? '' : 's'}` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, watch, markRaw, nextTick } from 'vue'
import draggable from 'vuedraggable'
import StatCard from './components/StatCard.vue'
import BarChart from './components/BarChart.vue'
import LineChart from './components/LineChart.vue'
import ComplianceChart from './components/ComplianceChart.vue'
import GroupChart from './components/GroupChart.vue'
import WeeklyBarChart from './components/WeeklyBarChart.vue'
import PieChart from './components/PieChart.vue'
import { fetchMetrics, STATUS, PRIORITY } from './api/glpi.js'

const STATUS_COLORS = {
  1: '#3b82f6',
  2: '#f59e0b',
  3: '#8b5cf6',
  4: '#6b7280',
  5: '#10b981',
  6: '#374151',
}
const PRIORITY_COLORS = {
  1: '#6ee7b7',
  2: '#34d399',
  3: '#f59e0b',
  4: '#f97316',
  5: '#ef4444',
  6: '#7f1d1d',
}
const OPEN_STS = [1, 2, 3, 4]
const CLOSED_STS = [5, 6]

// Chart component registry
const COMP = {
  status:     markRaw(BarChart),
  priority:   markRaw(BarChart),
  line:       markRaw(LineChart),
  compliance: markRaw(ComplianceChart),
  noTTO:      markRaw(WeeklyBarChart),
  group:      markRaw(GroupChart),
  entities:   markRaw(PieChart),
}
const ALL_IDS      = ['status', 'priority', 'line', 'compliance', 'noTTO', 'group', 'entities']
const ALL_CARD_IDS = ['open', 'total', 'solved', 'compliance', 'compliant', 'nonCompliant', 'avgResolve']
const CHART_ORDER_KEY = 'glpi-chart-order'
const CARD_ORDER_KEY  = 'glpi-card-order'
const THEME_KEY       = 'glpi-theme'

function loadOrder(key, defaults) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (Array.isArray(saved) && saved.length === defaults.length && defaults.every(id => saved.includes(id)))
      return saved
  } catch {}
  return [...defaults]
}

// ── Global metrics (unfiltered, from API) ─────────────────────────────────────
const metrics = ref({
  openCount: 0, byStatus: {}, byPriority: {},
  byWeek: {}, byWeekCompliance: {}, byWeekNoTTO: {},
  byMonth: {}, byMonthCompliance: {}, byMonthNoTTO: {},
  byGroupCompliance: {}, topEntities: [], total: 0,
  avgResolveHours: null,
})
// Lightweight processed tickets for client-side cross-filtering
const processedTickets = ref([])

// ── UI state ─────────────────────────────────────────────────────────────────
const period      = ref('week')
const loading     = ref(false)
const error       = ref(null)
const lastUpdated = ref(null)
const reorderMode = ref(false)
const exporting   = ref(false)
const chartRefs   = {} // populated via :ref callbacks in the template
const chartOrder  = ref(loadOrder(CHART_ORDER_KEY, ALL_IDS))
const cardOrder   = ref(loadOrder(CARD_ORDER_KEY,  ALL_CARD_IDS))
const theme       = ref(localStorage.getItem(THEME_KEY) ?? 'dark')

watch(chartOrder, (o) => localStorage.setItem(CHART_ORDER_KEY, JSON.stringify(o)), { deep: true })
watch(cardOrder,  (o) => localStorage.setItem(CARD_ORDER_KEY,  JSON.stringify(o)), { deep: true })
watch(theme, (t) => {
  document.documentElement.classList.toggle('light', t === 'light')
  localStorage.setItem(THEME_KEY, t)
}, { immediate: true })

// ── Cross-filter state ────────────────────────────────────────────────────────
const activeFilters = reactive({
  statuses:   [],
  priorities: [],
  groups:     [],
  entities:   [],
  compliance: null, // null | 'compliant' | 'nonCompliant'
  periods:    [],   // week/month label strings matching current period
})

// Clear period filter when switching between weekly/monthly view
watch(period, () => { activeFilters.periods.length = 0 })

const hasActiveFilters = computed(() =>
  activeFilters.statuses.length > 0 ||
  activeFilters.priorities.length > 0 ||
  activeFilters.groups.length > 0 ||
  activeFilters.entities.length > 0 ||
  activeFilters.compliance !== null ||
  activeFilters.periods.length > 0
)

function toggleFilter(dimension, value) {
  const arr = activeFilters[dimension]
  const idx = arr.indexOf(value)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(value)
}

function clearFilters() {
  activeFilters.statuses.length   = 0
  activeFilters.priorities.length = 0
  activeFilters.groups.length     = 0
  activeFilters.entities.length   = 0
  activeFilters.periods.length    = 0
  activeFilters.compliance        = null
}

function handleCardClick(id) {
  if (reorderMode.value) return
  if (id === 'open') {
    const allOn = OPEN_STS.every(s => activeFilters.statuses.includes(s)) && activeFilters.statuses.length === OPEN_STS.length
    activeFilters.statuses.length = 0
    if (!allOn) activeFilters.statuses.push(...OPEN_STS)
  } else if (id === 'solved') {
    const allOn = CLOSED_STS.every(s => activeFilters.statuses.includes(s)) && activeFilters.statuses.length === CLOSED_STS.length
    activeFilters.statuses.length = 0
    if (!allOn) activeFilters.statuses.push(...CLOSED_STS)
  } else if (id === 'compliant') {
    activeFilters.compliance = activeFilters.compliance === 'compliant' ? null : 'compliant'
  } else if (id === 'nonCompliant') {
    activeFilters.compliance = activeFilters.compliance === 'nonCompliant' ? null : 'nonCompliant'
  }
}

// ── Filtered tickets + chart metrics ─────────────────────────────────────────

// Base filter: everything except period — used for time-series charts (they show all periods)
const baseFilteredTickets = computed(() => {
  let ts = processedTickets.value
  if (activeFilters.statuses.length)   ts = ts.filter(t => activeFilters.statuses.includes(t.status))
  if (activeFilters.priorities.length) ts = ts.filter(t => activeFilters.priorities.includes(t.priority))
  if (activeFilters.groups.length)     ts = ts.filter(t => activeFilters.groups.includes(t.group))
  if (activeFilters.entities.length)   ts = ts.filter(t => activeFilters.entities.includes(t.entity))
  if (activeFilters.compliance === 'compliant')    ts = ts.filter(t => !t.breached)
  if (activeFilters.compliance === 'nonCompliant') ts = ts.filter(t => t.breached)
  return ts
})

// Full filter: base + period — used for stat cards and non-time charts
const filteredTickets = computed(() => {
  let ts = baseFilteredTickets.value
  if (activeFilters.periods.length) {
    const field = period.value === 'week' ? 'week' : 'month'
    ts = ts.filter(t => activeFilters.periods.includes(t[field]))
  }
  return ts
})

function computeChartMetrics(tickets) {
  const byStatus = {}, byPriority = {}
  const byWeek = {}, byMonth = {}
  const byWeekCompliance = {}, byMonthCompliance = {}
  const byWeekNoTTO = {}, byMonthNoTTO = {}
  const byGroupCompliance = {}
  const byEntity = {}

  for (const t of tickets) {
    byStatus[t.status]   = (byStatus[t.status]   ?? 0) + 1
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1

    if (t.week) {
      byWeek[t.week]   = (byWeek[t.week]   ?? 0) + 1
      byMonth[t.month] = (byMonth[t.month] ?? 0) + 1

      if (!byWeekCompliance[t.week])  byWeekCompliance[t.week]  = { compliant: 0, nonCompliant: 0 }
      if (!byMonthCompliance[t.month]) byMonthCompliance[t.month] = { compliant: 0, nonCompliant: 0 }
      if (t.breached) { byWeekCompliance[t.week].nonCompliant++; byMonthCompliance[t.month].nonCompliant++ }
      else            { byWeekCompliance[t.week].compliant++;    byMonthCompliance[t.month].compliant++ }

      if (t.hasNoTTO) {
        byWeekNoTTO[t.week]   = (byWeekNoTTO[t.week]   ?? 0) + 1
        byMonthNoTTO[t.month] = (byMonthNoTTO[t.month] ?? 0) + 1
      }
    }

    if (!byGroupCompliance[t.group]) byGroupCompliance[t.group] = { compliant: 0, nonCompliant: 0 }
    if (t.breached) byGroupCompliance[t.group].nonCompliant++
    else            byGroupCompliance[t.group].compliant++

    byEntity[t.entity] = (byEntity[t.entity] ?? 0) + 1
  }

  const sort = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
  return {
    byStatus,
    byPriority,
    byWeek:             sort(byWeek),
    byMonth:            sort(byMonth),
    byWeekCompliance:   sort(byWeekCompliance),
    byMonthCompliance:  sort(byMonthCompliance),
    byWeekNoTTO:        sort(byWeekNoTTO),
    byMonthNoTTO:       sort(byMonthNoTTO),
    byGroupCompliance,
    topEntities: Object.entries(byEntity).sort(([, a], [, b]) => b - a).slice(0, 10),
  }
}

const chartMetrics     = computed(() => computeChartMetrics(filteredTickets.value))
// Time charts see all periods (base filter, no period restriction) — they highlight instead
const timeChartMetrics = computed(() => computeChartMetrics(baseFilteredTickets.value))

// ── Stat card computeds (reflect all active filters including period) ──────────
const filteredStats = computed(() => {
  const ts = filteredTickets.value
  const total        = ts.length
  const open         = ts.filter(t => t.status !== 5 && t.status !== 6).length
  const solved       = ts.filter(t => t.status === 5 || t.status === 6).length
  const compliant    = ts.filter(t => !t.breached).length
  const nonCompliant = ts.filter(t => t.breached).length
  const pct          = total === 0 ? '—' : `${Math.round((compliant / total) * 100)}%`
  const resolvedTs   = ts.filter(t => t.resolveMs != null)
  const avgH         = resolvedTs.length > 0
    ? Math.round(resolvedTs.reduce((s, t) => s + t.resolveMs, 0) / resolvedTs.length / 3600000)
    : null
  return { total, open, solved, compliant, nonCompliant, pct, avgH }
})

// Which stat cards are "active" (match a current filter exactly)
const cardActive = computed(() => {
  const sts = activeFilters.statuses
  return {
    open:         sts.length === OPEN_STS.length   && OPEN_STS.every(s => sts.includes(s)),
    solved:       sts.length === CLOSED_STS.length && CLOSED_STS.every(s => sts.includes(s)),
    compliant:    activeFilters.compliance === 'compliant',
    nonCompliant: activeFilters.compliance === 'nonCompliant',
  }
})

const cardData = computed(() => {
  const s = filteredStats.value
  const v = (x) => loading.value ? '—' : x
  return {
    open:         { label: 'Open Tickets',    value: v(s.open),                                  clickable: true,  active: cardActive.value.open },
    total:        { label: 'Total Tickets',   value: v(s.total),                                 clickable: false, active: false },
    solved:       { label: 'Closed / Solved', value: v(s.solved),                                clickable: true,  active: cardActive.value.solved },
    compliance:   { label: 'SLA Compliance',  value: v(s.pct),                                   clickable: false, active: false },
    compliant:    { label: 'Compliant',        value: v(s.compliant),                             clickable: true,  active: cardActive.value.compliant },
    nonCompliant: { label: 'Non-Compliant',    value: v(s.nonCompliant),                          clickable: true,  active: cardActive.value.nonCompliant },
    avgResolve:   { label: 'Avg. Resolve',     value: v(s.avgH === null ? '—' : `${s.avgH}h`),   clickable: false, active: false },
  }
})

// ── Chart data computeds (use chartMetrics = filtered) ───────────────────────
// Status/Priority: use global counts but dim non-selected items
const statusItems = computed(() =>
  Object.entries(metrics.value.byStatus).map(([code, count]) => {
    const num = parseInt(code)
    return {
      label:  STATUS[code] ?? `Status ${code}`,
      count,
      color:  STATUS_COLORS[code] ?? '#6b7280',
      code:   num,
      dimmed: activeFilters.statuses.length > 0 && !activeFilters.statuses.includes(num),
    }
  })
)
const priorityItems = computed(() =>
  Object.entries(metrics.value.byPriority).map(([code, count]) => {
    const num = parseInt(code)
    return {
      label:  PRIORITY[code] ?? `Priority ${code}`,
      count,
      color:  PRIORITY_COLORS[code] ?? '#6b7280',
      code:   num,
      dimmed: activeFilters.priorities.length > 0 && !activeFilters.priorities.includes(num),
    }
  })
)

// Time charts use timeChartMetrics (all periods visible) + highlighted periods passed separately
const periodLabels = computed(() =>
  Object.keys(period.value === 'week' ? timeChartMetrics.value.byWeek : timeChartMetrics.value.byMonth)
)
const periodData = computed(() =>
  Object.values(period.value === 'week' ? timeChartMetrics.value.byWeek : timeChartMetrics.value.byMonth)
)
const periodCompliance = computed(() => {
  const src = period.value === 'week' ? timeChartMetrics.value.byWeekCompliance : timeChartMetrics.value.byMonthCompliance
  return Object.entries(src).map(([week, v]) => ({ week, ...v }))
})
const periodNoTTOLabels = computed(() =>
  Object.keys(period.value === 'week' ? timeChartMetrics.value.byWeekNoTTO : timeChartMetrics.value.byMonthNoTTO)
)
const periodNoTTOData = computed(() =>
  Object.values(period.value === 'week' ? timeChartMetrics.value.byWeekNoTTO : timeChartMetrics.value.byMonthNoTTO)
)
const groupComplianceData = computed(() =>
  Object.entries(chartMetrics.value.byGroupCompliance)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.compliant + b.nonCompliant - (a.compliant + a.nonCompliant))
)

// ── Chart props and events ────────────────────────────────────────────────────
const chartProps = computed(() => ({
  status: { title: 'By Status',   items: statusItems.value },
  priority: { title: 'By Priority', items: priorityItems.value },
  line: {
    title:             period.value === 'week' ? 'Tickets opened by week' : 'Tickets opened by month',
    labels:            periodLabels.value,
    data:              periodData.value,
    theme:             theme.value,
    highlightedPeriods: activeFilters.periods,
  },
  compliance: {
    title:             period.value === 'week' ? 'SLA compliance by week' : 'SLA compliance by month',
    weekData:          periodCompliance.value,
    theme:             theme.value,
    highlightedPeriods: activeFilters.periods,
  },
  noTTO: {
    title:             'Tickets not taken into account',
    labels:            periodNoTTOLabels.value,
    data:              periodNoTTOData.value,
    color:             'rgba(245,158,11,0.8)',
    theme:             theme.value,
    highlightedPeriods: activeFilters.periods,
  },
  group: {
    title:  'SLA compliance by group',
    groups: groupComplianceData.value,
    theme:  theme.value,
  },
  entities: {
    title: 'Top 10 entities',
    items: chartMetrics.value.topEntities,
    theme: theme.value,
  },
}))

const chartEvents = computed(() => ({
  status:     { 'item-click': (code) => toggleFilter('statuses',   code) },
  priority:   { 'item-click': (code) => toggleFilter('priorities', code) },
  group:      { 'item-click': (name) => toggleFilter('groups',     name) },
  entities:   { 'item-click': (name) => toggleFilter('entities',   name) },
  line:       { 'item-click': (label) => toggleFilter('periods',   label) },
  compliance: { 'item-click': (label) => toggleFilter('periods',   label) },
  noTTO:      { 'item-click': (label) => toggleFilter('periods',   label) },
}))

// ── PowerPoint export ─────────────────────────────────────────────────────────
const showExportDialog = ref(false)
const selectedCharts   = ref([...ALL_IDS])

function getChartTitle(id) {
  return {
    status:     'By Status',
    priority:   'By Priority',
    line:       `Tickets opened by ${period.value}`,
    compliance: `SLA compliance by ${period.value}`,
    noTTO:      'Tickets not taken into account',
    group:      'SLA compliance by group',
    entities:   'Top 10 entities',
  }[id] ?? id
}

function openExportDialog() {
  // Reset to current chart order, all selected
  selectedCharts.value = [...chartOrder.value]
  showExportDialog.value = true
}

function toggleAllExport() {
  selectedCharts.value = selectedCharts.value.length === chartOrder.value.length
    ? []
    : [...chartOrder.value]
}

function runExport() {
  // Export in the same order the user has charts laid out, keeping only selected ones
  const ordered = chartOrder.value.filter(id => selectedCharts.value.includes(id))
  exportToPptx(ordered)
}

async function exportToPptx(ids) {
  exporting.value = true

  // Temporarily hide reorder handles so they don't appear in captures
  const wasReordering = reorderMode.value
  reorderMode.value = false
  await nextTick()

  try {
    const PptxGenJS = (await import('pptxgenjs')).default
    const { toPng }  = await import('html-to-image')

    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_WIDE' // 13.33" × 7.5"

    const isDark  = theme.value === 'dark'
    const bgFill  = isDark ? '0f172a' : 'f1f5f9'
    const accent  = isDark ? '38bdf8' : '0284c7'
    const muted   = isDark ? '94a3b8' : '64748b'

    // ── Title slide ──────────────────────────────────────────────────────────
    const titleSlide = pptx.addSlide()
    titleSlide.background = { fill: bgFill }
    titleSlide.addText('GLPI Metrics', {
      x: 0, y: 2.2, w: '100%', h: 1.6,
      fontSize: 52, bold: true, color: accent, align: 'center',
    })
    titleSlide.addText(new Date().toLocaleString(), {
      x: 0, y: 3.9, w: '100%', h: 0.5,
      fontSize: 15, color: muted, align: 'center',
    })
    if (hasActiveFilters.value) {
      const parts = []
      if (activeFilters.statuses.length)   parts.push(`Status: ${activeFilters.statuses.map(s => STATUS[s]).join(', ')}`)
      if (activeFilters.priorities.length) parts.push(`Priority: ${activeFilters.priorities.map(p => PRIORITY[p]).join(', ')}`)
      if (activeFilters.groups.length)     parts.push(`Group: ${activeFilters.groups.join(', ')}`)
      if (activeFilters.entities.length)   parts.push(`Entity: ${activeFilters.entities.join(', ')}`)
      if (activeFilters.periods.length)    parts.push(`${period.value === 'week' ? 'Week' : 'Month'}: ${activeFilters.periods.join(', ')}`)
      if (activeFilters.compliance)        parts.push(activeFilters.compliance === 'compliant' ? 'Compliant only' : 'Non-compliant only')
      titleSlide.addText(`Filtered by: ${parts.join('  •  ')}`, {
        x: 0.5, y: 4.55, w: 12.33, h: 0.45,
        fontSize: 12, color: accent, align: 'center',
        border: { type: 'solid', color: accent, pt: 1 },
        fill: { color: accent, transparency: 85 },
      })
    }

    // ── One slide per chart ──────────────────────────────────────────────────
    const slideW = 13.33, slideH = 7.5
    const margin = 0.35

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      const el = chartRefs[id]
      if (!el) continue

      const png = await toPng(el, { pixelRatio: 2, skipFonts: true })

      // Compute fitted dimensions keeping aspect ratio
      const { width: px, height: py } = el.getBoundingClientRect()
      const maxW = slideW - margin * 2
      const maxH = slideH - margin * 2
      let w = maxW
      let h = w * (py / px)
      if (h > maxH) { h = maxH; w = h * (px / py) }
      const x = (slideW - w) / 2
      const y = (slideH - h) / 2

      const slide = pptx.addSlide()
      slide.background = { fill: bgFill }
      slide.addImage({ data: png, x, y, w, h })

      // Slide number (bottom-right)
      slide.addText(`${i + 1} / ${ids.length}`, {
        x: slideW - 1.2, y: slideH - 0.35, w: 1.1, h: 0.28,
        fontSize: 9, color: muted, align: 'right',
      })
    }

    const date = new Date().toISOString().slice(0, 10)
    await pptx.writeFile({ fileName: `glpi-metrics-${date}.pptx` })
  } catch (e) {
    console.error('PPT export failed:', e)
  } finally {
    reorderMode.value      = wasReordering
    exporting.value        = false
    showExportDialog.value = false
  }
}

// ── Data loading ─────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  error.value   = null
  try {
    const data = await fetchMetrics()
    metrics.value          = data
    processedTickets.value = data.processedTickets ?? []
    lastUpdated.value      = new Date().toLocaleTimeString()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style>
:root {
  --bg: #0f172a;
  --card-bg: #1e293b;
  --border: #334155;
  --text: #e2e8f0;
  --text-muted: #94a3b8;
  --accent: #38bdf8;
}
:root.light {
  --bg: #f1f5f9;
  --card-bg: #ffffff;
  --border: #e2e8f0;
  --text: #1e293b;
  --text-muted: #64748b;
  --accent: #0284c7;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', system-ui, sans-serif;
  min-height: 100vh;
}
</style>

<style scoped>
.app { min-height: 100vh; display: flex; flex-direction: column; }

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 32px;
  border-bottom: 1px solid var(--border);
}
.app-header h1 {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.02em;
}

.header-actions { display: flex; align-items: center; gap: 8px; }

.export-btn {
  background: none;
  border: 1px solid var(--accent);
  border-radius: 6px;
  color: var(--accent);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.export-btn:hover:not(:disabled) {
  background: var(--accent);
  color: #0f172a;
}
.export-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.theme-btn,
.outline-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 8px 14px;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.theme-btn:hover { border-color: var(--accent); color: var(--accent); }
.outline-btn.active { border-color: var(--accent); color: var(--accent); }

.refresh-btn {
  background: var(--accent);
  color: #0f172a;
  border: none;
  border-radius: 6px;
  padding: 8px 18px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.error-banner {
  margin: 32px;
  padding: 16px 20px;
  background: #7f1d1d;
  border: 1px solid #b91c1c;
  border-radius: 8px;
  color: #fca5a5;
  font-size: 0.9rem;
}

.content {
  flex: 1;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Stat cards */
.stat-row { display: flex; gap: 20px; flex-wrap: wrap; }

.card-wrapper,
.chart-wrapper { position: relative; }

.card-clickable { cursor: pointer; }
.card-clickable:hover { box-shadow: 0 0 0 1px var(--accent); border-radius: 10px; }
.card-active    { box-shadow: 0 0 0 2px var(--accent); border-radius: 10px; }

/* Filter bar */
.filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
  background: var(--card-bg);
  border: 1px solid var(--accent);
  border-radius: 8px;
  font-size: 0.82rem;
}
.filter-label { color: var(--text-muted); font-weight: 600; }
.filter-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border: 1px solid var(--accent);
  border-radius: 4px;
  padding: 2px 8px;
  color: var(--accent);
}
.filter-chip button {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font-size: 14px;
  line-height: 1;
}
.clear-all-btn {
  background: none;
  border: 1px solid var(--text-muted);
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.78rem;
  padding: 2px 10px;
  transition: all 0.15s;
}
.clear-all-btn:hover { border-color: var(--text); color: var(--text); }

/* Period toggle */
.period-toggle { display: flex; gap: 6px; }
.period-toggle button {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.8rem;
  padding: 5px 14px;
  cursor: pointer;
}
.period-toggle button.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #0f172a;
  font-weight: 600;
}

/* Charts grid */
.charts-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

/* Drag & drop */
.card-drag-handle {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 20;
  background: var(--border);
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1;
  padding: 3px 6px;
  cursor: grab;
  user-select: none;
}
.card-drag-handle:active { cursor: grabbing; }

.drag-handle {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 20;
  background: var(--border);
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 16px;
  line-height: 1;
  padding: 4px 8px;
  cursor: grab;
  user-select: none;
}
.drag-handle:active { cursor: grabbing; }

.reorder-mode .card-wrapper { outline: 2px dashed var(--border); border-radius: 10px; }
.reorder-mode .chart-wrapper { outline: 2px dashed var(--border); border-radius: 10px; }
.card-ghost,
.chart-ghost { opacity: 0.3; }

/* Export dialog */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.dialog {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  width: 340px;
  max-width: 90vw;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}
.dialog-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 14px;
}
.dialog-select-all {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 4px;
}
.select-toggle-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0;
}
.dialog-count {
  font-size: 0.78rem;
  color: var(--text-muted);
}
.export-chart-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 8px 0 4px;
  max-height: 320px;
  overflow-y: auto;
}
.export-chart-item label {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.88rem;
  color: var(--text);
  user-select: none;
  transition: background 0.1s;
}
.export-chart-item label:hover { background: rgba(255,255,255,0.05); }
.export-chart-item input[type='checkbox'] {
  accent-color: var(--accent);
  width: 15px;
  height: 15px;
  cursor: pointer;
  flex-shrink: 0;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.app-footer {
  padding: 16px 32px;
  border-top: 1px solid var(--border);
  font-size: 0.78rem;
  color: var(--text-muted);
  text-align: right;
}
</style>
