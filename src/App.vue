<template>
  <div class="app">
    <header class="app-header">
      <div class="header-left">
        <h1>GLPI Metrics</h1>
        <nav class="app-nav">
          <button class="nav-btn" :class="{ active: currentView === 'dashboard' }" @click="currentView = 'dashboard'">Dashboard</button>
          <button class="nav-btn" :class="{ active: currentView === 'tickets' }" @click="currentView = 'tickets'">Tickets by Group</button>
          <button class="nav-btn" :class="{ active: currentView === 'satisfaction' }" @click="currentView = 'satisfaction'; loadSatisfaction()">Satisfaction</button>
        </nav>
      </div>
      <div class="header-actions">
        <button class="theme-btn" @click="theme = theme === 'dark' ? 'light' : 'dark'">
          {{ theme === 'dark' ? 'Light mode' : 'Dark mode' }}
        </button>
        <template v-if="currentView === 'dashboard'">
          <button class="export-btn" :disabled="loading" @click="openExportDialog">Export PPT</button>
        </template>
        <button class="refresh-btn" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div v-if="error && !loading" class="error-banner">
      {{ error }}
    </div>

    <TicketsByGroup v-if="!error && currentView === 'tickets'" :tickets="processedTickets" />

    <Satisfaction
      v-else-if="currentView === 'satisfaction'"
      :records="satisfactionRecords"
      :loading="satisfactionLoading"
      :error="satisfactionError"
      @refresh="loadSatisfaction(true)"
    />

    <main v-else-if="!error && currentView === 'dashboard'" class="content">
      <!-- Summary stat cards -->
      <draggable
        v-model="cardOrder"
        :item-key="id => id"
        tag="section"
        class="stat-row"
        handle=".card-drag-handle"
        ghost-class="card-ghost"
      >
        <template #item="{ element: id }">
          <div
            class="card-wrapper"
            :class="{
              'card-clickable': cardData[id].clickable,
              'card-active': cardData[id].active,
            }"
            @click="handleCardClick(id)"
          >
            <button class="card-drag-handle" title="Drag to reorder">⠿</button>
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
        :item-key="id => id"
        tag="section"
        class="charts-row"
        handle=".drag-handle"
        ghost-class="chart-ghost"
      >
        <template #item="{ element: id }">
          <div
            class="chart-wrapper"
            :style="{
              width: chartSizes[id]?.width != null ? chartSizes[id].width + 'px' : undefined,
              flex:  chartSizes[id]?.width != null ? '0 0 auto' : undefined,
            }"
            :ref="el => { if (el) chartRefs[id] = el; else delete chartRefs[id] }"
          >
            <button class="drag-handle" title="Drag to reorder">⠿</button>
            <component :is="COMP[id]" v-bind="chartProps[id]" v-on="chartEvents[id]" />
            <div
              class="resize-handle"
              @mousedown.prevent="startResize($event, id)"
              @touchstart.prevent="startResize($event, id)"
            />
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
import { ref, computed, reactive, onMounted, onUnmounted, watch, markRaw, nextTick } from 'vue'
import draggable from 'vuedraggable'
import StatCard from './components/StatCard.vue'
import BarChart from './components/BarChart.vue'
import LineChart from './components/LineChart.vue'
import ComplianceChart from './components/ComplianceChart.vue'
import GroupChart from './components/GroupChart.vue'
import WeeklyBarChart from './components/WeeklyBarChart.vue'
import PieChart from './components/PieChart.vue'
import TTOChart from './components/TTOChart.vue'
import MTTRChart from './components/MTTRChart.vue'
import TechTimeChart from './components/TechTimeChart.vue'
import TicketsByGroup from './pages/TicketsByGroup.vue'
import Satisfaction from './pages/Satisfaction.vue'
import { fetchMetrics, fetchSatisfaction, STATUS, PRIORITY } from './api/glpi.js'

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
  tto:        markRaw(TTOChart),
  mttr:       markRaw(MTTRChart),
  group:      markRaw(GroupChart),
  entities:   markRaw(PieChart),
  techTime:   markRaw(TechTimeChart),
}
const ALL_IDS      = ['status', 'priority', 'line', 'compliance', 'noTTO', 'tto', 'mttr', 'group', 'entities', 'techTime']
const ALL_CARD_IDS = ['open', 'total', 'solved', 'compliance', 'compliant', 'nonCompliant', 'avgResolve']
const CHART_ORDER_KEY  = 'glpi-chart-order'
const CARD_ORDER_KEY   = 'glpi-card-order'
const THEME_KEY        = 'glpi-theme'
const CHART_SIZES_KEY  = 'glpi-chart-sizes'
const DEFAULT_HEIGHTS  = { line: 220, compliance: 220, noTTO: 220, tto: 220, mttr: 220, entities: 260, group: null }

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
const currentView = ref('dashboard') // 'dashboard' | 'tickets' | 'satisfaction'
const period      = ref('week')
const loading     = ref(false)
const error       = ref(null)
const lastUpdated = ref(null)
const satisfactionRecords = ref([])
const satisfactionLoading = ref(false)
const satisfactionError   = ref(null)
const exporting   = ref(false)
const chartRefs   = {} // populated via :ref callbacks in the template
const chartOrder  = ref(loadOrder(CHART_ORDER_KEY, ALL_IDS))
const cardOrder   = ref(loadOrder(CARD_ORDER_KEY,  ALL_CARD_IDS))
const theme       = ref(localStorage.getItem(THEME_KEY) ?? 'dark')
const chartSizes  = ref(JSON.parse(localStorage.getItem(CHART_SIZES_KEY) ?? 'null') ?? {})
const resizeState = reactive({ id: null, startX: 0, startY: 0, startW: 0, startH: 0 })

