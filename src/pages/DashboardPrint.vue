<template>
  <main class="print-content">
    <h1 class="print-title">{{ activeDashboard?.name }}</h1>
    <DashboardGrid v-if="dashboardMatched" :theme="theme" />
  </main>
</template>

<script setup>
import { computed, inject, nextTick, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import DashboardGrid from '../components/dashboard/DashboardGrid.vue'
import { useDashboards } from '../composables/useDashboards.js'
import { useFilters } from '../composables/useFilters.js'
import { useMetricsData } from '../composables/useMetricsData.js'
import { computeWidgetData } from '../lib/aggregate.js'
import { displayTitle } from '../lib/registry.js'
import { widgetToTable } from '../lib/exportTable.js'

const route = useRoute()
const theme = inject('theme')
const loading = inject('loading')

const { ready, setActive, activeDashboard, activeWidgets } = useDashboards()
const { activeFilters, period } = useFilters()
const { processedTickets, satisfactionRecords, loadSatisfaction } = useMetricsData()

onMounted(() => {
  loadSatisfaction()
})

// useDashboards()'s doc loads asynchronously (fetchServerDoc) — wait for it
// before selecting the dashboard, otherwise setActive silently no-ops.
watch(ready, (isReady) => {
  if (isReady) setActive(route.params.dashboardId)
}, { immediate: true })

const dashboardMatched = computed(() => activeDashboard.value?.id === route.params.dashboardId)

const ctx = computed(() => ({
  tickets: processedTickets.value,
  satisfaction: satisfactionRecords.value,
  activeFilters,
  period: period.value,
}))

// Signals readiness to the headless browser driving this route (see
// dashboard-render/render_dashboard.py) once tickets + the correct dashboard
// have loaded and charts have had time to render/animate. Checking
// activeDashboard's id (not just `ready`) avoids a race against the setActive
// watcher above running in the same tick.
watch(
  () => dashboardMatched.value && !loading.value,
  async (settled) => {
    if (!settled) return
    await nextTick()
    await nextTick()
    // Chart.js's default animation runs ~1000ms — wait it out so the
    // screenshot captures the settled chart, not a mid-animation frame.
    setTimeout(buildExportPayload, 1200)
  },
  { immediate: true }
)

function buildExportPayload() {
  const widgets = activeWidgets.value.map(w => {
    const payload = computeWidgetData(w, ctx.value)
    return {
      id: w.id,
      title: displayTitle(w, period.value),
      kind: payload.kind,
      table: widgetToTable(payload),
    }
  })
  window.__DASHBOARD_EXPORT__ = { ready: true, dashboardName: activeDashboard.value?.name, widgets }
}
</script>

<style scoped>
.print-content {
  padding: 32px;
  background: var(--bg);
  min-height: 100vh;
}
.print-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 20px;
}
</style>
