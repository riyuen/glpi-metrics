<template>
  <div class="tickets-page" v-click-outside="() => (groupOpen = false)">
    <div class="page-header">
      <h2 class="page-title">Tickets sans prise en charge</h2>
      <span class="total-badge">{{ filtered.length }} ticket{{ filtered.length === 1 ? '' : 's' }}</span>
      <span class="age-badge">ouverts depuis + de 30 jours</span>
      <button v-if="filtered.length > 0" class="export-btn" @click="exportCSV">
        <span>📥 CSV</span>
      </button>
    </div>

    <div class="filters-row">
      <!-- Group filter -->
      <div class="dropdown-wrap">
        <button class="filter-btn" @click="groupOpen = !groupOpen">
          <span class="filter-btn-label">Groupe</span>
          <span class="filter-btn-value">
            <template v-if="selectedGroups.length === 0">Tous</template>
            <template v-else>{{ selectedGroups.length }}/{{ groupCounts.length }}</template>
          </span>
          <span class="caret">{{ groupOpen ? '▲' : '▼' }}</span>
        </button>
        <div v-if="groupOpen" class="dropdown">
          <div class="dropdown-item dropdown-select-all" @click.stop="toggleAllGroups()">
            <span class="dropdown-item-name">{{ allGroupsSelected ? 'Tout désélectionner' : 'Tout sélectionner' }}</span>
          </div>
          <label v-for="g in groupCounts" :key="g.name" class="dropdown-item" :class="{ selected: selectedGroups.includes(g.name) }">
            <input type="checkbox" v-model="selectedGroups" :value="g.name" style="margin-right:8px;" />
            <span class="dropdown-item-name">{{ g.name }}</span>
            <span class="dropdown-item-count">{{ g.count }}</span>
          </label>
        </div>
      </div>

      <!-- SLA type filter -->
      <div class="status-filter">
        <span class="filter-label">SLA TTO</span>
        <button
          class="status-btn"
          :class="{ active: selectedSLAs.length === 0 }"
          @click="selectedSLAs = []"
        >Tous</button>
        <button
          v-for="sla in slaList"
          :key="sla"
          class="status-btn"
          :class="{ active: selectedSLAs.includes(sla) }"
          @click="toggleSLA(sla)"
        >{{ sla || 'Aucun SLA' }}</button>
      </div>
    </div>

    <div v-if="filtered.length === 0" class="empty-state">
      Aucun ticket sans prise en charge depuis plus de 30 jours.
    </div>

    <div v-else class="table-card">
      <div class="table-wrap">
        <table class="ticket-table">
          <thead>
            <tr>
              <th class="col-id" @click="sortBy('id')">#<span class="sort-icon">{{ sortIcon('id') }}</span></th>
              <th class="col-name">Titre</th>
              <th class="col-group">Groupe</th>
              <th class="col-entity">Entité</th>
              <th class="col-status">Statut</th>
              <th class="col-sla">SLA TTO</th>
              <th class="col-date" @click="sortBy('date')">Ouverture<span class="sort-icon">{{ sortIcon('date') }}</span></th>
              <th class="col-age" @click="sortBy('age')">Âge (jours)<span class="sort-icon">{{ sortIcon('age') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in sorted"
              :key="t.id"
              class="ticket-row"
              @click="openTicket(t.id)"
              title="Ouvrir dans GLPI"
            >
              <td class="col-id text-muted">{{ t.id }}</td>
              <td class="col-name">{{ t.name || '—' }}</td>
              <td class="col-group text-muted">{{ t.group }}</td>
              <td class="col-entity text-muted">{{ t.entity }}</td>
              <td class="col-status">
                <span class="badge" :style="{ background: STATUS_COLORS[t.status] ?? '#6b7280' }">
                  {{ STATUS[t.status] ?? `Status ${t.status}` }}
                </span>
              </td>
              <td class="col-sla text-muted">{{ t.ttoSlaName || '—' }}</td>
              <td class="col-date text-muted">{{ t.date?.substring(0, 10) ?? '—' }}</td>
              <td class="col-age">
                <span class="age-chip" :class="ageClass(t.ageDays)">{{ t.ageDays }}j</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject } from 'vue'
import { STATUS, PRIORITY, GLPI_URL } from '../api/glpi.js'

const STATUS_COLORS = {
  1: '#3b82f6', 2: '#f59e0b', 3: '#8b5cf6',
  4: '#6b7280', 5: '#10b981', 6: '#374151',
}

const processedTickets = inject('processedTickets')
const tickets = computed(() => processedTickets?.value ?? [])

function openTicket(id) {
  window.open(`${GLPI_URL}/front/ticket.form.php?id=${id}`, '_blank', 'noopener')
}

// Click-outside directive
const vClickOutside = {
  mounted(el, binding) {
    el._clickOutside = (e) => { if (!el.contains(e.target)) binding.value(e) }
    document.addEventListener('click', el._clickOutside)
  },
  unmounted(el) {
    document.removeEventListener('click', el._clickOutside)
  },
}

const selectedGroups = ref([])
const selectedSLAs   = ref([])
const groupOpen      = ref(false)
const sortField      = ref('age')
const sortDir        = ref(-1) // -1 = desc, 1 = asc

const now = Date.now()
const MS_PER_DAY = 86400000

// All open tickets with no TTO and open for more than 30 days
const candidates = computed(() =>
  tickets.value
    .filter(t =>
      t.hasNoTTO &&
      t.status !== 5 &&
      t.status !== 6 &&
      t.date &&
      (now - new Date(t.date).getTime()) > 30 * MS_PER_DAY
    )
    .map(t => ({
      ...t,
      ageDays: Math.floor((now - new Date(t.date).getTime()) / MS_PER_DAY),
    }))
)

const groupCounts = computed(() => {
  const map = {}
  for (const t of candidates.value) map[t.group] = (map[t.group] ?? 0) + 1
  return Object.entries(map)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
})

const slaList = computed(() => {
  const set = new Set()
  for (const t of candidates.value) set.add(t.ttoSlaName)
  return Array.from(set).sort((a, b) => {
    if (a === null) return 1
    if (b === null) return -1
    return a.localeCompare(b)
  })
})

const allGroupsSelected = computed(() => selectedGroups.value.length === groupCounts.value.length)

const filtered = computed(() => {
  let ts = candidates.value
  if (selectedGroups.value.length) ts = ts.filter(t => selectedGroups.value.includes(t.group))
  if (selectedSLAs.value.length) ts = ts.filter(t => selectedSLAs.value.includes(t.ttoSlaName))
  return ts
})

const sorted = computed(() => {
  const f = sortField.value
  const d = sortDir.value
  return [...filtered.value].sort((a, b) => {
    const av = f === 'age' ? a.ageDays : f === 'date' ? a.date : a.id
    const bv = f === 'age' ? b.ageDays : f === 'date' ? b.date : b.id
    if (av < bv) return d
    if (av > bv) return -d
    return 0
  })
})

function sortBy(field) {
  if (sortField.value === field) sortDir.value = -sortDir.value
  else { sortField.value = field; sortDir.value = -1 }
}

function sortIcon(field) {
  if (sortField.value !== field) return ' ↕'
  return sortDir.value === -1 ? ' ↓' : ' ↑'
}

function toggleSLA(slaName) {
  const idx = selectedSLAs.value.indexOf(slaName)
  if (idx >= 0) selectedSLAs.value.splice(idx, 1)
  else selectedSLAs.value.push(slaName)
}

function toggleAllGroups() {
  selectedGroups.value = allGroupsSelected.value ? [] : groupCounts.value.map(g => g.name)
}

function ageClass(days) {
  if (days > 90) return 'age-critical'
  if (days > 60) return 'age-high'
  return 'age-medium'
}

function exportCSV() {
  const headers = ['ID', 'Titre', 'Groupe', 'Entité', 'Statut', 'SLA TTO', 'Ouverture', 'Âge (jours)', 'Lien']
  const rows = sorted.value.map(t => [
    t.id,
    t.name || '—',
    t.group,
    t.entity,
    STATUS[t.status] ?? `Status ${t.status}`,
    t.ttoSlaName || '—',
    t.date?.substring(0, 10) ?? '—',
    t.ageDays,
    `${GLPI_URL}/front/ticket.form.php?id=${t.id}`,
  ])

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `tickets-${new Date().toISOString().split('T')[0]}.csv`
  link.click()
}
</script>

<style scoped>
.tickets-page {
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: relative;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.page-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text);
}