watch(chartOrder, (o) => localStorage.setItem(CHART_ORDER_KEY, JSON.stringify(o)), { deep: true })
watch(cardOrder,  (o) => localStorage.setItem(CARD_ORDER_KEY,  JSON.stringify(o)), { deep: true })
watch(chartSizes, (s) => localStorage.setItem(CHART_SIZES_KEY, JSON.stringify(s)), { deep: true })
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
  const byWeekTTO = {}, byMonthTTO = {}
  const ttoSlaGroups = new Map() // ttoSlaName → { targetH, minSlaTTOMs }
  const byWeekMTTR = {}, byMonthMTTR = {}
  const mttrSlaGroups = new Map() // slaName → { targetH, minSlaTTRMs }
  const byGroupCompliance = {}
  const byEntity = {}
  const byTechGroup = {} // group → { techName → { sum: ms, count } }

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

      // Collect SLA group metadata from every ticket that has an SLA deadline.
      // min(slaTTRMs) per group = most optimistic calendar window ≈ nominal SLA target.
      if (t.slaTTRName != null && t.slaTTRMs != null) {
        if (!mttrSlaGroups.has(t.slaTTRName)) {
          mttrSlaGroups.set(t.slaTTRName, { targetH: t.slaTTRTargetH ?? null, minSlaTTRMs: t.slaTTRMs })
        } else {
          const g = mttrSlaGroups.get(t.slaTTRName)
          if (t.slaTTRTargetH != null && g.targetH === null) g.targetH = t.slaTTRTargetH
          if (t.slaTTRMs < g.minSlaTTRMs) g.minSlaTTRMs = t.slaTTRMs
        }
      }

      if (t.resolveMs != null) {
        const slaKey = t.slaTTRName ?? 'No SLA'
        if (!mttrSlaGroups.has(slaKey)) mttrSlaGroups.set(slaKey, { targetH: null, minSlaTTRMs: null })

        if (!byWeekMTTR[t.week])          byWeekMTTR[t.week]          = {}
        if (!byWeekMTTR[t.week][slaKey])  byWeekMTTR[t.week][slaKey]  = { sum: 0, count: 0 }
        byWeekMTTR[t.week][slaKey].sum += t.resolveMs; byWeekMTTR[t.week][slaKey].count++

        if (!byMonthMTTR[t.month])         byMonthMTTR[t.month]         = {}
        if (!byMonthMTTR[t.month][slaKey]) byMonthMTTR[t.month][slaKey] = { sum: 0, count: 0 }
        byMonthMTTR[t.month][slaKey].sum += t.resolveMs; byMonthMTTR[t.month][slaKey].count++
      }

      // Collect TTO SLA group metadata from every ticket that has a TTO deadline
      if (t.ttoSlaName != null && t.slaTTOMs != null) {
        if (!ttoSlaGroups.has(t.ttoSlaName)) {
          ttoSlaGroups.set(t.ttoSlaName, { targetH: t.ttoSlaTargetH ?? null, minSlaTTOMs: t.slaTTOMs })
        } else {
          const g = ttoSlaGroups.get(t.ttoSlaName)
          if (t.ttoSlaTargetH != null && g.targetH === null) g.targetH = t.ttoSlaTargetH
          if (t.slaTTOMs < g.minSlaTTOMs) g.minSlaTTOMs = t.slaTTOMs
        }
      }

      if (t.actualTTOMs != null) {
        const slaKey = t.ttoSlaName ?? 'No SLA'
        if (!ttoSlaGroups.has(slaKey)) ttoSlaGroups.set(slaKey, { targetH: null, minSlaTTOMs: null })

        if (!byWeekTTO[t.week])          byWeekTTO[t.week]          = {}
        if (!byWeekTTO[t.week][slaKey])  byWeekTTO[t.week][slaKey]  = { sum: 0, count: 0 }
        byWeekTTO[t.week][slaKey].sum += t.actualTTOMs; byWeekTTO[t.week][slaKey].count++

        if (!byMonthTTO[t.month])         byMonthTTO[t.month]         = {}
        if (!byMonthTTO[t.month][slaKey]) byMonthTTO[t.month][slaKey] = { sum: 0, count: 0 }
        byMonthTTO[t.month][slaKey].sum += t.actualTTOMs; byMonthTTO[t.month][slaKey].count++
      }
    }

    if (!byGroupCompliance[t.group]) byGroupCompliance[t.group] = { compliant: 0, nonCompliant: 0 }
    if (t.breached) byGroupCompliance[t.group].nonCompliant++
    else            byGroupCompliance[t.group].compliant++

    byEntity[t.entity] = (byEntity[t.entity] ?? 0) + 1

    if (t.resolveMs != null && t.techName) {
      if (!byTechGroup[t.group]) byTechGroup[t.group] = {}
      const tg = byTechGroup[t.group]
      if (!tg[t.techName]) tg[t.techName] = { sum: 0, count: 0 }
      tg[t.techName].sum   += t.resolveMs
      tg[t.techName].count += 1
    }
  }

  const sort = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
  const toMTTRAvg = (raw) => Object.fromEntries(
    Object.entries(raw).sort(([a], [b]) => a.localeCompare(b)).map(([period, bySla]) => [
      period,
      Object.fromEntries(
        Object.entries(bySla).map(([name, v]) => [name,
          v.count > 0 ? +(v.sum / v.count / 3600000).toFixed(1) : null
        ])
      ),
    ])
  )
  const toTTOAvg = (raw) => Object.fromEntries(
    Object.entries(raw).sort(([a], [b]) => a.localeCompare(b)).map(([period, bySla]) => [
      period,
      Object.fromEntries(
        Object.entries(bySla).map(([name, v]) => [name,
          v.count > 0 ? +(v.sum / v.count / 3600000).toFixed(1) : null
        ])
      ),
    ])
  )

  return {
    byStatus,
    byPriority,
    byWeek:             sort(byWeek),
    byMonth:            sort(byMonth),
    byWeekCompliance:   sort(byWeekCompliance),
    byMonthCompliance:  sort(byMonthCompliance),
    byWeekNoTTO:        sort(byWeekNoTTO),
    byMonthNoTTO:       sort(byMonthNoTTO),
    byWeekTTO:          toTTOAvg(byWeekTTO),
    byMonthTTO:         toTTOAvg(byMonthTTO),
    ttoSlaGroups: [...ttoSlaGroups.entries()].map(([name, g]) => ({
      name,
      targetH: g.targetH ?? (g.minSlaTTOMs != null ? +(g.minSlaTTOMs / 3600000).toFixed(1) : null),
    })),
    byWeekMTTR:         toMTTRAvg(byWeekMTTR),
    byMonthMTTR:        toMTTRAvg(byMonthMTTR),
    mttrSlaGroups: [...mttrSlaGroups.entries()].map(([name, g]) => ({
      name,
      targetH: g.targetH ?? (g.minSlaTTRMs != null ? +(g.minSlaTTRMs / 3600000).toFixed(1) : null),
    })),
    byGroupCompliance,
    topEntities: Object.entries(byEntity).sort(([, a], [, b]) => b - a).slice(0, 10),
    techGroups: Object.entries(byTechGroup)
      .map(([group, techs]) => {
        const techList = Object.entries(techs)
          .map(([name, v]) => ({ name, avgDays: +(v.sum / v.count / 86400000).toFixed(2), count: v.count }))
          .sort((a, b) => b.avgDays - a.avgDays)
        const groupSum   = Object.values(techs).reduce((s, v) => s + v.sum, 0)
        const groupCount = Object.values(techs).reduce((s, v) => s + v.count, 0)
        return { group, avgDays: +(groupSum / groupCount / 86400000).toFixed(2), count: groupCount, techs: techList }
      })
      .sort((a, b) => b.avgDays - a.avgDays),
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

const mttrChartData = computed(() => {
  const byMTTR  = period.value === 'week' ? timeChartMetrics.value.byWeekMTTR  : timeChartMetrics.value.byMonthMTTR
  const labels  = Object.keys(period.value === 'week' ? timeChartMetrics.value.byWeek : timeChartMetrics.value.byMonth)
  const groups  = timeChartMetrics.value.mttrSlaGroups ?? []
  return {
    labels,
    datasets: groups.map(g => ({
      name:    g.name,
      targetH: g.targetH,
      data:    labels.map(p => byMTTR[p]?.[g.name] ?? null),
    })),
  }
})

const ttoChartData = computed(() => {
  const byTTO  = period.value === 'week' ? timeChartMetrics.value.byWeekTTO  : timeChartMetrics.value.byMonthTTO
  const labels = Object.keys(period.value === 'week' ? timeChartMetrics.value.byWeek : timeChartMetrics.value.byMonth)
  const groups = timeChartMetrics.value.ttoSlaGroups ?? []
  return {
    labels,
    datasets: groups.map(g => ({
      name:    g.name,
      targetH: g.targetH,
      data:    labels.map(p => byTTO[p]?.[g.name] ?? null),
    })),
  }
})

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
    height:            heightFor('line'),
  },
  compliance: {
    title:             period.value === 'week' ? 'SLA compliance by week' : 'SLA compliance by month',
    weekData:          periodCompliance.value,
    theme:             theme.value,
    highlightedPeriods: activeFilters.periods,
    height:            heightFor('compliance'),
  },
  noTTO: {
    title:             'Tickets not taken into account',
    labels:            periodNoTTOLabels.value,
    data:              periodNoTTOData.value,
    color:             'rgba(245,158,11,0.8)',
    theme:             theme.value,
    highlightedPeriods: activeFilters.periods,
    height:            heightFor('noTTO'),
  },
  tto: {
    title:  period.value === 'week' ? 'Avg. TTO by SLA type — weekly' : 'Avg. TTO by SLA type — monthly',
    ...ttoChartData.value,
    theme:  theme.value,
    height: heightFor('tto'),
  },
  mttr: {
    title:             period.value === 'week' ? 'MTTR by SLA type — weekly' : 'MTTR by SLA type — monthly',
    ...mttrChartData.value,
    theme:             theme.value,
    highlightedPeriods: activeFilters.periods,
    height:            heightFor('mttr'),
  },
  group: {
    title:  'SLA compliance by group',
    groups: groupComplianceData.value,
    theme:  theme.value,
    height: heightFor('group'),
  },
  entities: {
    title: 'Top 10 entities',
    items: chartMetrics.value.topEntities,
    theme: theme.value,
    height: heightFor('entities'),
  },
  techTime: {
    title: 'Avg. handling time per technician',
    groups: chartMetrics.value.techGroups ?? [],
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
  tto:        { 'item-click': (label) => toggleFilter('periods',   label) },
  mttr:       { 'item-click': (label) => toggleFilter('periods',   label) },
  techTime:   {},
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
    tto:        'Avg. time to first response',
    mttr:       'MTTR — avg. resolution time',
    group:      'SLA compliance by group',
    entities:   'Top 10 entities',
    techTime:   'Avg. handling time per technician',
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
    const SCALE = 3

    // html-to-image captures canvas elements at their native pixel size then
    // upscales — blurry. Fix: swap each canvas for a pre-scaled copy, capture,
    // then restore.
    async function captureEl(el) {
      const restored = []
      for (const canvas of el.querySelectorAll('canvas')) {
        const hd = document.createElement('canvas')
        hd.width  = canvas.offsetWidth  * SCALE
        hd.height = canvas.offsetHeight * SCALE
        hd.style.cssText = canvas.style.cssText
        hd.getContext('2d').drawImage(canvas, 0, 0, hd.width, hd.height)
        canvas.replaceWith(hd)
        restored.push({ hd, canvas })
      }
      const png = await toPng(el, { pixelRatio: SCALE, skipFonts: true })
      for (const { hd, canvas } of restored) hd.replaceWith(canvas)
      return png
    }

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      const el = chartRefs[id]
      if (!el) continue

      const png = await captureEl(el)

      const { width: px, height: py } = el.getBoundingClientRect()
      let w = slideW
      let h = w * (py / px)
      if (h > slideH) { h = slideH; w = h * (px / py) }
      const x = (slideW - w) / 2
      const y = (slideH - h) / 2

      const slide = pptx.addSlide()
      slide.background = { fill: bgFill }
      slide.addImage({ data: png, x, y, w, h })
    }

    const date = new Date().toISOString().slice(0, 10)
    await pptx.writeFile({ fileName: `glpi-metrics-${date}.pptx` })
  } catch (e) {
    console.error('PPT export failed:', e)
  } finally {
    exporting.value        = false
    showExportDialog.value = false
  }
}

