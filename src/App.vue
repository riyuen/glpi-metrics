<template>
  <div class="app">
    <header class="app-header">
      <div class="header-left">
        <h1>GLPI Metrics</h1>
        <nav class="app-nav">
          <RouterLink class="nav-btn" to="/">Tableau de bord</RouterLink>
          <RouterLink class="nav-btn" to="/tickets">Tickets par groupe</RouterLink>
          <RouterLink class="nav-btn" to="/unacknowledged">Sans prise en charge</RouterLink>
          <RouterLink class="nav-btn" to="/satisfaction">Satisfaction</RouterLink>
        </nav>
      </div>
      <div class="header-actions">
        <button class="ori-button ori-button--ghost" @click="theme = theme === 'dark' ? 'light' : 'dark'">
          {{ theme === 'dark' ? 'Mode clair' : 'Mode sombre' }}
        </button>
<<<<<<< HEAD
        <template v-if="currentView === 'dashboard'">
          <button class="export-btn" :disabled="loading" @click="showExportDialog = true">Exporter PPT</button>
        </template>
        <button class="refresh-btn" :disabled="loading" @click="load">
=======
        <button class="ori-button ori-button--primary" :disabled="loading" @click="load">
>>>>>>> fafca4e6f978cbf257f9851985ec874a2c0feb62
          {{ loading ? 'Chargement…' : 'Actualiser' }}
        </button>
      </div>
    </header>

    <div v-if="error && !loading" class="ori-alert ori-alert--danger app-error" role="alert">
      {{ error }}
    </div>

<<<<<<< HEAD
    <TicketsByGroup v-if="!error && currentView === 'tickets'" :tickets="processedTickets" />

    <Satisfaction
      v-else-if="currentView === 'satisfaction'"
      :records="satisfactionRecords"
      :loading="satisfactionLoading"
      :error="satisfactionError"
      @refresh="loadSatisfaction(true)"
    />

    <main v-else-if="!error && currentView === 'dashboard'" class="content">
      <DashboardBar @add-widget="openEditor(null)" />
      <FilterBar />
      <DashboardGrid
        ref="gridRef"
        :theme="theme"
        @edit-widget="openEditor"
        @add-widget="openEditor(null)"
      />
    </main>
=======
    <RouterView />
>>>>>>> fafca4e6f978cbf257f9851985ec874a2c0feb62

    <footer class="app-footer">
      <span v-if="lastUpdated">Dernière mise à jour : {{ lastUpdated }}</span>
    </footer>
<<<<<<< HEAD

    <WidgetEditor
      v-if="editorOpen"
      :widget="editingWidget"
      :theme="theme"
      @save="saveWidget"
      @cancel="editorOpen = false"
      @remove="removeEditedWidget"
    />

    <ExportDialog
      v-if="showExportDialog"
      :widget-els="gridRef?.widgetEls ?? {}"
      :theme="theme"
      @close="showExportDialog = false"
    />
=======
>>>>>>> fafca4e6f978cbf257f9851985ec874a2c0feb62
  </div>
</template>

<script setup>
<<<<<<< HEAD
import { ref, watch, onMounted } from 'vue'
import TicketsByGroup from './pages/TicketsByGroup.vue'
import Satisfaction from './pages/Satisfaction.vue'
import DashboardBar from './components/dashboard/DashboardBar.vue'
import FilterBar from './components/dashboard/FilterBar.vue'
import DashboardGrid from './components/dashboard/DashboardGrid.vue'
import ExportDialog from './components/dashboard/ExportDialog.vue'
import WidgetEditor from './components/widgets/WidgetEditor.vue'
import { useMetricsData } from './composables/useMetricsData.js'
import { useDashboards } from './composables/useDashboards.js'

const THEME_KEY = 'glpi-theme'

const {
  processedTickets, loading, error, lastUpdated, load,
  satisfactionRecords, satisfactionLoading, satisfactionError, loadSatisfaction,
} = useMetricsData()

const { addWidget, updateWidget, removeWidget } = useDashboards()

