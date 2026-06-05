<template>
  <main class="content">
    <!-- Summary stat cards -->
    <div ref="statRowRef">
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
          <button class="card-drag-handle" title="Glisser pour réordonner">⠿</button>
          <StatCard :label="cardData[id].label" :value="cardData[id].value" />
        </div>
      </template>
    </draggable>
    </div>

    <!-- Active filter bar -->
    <div v-if="hasActiveFilters" class="filter-bar">
      <span class="filter-label">Filtres :</span>
      <span v-if="activeFilters.statuses.length" class="ori-tag ori-tag--info">
        Statut : {{ activeFilters.statuses.map(s => STATUS[s]).join(', ') }}
        <button class="ori-tag__remove" @click.stop="activeFilters.statuses.length = 0" aria-label="Retirer">×</button>
      </span>
      <span v-if="activeFilters.priorities.length" class="ori-tag ori-tag--info">
        Priorité : {{ activeFilters.priorities.map(p => PRIORITY[p]).join(', ') }}
        <button class="ori-tag__remove" @click.stop="activeFilters.priorities.length = 0" aria-label="Retirer">×</button>
      </span>
      <span v-if="activeFilters.groups.length" class="ori-tag ori-tag--info">
        Groupe : {{ activeFilters.groups.join(', ') }}
        <button class="ori-tag__remove" @click.stop="activeFilters.groups.length = 0" aria-label="Retirer">×</button>
      </span>
      <span v-if="activeFilters.entities.length" class="ori-tag ori-tag--info">
        Entité : {{ activeFilters.entities.join(', ') }}
        <button class="ori-tag__remove" @click.stop="activeFilters.entities.length = 0" aria-label="Retirer">×</button>
      </span>
      <span v-if="activeFilters.periods.length" class="ori-tag ori-tag--info">
        {{ period === 'week' ? 'Semaine' : period === 'month' ? 'Mois' : period === 'quarter' ? 'Trimestre' : 'Semaine' }} : {{ activeFilters.periods.join(', ') }}
        <button class="ori-tag__remove" @click.stop="activeFilters.periods.length = 0" aria-label="Retirer">×</button>
      </span>
      <span v-if="activeFilters.compliance" class="ori-tag ori-tag--info">
        {{ activeFilters.compliance === 'compliant' ? 'Conformes seulement' : 'Non conformes seulement' }}
        <button class="ori-tag__remove" @click.stop="activeFilters.compliance = null" aria-label="Retirer">×</button>
      </span>
      <button class="ori-button ori-button--ghost ori-button--sm" @click="clearFilters">Tout effacer</button>
    </div>

    <!-- Period toggle -->
    <div class="ori-tabs__list period-toggle">
      <button class="ori-tabs__tab" :class="{ 'ori-tabs__tab--active': period === 'week' }" @click="period = 'week'">Hebdomadaire</button>
      <button class="ori-tabs__tab" :class="{ 'ori-tabs__tab--active': period === 'month' }" @click="period = 'month'">Mensuel</button>
      <button class="ori-tabs__tab" :class="{ 'ori-tabs__tab--active': period === 'quarter' }" @click="period = 'quarter'">Trimestriel</button>
      <button class="ori-tabs__tab" :class="{ 'ori-tabs__tab--active': period === 'last4weeks' }" @click="period = 'last4weeks'">4 dernières semaines</button>
    </div>

    <!-- Export PPT button -->
    <div class="dashboard-actions">
      <button class="ori-button ori-button--secondary ori-button--sm" :disabled="loading" @click="openExportDialog">Exporter PPT</button>
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
            gridColumn: `span ${spanFor(id).col}`,
            gridRow:    `span ${spanFor(id).row}`,
          }"
          :ref="el => { if (el) chartRefs[id] = el; else delete chartRefs[id] }"
        >
          <button class="drag-handle" title="Glisser pour réordonner">⠿</button>
          <component :is="COMP[id]" v-bind="chartProps[id]" v-on="chartEvents[id]" />
          <div
            class="resize-handle"
            @mousedown.prevent="startResize($event, id)"
            @touchstart.prevent="startResize($event, id)"
          />
        </div>
      </template>
    </draggable>

    <!-- Export PPT dialog -->
    <div v-if="showExportDialog" class="dialog-overlay" @click.self="showExportDialog = false">
      <div class="dialog">
        <h3 class="dialog-title">Exporter en PowerPoint</h3>

        <!-- Stat cards row -->
        <div class="export-section-label">Cartes de statistiques</div>
        <div class="export-row">
          <input type="checkbox" v-model="exportStatCards" class="export-checkbox" />
          <input type="text" v-model="exportStatTitle" class="export-title-input" :disabled="!exportStatCards" placeholder="Titre de la diapositive" />
        </div>

        <!-- Charts -->
        <div class="export-section-label" style="margin-top:14px">
          Graphiques
          <button class="select-toggle-btn" @click="toggleAllExport">
            {{ selectedCharts.length === chartOrder.length ? 'Tout désélectionner' : 'Tout sélectionner' }}
          </button>
        </div>
        <ul class="export-chart-list">
          <li v-for="id in chartOrder" :key="id" class="export-row">
            <input type="checkbox" :value="id" v-model="selectedCharts" class="export-checkbox" />
            <input type="text" v-model="exportTitles[id]" class="export-title-input" :disabled="!selectedCharts.includes(id)" placeholder="Titre de la diapositive" />
          </li>
        </ul>

        <div class="dialog-footer">
          <span class="dialog-count">{{ exportSlideCount }} diapositive{{ exportSlideCount === 1 ? '' : 's' }}</span>
          <button class="ori-button ori-button--ghost" @click="showExportDialog = false">Annuler</button>
          <button
            class="ori-button ori-button--primary"
            :disabled="exportSlideCount === 0 || exporting"
            @click="runExport"
          >
            {{ exporting ? 'Exportation…' : 'Exporter' }}
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, reactive, inject, onMounted, onUnmounted, watch, markRaw, nextTick } from 'vue'
import draggable from 'vuedraggable'
import StatCard from '../components/StatCard.vue'
import BarChart from '../components/BarChart.vue'
import LineChart from '../components/LineChart.vue'
import ComplianceChart from '../components/ComplianceChart.vue'
import GroupChart from '../components/GroupChart.vue'
import WeeklyBarChart from '../components/WeeklyBarChart.vue'
import PieChart from '../components/PieChart.vue'
import TTOChart from '../components/TTOChart.vue'
import MTTRChart from '../components/MTTRChart.vue'
import TechTimeChart from '../components/TechTimeChart.vue'
import { STATUS, PRIORITY } from '../api/glpi.js'

