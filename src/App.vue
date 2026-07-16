<template>
  <div class="app">
    <header class="app-header">
      <div class="header-left">
        <h1>GLPI Metrics</h1>
        <nav class="app-nav">
          <button class="nav-btn" :class="{ active: currentView === 'dashboard' }" @click="currentView = 'dashboard'">Tableau de bord</button>
          <button class="nav-btn" :class="{ active: currentView === 'tickets' }" @click="currentView = 'tickets'">Tickets par groupe</button>
          <button class="nav-btn" :class="{ active: currentView === 'satisfaction' }" @click="currentView = 'satisfaction'; loadSatisfaction()">Satisfaction</button>
        </nav>
      </div>
      <div class="header-actions">
        <button class="theme-btn" @click="theme = theme === 'dark' ? 'light' : 'dark'">
          {{ theme === 'dark' ? 'Mode clair' : 'Mode sombre' }}
        </button>
        <template v-if="currentView === 'dashboard'">
          <button class="export-btn" :disabled="loading" @click="showExportDialog = true">Exporter PPT</button>
        </template>
        <button class="refresh-btn" :disabled="loading" @click="load">
          {{ loading ? 'Chargement…' : 'Actualiser' }}
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
      <DashboardBar @add-widget="openEditor(null)" />
      <FilterBar />
      <DashboardGrid
        ref="gridRef"
        :theme="theme"
        @edit-widget="openEditor"
        @add-widget="openEditor(null)"
      />
    </main>

    <footer class="app-footer">
      <span v-if="lastUpdated">Dernière mise à jour : {{ lastUpdated }}</span>
    </footer>

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
  </div>
</template>

<script setup>
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

watch(theme, (t) => {
  document.documentElement.classList.toggle('light', t === 'light')
  localStorage.setItem(THEME_KEY, t)
}, { immediate: true })

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

.app-footer {
  padding: 16px 32px;
  border-top: 1px solid var(--border);
  font-size: 0.78rem;
  color: var(--text-muted);
  text-align: right;
}
</style>