// ── UI state ─────────────────────────────────────────────────────────────────
const currentView = ref('dashboard') // 'dashboard' | 'tickets' | 'satisfaction'
const theme       = ref(localStorage.getItem(THEME_KEY) ?? 'dark')
const gridRef     = ref(null)
const showExportDialog = ref(false)
=======
import { ref, provide, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { fetchMetrics, fetchSatisfaction } from './api/glpi.js'

const THEME_KEY = 'glpi-theme'

// ── Shared state ──────────────────────────────────────────────────────────────
const metrics          = ref({
  openCount: 0, byStatus: {}, byPriority: {},
  byWeek: {}, byWeekCompliance: {}, byWeekNoTTO: {},
  byMonth: {}, byMonthCompliance: {}, byMonthNoTTO: {},
  byGroupCompliance: {}, topEntities: [], total: 0,
  avgResolveHours: null,
})
const processedTickets    = ref([])
const loading             = ref(false)
const error               = ref(null)
const lastUpdated         = ref(null)
const theme               = ref(localStorage.getItem(THEME_KEY) ?? 'dark')
const satisfactionRecords = ref([])
const satisfactionLoading = ref(false)
const satisfactionError   = ref(null)
>>>>>>> fafca4e6f978cbf257f9851985ec874a2c0feb62

watch(theme, (t) => {
  document.documentElement.setAttribute('data-theme', t)
  localStorage.setItem(THEME_KEY, t)
}, { immediate: true })

<<<<<<< HEAD
// ── Widget editor ─────────────────────────────────────────────────────────────
const editorOpen    = ref(false)
const editingWidget = ref(null) // null = create

function openEditor(widget) {
  editingWidget.value = widget ?? null
  editorOpen.value = true
}

function saveWidget(widget) {
  if (editingWidget.value) updateWidget(widget)
  else addWidget(widget)
  editorOpen.value = false
}

function removeEditedWidget() {
  if (editingWidget.value && window.confirm('Supprimer ce widget ?')) {
    removeWidget(editingWidget.value.id)
    editorOpen.value = false
  }
}

onMounted(load)
=======
// ── Provide shared state to routed pages ──────────────────────────────────────
provide('metrics',           metrics)
provide('processedTickets',  processedTickets)
provide('loading',           loading)
provide('error',             error)
provide('lastUpdated',       lastUpdated)
provide('theme',             theme)
provide('satisfactionRecords', satisfactionRecords)
provide('satisfactionLoading', satisfactionLoading)
provide('satisfactionError',   satisfactionError)
provide('loadSatisfaction',    loadSatisfaction)

// ── Data loading ──────────────────────────────────────────────────────────────
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

const route = useRoute()
watch(() => route.path, (path) => {
  if (path === '/satisfaction') loadSatisfaction()
})

onMounted(() => {
  load()
})
>>>>>>> fafca4e6f978cbf257f9851985ec874a2c0feb62
</script>

<style scoped>
.app { min-height: 100vh; display: flex; flex-direction: column; }

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 32px;
  border-bottom: 1px solid var(--border);
  background: var(--card-bg);
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 24px;
}

.app-header h1 {
  font-size: 1.25rem;
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
  border-radius: var(--radius-md, 6px);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: var(--font-weight-medium, 500);
  padding: 6px 14px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  text-decoration: none;
  display: inline-block;
}
.nav-btn:hover {
  background: var(--color-surface-subtle);
  color: var(--color-text-primary);
}
.nav-btn.router-link-active {
  background: var(--color-brand-primary-subtle);
  color: var(--color-brand-primary);
  font-weight: var(--font-weight-semibold, 600);
}

.header-actions { display: flex; align-items: center; gap: 8px; }

<<<<<<< HEAD
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

.theme-btn {
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
=======
.app-error { margin: 24px 32px; }
>>>>>>> fafca4e6f978cbf257f9851985ec874a2c0feb62

.app-footer {
  padding: 16px 32px;
  border-top: 1px solid var(--border);
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--color-text-muted);
  text-align: right;
}
</style>