.total-badge {
  background: var(--border);
  border-radius: 20px;
  padding: 2px 12px;
  font-size: 0.82rem;
  color: var(--text-muted);
}

.age-badge {
  background: color-mix(in srgb, #ef4444 15%, transparent);
  border: 1px solid color-mix(in srgb, #ef4444 30%, transparent);
  color: #ef4444;
  border-radius: 20px;
  padding: 2px 12px;
  font-size: 0.78rem;
  font-weight: 600;
}

.export-btn {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  color: var(--accent);
  border-radius: 20px;
  padding: 2px 12px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.export-btn:hover {
  background: color-mix(in srgb, var(--accent) 25%, transparent);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
}

.filters-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.dropdown-wrap { position: relative; }

.filter-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.85rem;
  padding: 7px 14px;
  cursor: pointer;
  white-space: nowrap;
}
.filter-btn:hover { border-color: var(--accent); }

.filter-btn-label {
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.filter-btn-value {
  font-weight: 600;
  color: var(--text);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.caret { font-size: 0.6rem; color: var(--text-muted); }

.dropdown {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  z-index: 50;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 220px;
  max-height: 320px;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 14px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text);
  user-select: none;
}
.dropdown-item:hover { background: rgba(255, 255, 255, 0.05); }
.dropdown-item.selected {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

.dropdown-item-name { flex: 1; }
.dropdown-item-count {
  font-size: 0.75rem;
  color: var(--text-muted);
  background: var(--border);
  border-radius: 10px;
  padding: 1px 7px;
  margin-left: 8px;
}
.dropdown-item.selected .dropdown-item-count {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent);
}

.status-filter {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-label {
  font-size: 0.78rem;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-right: 2px;
}

.status-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.8rem;
  padding: 5px 12px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.status-btn:hover { border-color: var(--accent); color: var(--accent); }
.status-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.table-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.table-wrap { overflow-x: auto; }

.ticket-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.83rem;
}

.ticket-table thead tr { background: rgba(255, 255, 255, 0.02); }

.ticket-table th {
  padding: 9px 16px;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  user-select: none;
}

.ticket-table th[class='col-id'],
.ticket-table th[class='col-date'],
.ticket-table th[class='col-age'] {
  cursor: pointer;
}
.ticket-table th:hover { color: var(--accent); }

.ticket-table td {
  padding: 9px 16px;
  border-top: 1px solid var(--border);
  color: var(--text);
  vertical-align: middle;
}

.ticket-row { cursor: pointer; }
.ticket-row:hover { background: rgba(255, 255, 255, 0.05); }
.ticket-row:hover .col-id { color: var(--accent); }

.col-id     { width: 70px; }
.col-name   { min-width: 200px; }
.col-group  { min-width: 140px; }
.col-entity { min-width: 120px; }
.col-status { width: 140px; }
.col-sla    { min-width: 120px; }
.col-date   { width: 110px; white-space: nowrap; }
.col-age    { width: 100px; text-align: center; }

.sort-icon { font-size: 0.75rem; opacity: 0.7; margin-left: 2px; }

.text-muted { color: var(--text-muted); }

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}

.age-chip {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 0.78rem;
  font-weight: 700;
}

.age-medium   { background: color-mix(in srgb, #f59e0b 20%, transparent); color: #f59e0b; }
.age-high     { background: color-mix(in srgb, #f97316 20%, transparent); color: #f97316; }
.age-critical { background: color-mix(in srgb, #ef4444 20%, transparent); color: #ef4444; }

.empty-state {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
  font-size: 0.9rem;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}
</style>
