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
        <button class="ori-button ori-button--primary" :disabled="loading" @click="load">
          {{ loading ? 'Chargement…' : 'Actualiser' }}
        </button>
      </div>
    </header>

    <div v-if="error && !loading" class="ori-alert ori-alert--danger app-error" role="alert">
      {{ error }}
    </div>

    <RouterView />

    <footer class="app-footer">
      <span v-if="lastUpdated">Dernière mise à jour : {{ lastUpdated }}</span>
    </footer>
  </div>
</template>

<script setup>
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

watch(theme, (t) => {
  document.documentElement.setAttribute('data-theme', t)
  localStorage.setItem(THEME_KEY, t)
}, { immediate: true })

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

.app-error { margin: 24px 32px; }

.app-footer {
  padding: 16px 32px;
  border-top: 1px solid var(--border);
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--color-text-muted);
  text-align: right;
}
</style>