// ── Injected shared state ─────────────────────────────────────────────────────
const metrics          = inject('metrics')
const processedTickets = inject('processedTickets')
const loading          = inject('loading')
const theme            = inject('theme')

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
const OPEN_STS   = [1, 2, 3, 4]
const CLOSED_STS = [5, 6]

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
const CHART_SPANS_KEY  = 'glpi-chart-spans'
const GRID_COLS   = 12
const GRID_ROW_H  = 60
const GRID_GAP    = 20
const DEFAULT_SPANS = {
  status:     { col: 6, row: 4 },
  priority:   { col: 6, row: 4 },
  line:       { col: 6, row: 4 },
  compliance: { col: 6, row: 4 },
  noTTO:      { col: 6, row: 4 },
  tto:        { col: 6, row: 5 },
  mttr:       { col: 6, row: 5 },
  group:      { col: 6, row: 5 },
  entities:   { col: 6, row: 5 },
  techTime:   { col: 6, row: 5 },
}

function loadOrder(key, defaults) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (Array.isArray(saved) && saved.length === defaults.length && defaults.every(id => saved.includes(id)))
      return saved
  } catch {}
  return [...defaults]
}

// ── UI state ─────────────────────────────────────────────────────────────────
const period      = ref('week')
const statRowRef  = ref(null)
const exportTitles    = ref({})
const exportStatCards = ref(true)
const exportStatTitle = ref('Key Metrics')
const chartRefs   = {}
const chartOrder  = ref(loadOrder(CHART_ORDER_KEY, ALL_IDS))
const cardOrder   = ref(loadOrder(CARD_ORDER_KEY,  ALL_CARD_IDS))
const chartSizes  = ref(JSON.parse(localStorage.getItem(CHART_SPANS_KEY) ?? 'null') ?? {})
const resizeState = reactive({ id: null, startX: 0, startY: 0, startCol: 0, startRow: 0, cellW: 0 })
watch(chartOrder, (o) => localStorage.setItem(CHART_ORDER_KEY, JSON.stringify(o)), { deep: true })
watch(cardOrder,  (o) => localStorage.setItem(CARD_ORDER_KEY,  JSON.stringify(o)), { deep: true })
watch(chartSizes, (s) => localStorage.setItem(CHART_SPANS_KEY, JSON.stringify(s)), { deep: true })

