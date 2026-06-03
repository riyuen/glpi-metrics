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
        <button class="theme-btn" @click="theme = theme === 'dark' ? 'light' : 'dark'">
          {{ theme === 'dark' ? 'Mode clair' : 'Mode sombre' }}
        </button>
        <button class="refresh-btn" :disabled="loading" @click="load">
          {{ loading ? 'Chargement…' : 'Actualiser' }}
        </button>
      </div>
    </header>

    <div v-if="error && !loading" class="error-banner">
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
  document.documentElement.classList.toggle('light', t === 'light')
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

// Load satisfaction data when navigating to /satisfaction
const route = useRoute()
watch(() => route.path, (path) => {
  if (path === '/satisfaction') loadSatisfaction()
})

onMounted(() => {
  load()
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
  text-decoration: none;
  display: inline-block;
}
.nav-btn:hover { background: rgba(255,255,255,0.06); color: var(--text); }
.nav-btn.router-link-active { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); font-weight: 600; }

.header-actions { display: flex; align-items: center; gap: 8px; }

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

.app-footer {
  padding: 16px 32px;
  border-top: 1px solid var(--border);
  font-size: 0.78rem;
  color: var(--text-muted);
  text-align: right;
}
</style>