// ── Chart resize ──────────────────────────────────────────────────────────────
function heightFor(id) {
  const saved = chartSizes.value[id]?.height
  return saved !== undefined ? saved : DEFAULT_HEIGHTS[id]
}

function startResize(e, id) {
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  const el = chartRefs[id]
  let currentH = chartSizes.value[id]?.height ?? DEFAULT_HEIGHTS[id]
  if (currentH == null) {
    const wrap = el?.querySelector('.canvas-wrap')
    currentH = wrap ? wrap.offsetHeight : 200
  }
  resizeState.id = id
  resizeState.startX = clientX
  resizeState.startY = clientY
  resizeState.startW = chartSizes.value[id]?.width ?? el?.offsetWidth ?? 400
  resizeState.startH = currentH
}

function onResizeMove(e) {
  if (!resizeState.id) return
  if (e.cancelable) e.preventDefault()
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  const newW = Math.min(Math.max(resizeState.startW + (clientX - resizeState.startX), 280), 2000)
  const newH = Math.min(Math.max(resizeState.startH + (clientY - resizeState.startY), 150), 1000)
  if (!chartSizes.value[resizeState.id]) chartSizes.value[resizeState.id] = {}
  chartSizes.value[resizeState.id].width = newW
  chartSizes.value[resizeState.id].height = newH
}