// ── Cross-filter state ────────────────────────────────────────────────────────
const activeFilters = reactive({
  statuses:   [],
  priorities: [],
  groups:     [],
  entities:   [],
  compliance: null,
  periods:    [],
})

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

const filteredTickets = computed(() => {
  let ts = baseFilteredTickets.value
  if (period.value === 'last4weeks') {
    const keys = new Set(last4WeekKeys.value)
    ts = ts.filter(t => keys.has(t.week))
  }
  if (activeFilters.periods.length) {
    const field = period.value === 'month' ? 'month' : period.value === 'quarter' ? 'quarter' : 'week'
    ts = ts.filter(t => activeFilters.periods.includes(t[field]))
  }
  return ts
})

function computeChartMetrics(tickets) {
  const byStatus = {}, byPriority = {}
  const byWeek = {}, byMonth = {}, byQuarter = {}
  const byWeekCompliance = {}, byMonthCompliance = {}, byQuarterCompliance = {}
  const byWeekNoTTO = {}, byMonthNoTTO = {}, byQuarterNoTTO = {}
  const byWeekTTO = {}, byMonthTTO = {}, byQuarterTTO = {}
  const ttoSlaGroups = new Map()
  const byWeekMTTR = {}, byMonthMTTR = {}, byQuarterMTTR = {}
  const mttrSlaGroups = new Map()
  const byGroupCompliance = {}
  const byGroupWeekCompliance = {}
  const byGroupMonthCompliance = {}
  const byGroupQuarterCompliance = {}
  const byEntity = {}
  const byTechGroup = {}

  for (const t of tickets) {
    byStatus[t.status]     = (byStatus[t.status]     ?? 0) + 1
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1

    if (t.week) {
      const tq = t.quarter ?? `${t.month.slice(0, 4)}-Q${Math.ceil(Number(t.month.slice(5, 7)) / 3)}`
      byWeek[t.week]     = (byWeek[t.week]     ?? 0) + 1
      byMonth[t.month]   = (byMonth[t.month]   ?? 0) + 1
      byQuarter[tq]      = (byQuarter[tq]       ?? 0) + 1

      if (!byWeekCompliance[t.week])    byWeekCompliance[t.week]    = { compliant: 0, nonCompliant: 0 }
      if (!byMonthCompliance[t.month])  byMonthCompliance[t.month]  = { compliant: 0, nonCompliant: 0 }
      if (!byQuarterCompliance[tq])     byQuarterCompliance[tq]     = { compliant: 0, nonCompliant: 0 }
      if (t.breached) { byWeekCompliance[t.week].nonCompliant++; byMonthCompliance[t.month].nonCompliant++; byQuarterCompliance[tq].nonCompliant++ }
      else            { byWeekCompliance[t.week].compliant++;    byMonthCompliance[t.month].compliant++;    byQuarterCompliance[tq].compliant++ }

      if (t.hasNoTTO && t.status !== 5 && t.status !== 6) {
        byWeekNoTTO[t.week]   = (byWeekNoTTO[t.week]   ?? 0) + 1
        byMonthNoTTO[t.month] = (byMonthNoTTO[t.month] ?? 0) + 1
        byQuarterNoTTO[tq]    = (byQuarterNoTTO[tq]    ?? 0) + 1
      }

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

        if (!byQuarterMTTR[tq])          byQuarterMTTR[tq]          = {}
        if (!byQuarterMTTR[tq][slaKey])  byQuarterMTTR[tq][slaKey]  = { sum: 0, count: 0 }
        byQuarterMTTR[tq][slaKey].sum += t.resolveMs; byQuarterMTTR[tq][slaKey].count++
      }

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

        if (!byQuarterTTO[tq])          byQuarterTTO[tq]          = {}
        if (!byQuarterTTO[tq][slaKey])  byQuarterTTO[tq][slaKey]  = { sum: 0, count: 0 }
        byQuarterTTO[tq][slaKey].sum += t.actualTTOMs; byQuarterTTO[tq][slaKey].count++
      }
    }

    if (!byGroupCompliance[t.group]) byGroupCompliance[t.group] = { compliant: 0, nonCompliant: 0 }
    if (t.breached) byGroupCompliance[t.group].nonCompliant++
    else            byGroupCompliance[t.group].compliant++

    if (t.week) {
      const tq = t.quarter ?? `${t.month.slice(0, 4)}-Q${Math.ceil(Number(t.month.slice(5, 7)) / 3)}`

      if (!byGroupWeekCompliance[t.group]) byGroupWeekCompliance[t.group] = {}
      if (!byGroupWeekCompliance[t.group][t.week]) byGroupWeekCompliance[t.group][t.week] = { compliant: 0, nonCompliant: 0 }
      if (t.breached) byGroupWeekCompliance[t.group][t.week].nonCompliant++
      else            byGroupWeekCompliance[t.group][t.week].compliant++

      if (!byGroupMonthCompliance[t.group]) byGroupMonthCompliance[t.group] = {}
      if (!byGroupMonthCompliance[t.group][t.month]) byGroupMonthCompliance[t.group][t.month] = { compliant: 0, nonCompliant: 0 }
      if (t.breached) byGroupMonthCompliance[t.group][t.month].nonCompliant++
      else            byGroupMonthCompliance[t.group][t.month].compliant++

      if (!byGroupQuarterCompliance[t.group]) byGroupQuarterCompliance[t.group] = {}
      if (!byGroupQuarterCompliance[t.group][tq]) byGroupQuarterCompliance[t.group][tq] = { compliant: 0, nonCompliant: 0 }
      if (t.breached) byGroupQuarterCompliance[t.group][tq].nonCompliant++
      else            byGroupQuarterCompliance[t.group][tq].compliant++
    }

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
    byWeek:              sort(byWeek),
    byMonth:             sort(byMonth),
    byQuarter:           sort(byQuarter),
    byWeekCompliance:    sort(byWeekCompliance),
    byMonthCompliance:   sort(byMonthCompliance),
    byQuarterCompliance: sort(byQuarterCompliance),
    byWeekNoTTO:         sort(byWeekNoTTO),
    byMonthNoTTO:        sort(byMonthNoTTO),
    byQuarterNoTTO:      sort(byQuarterNoTTO),
    byWeekTTO:           toTTOAvg(byWeekTTO),
    byMonthTTO:          toTTOAvg(byMonthTTO),
    byQuarterTTO:        toTTOAvg(byQuarterTTO),
    ttoSlaGroups: [...ttoSlaGroups.entries()].map(([name, g]) => ({
      name,
      targetH: g.targetH ?? (g.minSlaTTOMs != null ? +(g.minSlaTTOMs / 3600000).toFixed(1) : null),
    })),
    byWeekMTTR:          toMTTRAvg(byWeekMTTR),
    byMonthMTTR:         toMTTRAvg(byMonthMTTR),
    byQuarterMTTR:       toMTTRAvg(byQuarterMTTR),
    mttrSlaGroups: [...mttrSlaGroups.entries()].map(([name, g]) => ({
      name,
      targetH: g.targetH ?? (g.minSlaTTRMs != null ? +(g.minSlaTTRMs / 3600000).toFixed(1) : null),
    })),
    byGroupCompliance,
    byGroupWeekCompliance,
    byGroupMonthCompliance,
    byGroupQuarterCompliance,
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
const timeChartMetrics = computed(() => computeChartMetrics(baseFilteredTickets.value))