function onResizeEnd() {
  resizeState.id = null
}

// ── Data loading ─────────────────────────────────────────────────────────────
async function loadSatisfaction(force = false) {
  if (satisfactionLoading.value) return
  if (!force && satisfactionRecords.value.length > 0) return
  satisfactionLoading.value = true
  satisfactionError.value   = null
  try {
    satisfactionRecords.value = await fetchSatisfaction()
  } catch (e) {
    satisfactionError.value = e.message
  } finally {
    satisfactionLoading.value = false
  }
}

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

onMounted(() => {
  load()
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  document.addEventListener('touchmove', onResizeMove, { passive: false })
  document.addEventListener('touchend', onResizeEnd)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
  document.removeEventListener('touchmove', onResizeMove)
  document.removeEventListener('touchend', onResizeEnd)
})
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
  padding: 16px 32px;
  border-bottom: 1px solid var(--border);
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 24px;
}

.app-header h1 {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.app-nav {
  display: flex;
  gap: 2px;
}

.nav-btn {
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 500;
  padding: 7px 14px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.nav-btn:hover { background: rgba(255,255,255,0.06); color: var(--text); }
.nav-btn.active { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); font-weight: 600; }

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

.card-wrapper { position: relative; }
.chart-wrapper {
  position: relative;
  flex: 1 1 calc(50% - 10px);
  min-width: 280px;
}

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

/* Charts */
.charts-row {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

/* Drag & drop */
.card-drag-handle {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  background: var(--border);
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1;
  padding: 2px 6px;
  cursor: grab;
  user-select: none;
  opacity: 0;
  transition: opacity 0.15s;
}
.card-drag-handle:active { cursor: grabbing; }
.card-wrapper:hover .card-drag-handle { opacity: 1; }

.drag-handle {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  background: var(--border);
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  padding: 3px 8px;
  cursor: grab;
  user-select: none;
  opacity: 0;
  transition: opacity 0.15s;
}
.drag-handle:active { cursor: grabbing; }
.chart-wrapper:hover .drag-handle { opacity: 1; }

.resize-handle {
  position: absolute;
  bottom: 6px;
  right: 6px;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  opacity: 0.4;
  background-image: radial-gradient(circle, var(--text-muted) 1.5px, transparent 1.5px);
  background-size: 5px 5px;
  transition: opacity 0.2s;
}
.resize-handle:hover { opacity: 1; }

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