// ── Stat card computeds ───────────────────────────────────────────────────────
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
    open:         { label: 'Tickets ouverts',     value: v(s.open),                                clickable: true,  active: cardActive.value.open },
    total:        { label: 'Total tickets',        value: v(s.total),                               clickable: false, active: false },
    solved:       { label: 'Clôturés / Résolus',   value: v(s.solved),                             clickable: true,  active: cardActive.value.solved },
    compliance:   { label: 'Conformité SLA',       value: v(s.pct),                                 clickable: false, active: false },
    compliant:    { label: 'Conformes',             value: v(s.compliant),                           clickable: true,  active: cardActive.value.compliant },
    nonCompliant: { label: 'Non conformes',         value: v(s.nonCompliant),                        clickable: true,  active: cardActive.value.nonCompliant },
    avgResolve:   { label: 'Rés. moyenne',          value: v(s.avgH === null ? '—' : `${s.avgH}h`), clickable: false, active: false },
  }
})

// ── Chart data computeds ──────────────────────────────────────────────────────
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

const last4WeekKeys = computed(() => {
  const allWeeks = Object.keys(timeChartMetrics.value.byWeek)
  return allWeeks.slice(-4)
})

const periodSrc = (week, month, quarter) => {
  if (period.value === 'week')    return week
  if (period.value === 'month')   return month
  if (period.value === 'quarter') return quarter
  // last4weeks: filter week data to the 4 most recent week keys
  const keys = new Set(last4WeekKeys.value)
  return Object.fromEntries(Object.entries(week).filter(([k]) => keys.has(k)))
}

const periodLabels = computed(() =>
  Object.keys(periodSrc(timeChartMetrics.value.byWeek, timeChartMetrics.value.byMonth, timeChartMetrics.value.byQuarter))
)
const periodData = computed(() =>
  Object.values(periodSrc(timeChartMetrics.value.byWeek, timeChartMetrics.value.byMonth, timeChartMetrics.value.byQuarter))
)
const periodCompliance = computed(() => {
  const src = periodSrc(timeChartMetrics.value.byWeekCompliance, timeChartMetrics.value.byMonthCompliance, timeChartMetrics.value.byQuarterCompliance)
  return Object.entries(src).map(([week, v]) => ({ week, ...v }))
})
const periodNoTTOLabels = computed(() =>
  Object.keys(periodSrc(timeChartMetrics.value.byWeekNoTTO, timeChartMetrics.value.byMonthNoTTO, timeChartMetrics.value.byQuarterNoTTO))
)
const periodNoTTOData = computed(() =>
  Object.values(periodSrc(timeChartMetrics.value.byWeekNoTTO, timeChartMetrics.value.byMonthNoTTO, timeChartMetrics.value.byQuarterNoTTO))
)
const groupComplianceData = computed(() =>
  Object.entries(chartMetrics.value.byGroupCompliance)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.compliant + b.nonCompliant - (a.compliant + a.nonCompliant))
)

const groupWeekComplianceData = computed(() => {
  let src = period.value === 'last4weeks'
    ? timeChartMetrics.value.byGroupWeekCompliance
    : periodSrc(
        timeChartMetrics.value.byGroupWeekCompliance,
        timeChartMetrics.value.byGroupMonthCompliance,
        timeChartMetrics.value.byGroupQuarterCompliance,
      )
  if (period.value === 'last4weeks') {
    const keys = new Set(last4WeekKeys.value)
    src = Object.fromEntries(
      Object.entries(src ?? {}).map(([g, wm]) => [g, Object.fromEntries(Object.entries(wm).filter(([k]) => keys.has(k)))])
    )
  }
  return Object.entries(src ?? {})
    .map(([name, weekMap]) => ({ name, weekMap }))
    .sort((a, b) => {
      const sumA = Object.values(a.weekMap).reduce((s, v) => s + v.compliant + v.nonCompliant, 0)
      const sumB = Object.values(b.weekMap).reduce((s, v) => s + v.compliant + v.nonCompliant, 0)
      return sumB - sumA
    })
})

const mttrChartData = computed(() => {
  const byMTTR = periodSrc(timeChartMetrics.value.byWeekMTTR, timeChartMetrics.value.byMonthMTTR, timeChartMetrics.value.byQuarterMTTR)
  const labels = Object.keys(periodSrc(timeChartMetrics.value.byWeek, timeChartMetrics.value.byMonth, timeChartMetrics.value.byQuarter))
  const groups = timeChartMetrics.value.mttrSlaGroups ?? []
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
  const byTTO  = periodSrc(timeChartMetrics.value.byWeekTTO, timeChartMetrics.value.byMonthTTO, timeChartMetrics.value.byQuarterTTO)
  const labels = Object.keys(periodSrc(timeChartMetrics.value.byWeek, timeChartMetrics.value.byMonth, timeChartMetrics.value.byQuarter))
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

const chartProps = computed(() => ({
  status:   { title: 'Par statut',   items: statusItems.value },
  priority: { title: 'Par priorité', items: priorityItems.value },
  line: {
    title:              period.value === 'month' ? 'Tickets ouverts par mois' : period.value === 'quarter' ? 'Tickets ouverts par trimestre' : period.value === 'last4weeks' ? 'Tickets ouverts — 4 dernières semaines' : 'Tickets ouverts par semaine',
    labels:             periodLabels.value,
    data:               periodData.value,
    theme:              theme.value,
    highlightedPeriods: activeFilters.periods,
  },
  compliance: {
    title:              period.value === 'month' ? 'Conformité SLA par mois' : period.value === 'quarter' ? 'Conformité SLA par trimestre' : period.value === 'last4weeks' ? 'Conformité SLA — 4 dernières semaines' : 'Conformité SLA par semaine',
    weekData:           periodCompliance.value,
    theme:              theme.value,
    highlightedPeriods: activeFilters.periods,
  },
  noTTO: {
    title:              'Tickets non pris en compte',
    labels:             periodNoTTOLabels.value,
    data:               periodNoTTOData.value,
    color:              'rgba(245,158,11,0.8)',
    theme:              theme.value,
    highlightedPeriods: activeFilters.periods,
  },
  tto: {
    title:  period.value === 'month' ? 'TTO moy. par type SLA — mensuel' : period.value === 'quarter' ? 'TTO moy. par type SLA — trimestriel' : period.value === 'last4weeks' ? 'TTO moy. par type SLA — 4 sem.' : 'TTO moy. par type SLA — hebdo.',
    ...ttoChartData.value,
    theme:  theme.value,
  },
  mttr: {
    title:              period.value === 'month' ? 'MTTR par type SLA — mensuel' : period.value === 'quarter' ? 'MTTR par type SLA — trimestriel' : period.value === 'last4weeks' ? 'MTTR par type SLA — 4 sem.' : 'MTTR par type SLA — hebdo.',
    ...mttrChartData.value,
    theme:              theme.value,
    highlightedPeriods: activeFilters.periods,
  },
  group: {
    title:  'Conformité SLA par groupe',
    groups: groupWeekComplianceData.value,
    theme:  theme.value,
  },
  entities: {
    title: 'Top 10 entités',
    items: chartMetrics.value.topEntities,
    theme: theme.value,
  },
  techTime: {
    title:  'Temps de traitement moy. par technicien',
    groups: chartMetrics.value.techGroups ?? [],
    theme:  theme.value,
  },
}))

const chartEvents = computed(() => ({
  status:     { 'item-click': (code)  => toggleFilter('statuses',   code) },
  priority:   { 'item-click': (code)  => toggleFilter('priorities', code) },
  group:      { 'item-click': (name)  => toggleFilter('groups',     name) },
  entities:   { 'item-click': (name)  => toggleFilter('entities',   name) },
  line:       { 'item-click': (label) => toggleFilter('periods',    label) },
  compliance: { 'item-click': (label) => toggleFilter('periods',    label) },
  noTTO:      { 'item-click': (label) => toggleFilter('periods',    label) },
  tto:        { 'item-click': (label) => toggleFilter('periods',    label) },
  mttr:       { 'item-click': (label) => toggleFilter('periods',    label) },
  techTime:   {},
}))

// ── PowerPoint export ─────────────────────────────────────────────────────────
const showExportDialog = ref(false)
const selectedCharts   = ref([...ALL_IDS])
const exportSlideCount = computed(() => selectedCharts.value.length + (exportStatCards.value ? 1 : 0))

function getChartTitle(id) {
  return {
    status:     'Par statut',
    priority:   'Par priorité',
    line:       `Tickets ouverts par ${period.value === 'week' ? 'semaine' : 'mois'}`,
    compliance: `Conformité SLA par ${period.value === 'week' ? 'semaine' : 'mois'}`,
    noTTO:      'Tickets non pris en compte',
    tto:        'TTO moy. par type SLA',
    mttr:       'MTTR — temps de résolution moy.',
    group:      'Conformité SLA par groupe',
    entities:   'Top 10 entités',
    techTime:   'Temps de traitement moy. par technicien',
  }[id] ?? id
}

function openExportDialog() {
  selectedCharts.value = [...chartOrder.value]
  const titles = {}
  for (const id of ALL_IDS) titles[id] = getChartTitle(id)
  exportTitles.value = titles
  exportStatCards.value = true
  exportStatTitle.value = 'Key Metrics'
  showExportDialog.value = true
}

function toggleAllExport() {
  selectedCharts.value = selectedCharts.value.length === chartOrder.value.length
    ? []
    : [...chartOrder.value]
}

function runExport() {
  const ordered = chartOrder.value.filter(id => selectedCharts.value.includes(id))
  exportToPptx(ordered, exportStatCards.value, exportStatTitle.value, exportTitles.value)
}

async function exportToPptx(ids, includeStats, statsTitle, titles) {
  exporting.value = true
  await nextTick()

  try {
    const PptxGenJS = (await import('pptxgenjs')).default
    const { toPng }  = await import('html-to-image')

    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_WIDE'

    const isDark  = theme.value === 'dark'
    const bgFill  = isDark ? '0f172a' : 'f1f5f9'
    const accent  = isDark ? '38bdf8' : '0284c7'
    const muted   = isDark ? '94a3b8' : '64748b'
    const textClr = isDark ? 'f1f5f9' : '1e293b'

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
      if (activeFilters.statuses.length)   parts.push(`Statut : ${activeFilters.statuses.map(s => STATUS[s]).join(', ')}`)
      if (activeFilters.priorities.length) parts.push(`Priorité : ${activeFilters.priorities.map(p => PRIORITY[p]).join(', ')}`)
      if (activeFilters.groups.length)     parts.push(`Groupe : ${activeFilters.groups.join(', ')}`)
      if (activeFilters.entities.length)   parts.push(`Entité : ${activeFilters.entities.join(', ')}`)
      if (activeFilters.periods.length)    parts.push(`${period.value === 'week' ? 'Semaine' : 'Mois'} : ${activeFilters.periods.join(', ')}`)
      if (activeFilters.compliance)        parts.push(activeFilters.compliance === 'compliant' ? 'Conformes seulement' : 'Non conformes seulement')
      titleSlide.addText(`Filtré par : ${parts.join('  •  ')}`, {
        x: 0.5, y: 4.55, w: 12.33, h: 0.45,
        fontSize: 12, color: accent, align: 'center',
        border: { type: 'solid', color: accent, pt: 1 },
        fill: { color: accent, transparency: 85 },
      })
    }

    const slideW = 13.33, slideH = 7.5
    const TITLE_H = 0.55
    const SCALE = 3

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

    function addSlideWithTitle(title) {
      const slide = pptx.addSlide()
      slide.background = { fill: bgFill }
      if (title) {
        slide.addText(title, {
          x: 0.4, y: 0.12, w: slideW - 0.8, h: TITLE_H,
          fontSize: 18, bold: true, color: textClr,
        })
      }
      return slide
    }

    function fitImage(px, py, reservedH) {
      const maxH = slideH - reservedH
      let w = slideW
      let h = w * (py / px)
      if (h > maxH) { h = maxH; w = h * (px / py) }
      const x = (slideW - w) / 2
      const y = reservedH + (maxH - h) / 2
      return { x, y, w, h }
    }

    if (includeStats && statRowRef.value) {
      const png = await captureEl(statRowRef.value)
      const { width: px, height: py } = statRowRef.value.getBoundingClientRect()
      const slide = addSlideWithTitle(statsTitle)
      const { x, y, w, h } = fitImage(px, py, statsTitle ? TITLE_H + 0.1 : 0)
      slide.addImage({ data: png, x, y, w, h })
    }

    for (const id of ids) {
      const el = chartRefs[id]
      if (!el) continue

      const png = await captureEl(el)
      const { width: px, height: py } = el.getBoundingClientRect()
      const slideTitle = titles?.[id] ?? ''
      const slide = addSlideWithTitle(slideTitle)
      const { x, y, w, h } = fitImage(px, py, slideTitle ? TITLE_H + 0.1 : 0)
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

const exporting = ref(false)

// ── Chart grid resize ─────────────────────────────────────────────────────────
function spanFor(id) {
  const saved = chartSizes.value[id]
  return (saved?.col != null) ? saved : (DEFAULT_SPANS[id] ?? { col: 6, row: 4 })
}

function startResize(e, id) {
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  const container = chartRefs[id]?.closest('.charts-row')
  const containerW = container?.offsetWidth ?? (GRID_COLS * 80)
  const colStep = (containerW - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS + GRID_GAP
  resizeState.id = id
  resizeState.startX = clientX
  resizeState.startY = clientY
  resizeState.startCol = spanFor(id).col
  resizeState.startRow = spanFor(id).row
  resizeState.cellW = colStep
}

function onResizeMove(e) {
  if (!resizeState.id) return
  if (e.cancelable) e.preventDefault()
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  const newCol = Math.max(2, Math.min(GRID_COLS, Math.round(resizeState.startCol + (clientX - resizeState.startX) / resizeState.cellW)))
  const newRow = Math.max(3, Math.min(20, Math.round(resizeState.startRow + (clientY - resizeState.startY) / (GRID_ROW_H + GRID_GAP))))
  chartSizes.value[resizeState.id] = { col: newCol, row: newRow }
}

function onResizeEnd() {
  resizeState.id = null
}

onMounted(() => {
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

<style scoped>
.content {
  flex: 1;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dashboard-actions {
  display: flex;
  justify-content: flex-end;
}

/* Stat cards */
.stat-row { display: flex; gap: 16px; flex-wrap: wrap; }

.card-wrapper { position: relative; }
.chart-wrapper {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.card-clickable { cursor: pointer; }
.card-clickable:hover { box-shadow: 0 0 0 2px var(--color-brand-primary); border-radius: var(--radius-lg, 10px); }
.card-active    { box-shadow: 0 0 0 2px var(--color-brand-primary); border-radius: var(--radius-lg, 10px); }

/* Filter bar */
.filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
  background: var(--color-surface-muted);
  border: 1px solid var(--color-brand-primary);
  border-radius: var(--radius-md, 8px);
}
.filter-label {
  color: var(--color-text-muted);
  font-weight: var(--font-weight-semibold, 600);
  font-size: var(--font-size-sm, 0.875rem);
}

/* Period toggle — slim override so ori-tabs__list sits flush */
.period-toggle {
  border-bottom: none;
  gap: 4px;
}

/* Charts */
.charts-row {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-auto-rows: 60px;
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
  border-radius: var(--radius-sm, 4px);
  color: var(--color-text-muted);
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
  border-radius: var(--radius-sm, 4px);
  color: var(--color-text-muted);
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
  background-image: radial-gradient(circle, var(--color-text-muted) 1.5px, transparent 1.5px);
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
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg, 12px);
  padding: 24px;
  width: 560px;
  max-width: 92vw;
  box-shadow: var(--shadow-xl);
}
.dialog-title {
  font-size: var(--font-size-md, 1rem);
  font-weight: var(--font-weight-bold, 700);
  color: var(--color-text-primary);
  margin-bottom: 14px;
}
.export-section-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--font-size-xs, 0.75rem);
  font-weight: var(--font-weight-semibold, 600);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: 6px;
}
.export-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}
.export-checkbox {
  accent-color: var(--color-brand-primary);
  width: 15px;
  height: 15px;
  cursor: pointer;
  flex-shrink: 0;
}
.export-title-input {
  flex: 1;
  background: var(--color-surface-base);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md, 6px);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm, 0.875rem);
  padding: 5px 10px;
  outline: none;
  transition: border-color 0.15s;
}
.export-title-input:focus { border-color: var(--color-border-focus); }
.export-title-input:disabled { opacity: 0.35; cursor: not-allowed; }
.select-toggle-btn {
  background: none;
  border: none;
  color: var(--color-brand-primary);
  font-size: var(--font-size-sm, 0.875rem);
  cursor: pointer;
  padding: 0;
}
.dialog-count {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--color-text-muted);
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
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border-subtle);
}
</style>
