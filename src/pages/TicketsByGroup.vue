<template>
  <div class="tickets-page" v-click-outside="() => (dropdownOpen = false)">
    <div class="page-header">
      <h2 class="page-title">Tickets par groupe</h2>
      <span class="total-badge">{{ currentGroup ? currentGroup.tickets.length : 0 }} ticket{{ (currentGroup?.tickets.length ?? 0) === 1 ? '' : 's' }}</span>
    </div>

    <!-- Filters row -->
    <div class="filters-row">
      <!-- Group dropdown -->
      <div class="dropdown-wrap">
        <button class="filter-btn" @click="dropdownOpen = !dropdownOpen">
          <span class="filter-btn-label">Groupe</span>
          <span class="filter-btn-value">{{ selectedGroup ?? '—' }}</span>
          <span class="caret">{{ dropdownOpen ? '▲' : '▼' }}</span>
        </button>
        <div v-if="dropdownOpen" class="dropdown">
          <label
            v-for="g in allGroupNames"
            :key="g.name"
            class="dropdown-item"
            :class="{ selected: selectedGroup === g.name }"
            @click="selectedGroup = g.name; dropdownOpen = false"
          >
            <span class="dropdown-item-name">{{ g.name }}</span>
            <span class="dropdown-item-count">{{ g.total }}</span>
          </label>
        </div>
      </div>

      <!-- Status filter -->
      <div class="status-filter">
        <span class="filter-label">Statut</span>
        <button
          class="status-btn"
          :class="{ active: selectedStatuses.length === 0 }"
          @click="selectedStatuses = []"
        >Tous</button>
        <button
          v-for="(label, code) in STATUS"
          :key="code"
          class="status-btn"
          :class="{ active: selectedStatuses.includes(Number(code)) }"
          :style="selectedStatuses.includes(Number(code)) ? { background: STATUS_COLORS[code], borderColor: STATUS_COLORS[code], color: '#fff' } : {}"
          @click="toggleStatus(Number(code))"
        >{{ label }}</button>
      </div>
    </div>

    <!-- No group selected / empty -->
    <div v-if="!currentGroup" class="empty-state">Aucun groupe sélectionné.</div>
    <div v-else-if="currentGroup.tickets.length === 0" class="empty-state">Aucun ticket ne correspond au filtre actuel.</div>

    <!-- Group table -->
    <div v-else class="group-block">
      <div class="group-summary">
        <span class="group-compliance" :style="{ color: complianceColor(currentGroup.pct) }">
          {{ currentGroup.pct }}% conformes
        </span>
        <span class="group-sep">•</span>
        <span class="group-breach">{{ currentGroup.breachCount }} en infraction</span>
      </div>

      <div class="table-wrap">
        <table class="ticket-table">
          <thead>
            <tr>
              <th class="col-id">#</th>
              <th class="col-name">Titre</th>
              <th class="col-status">Statut</th>
              <th class="col-priority">Priorité</th>
              <th class="col-date">Date</th>
              <th class="col-sla">SLA</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in currentGroup.tickets" :key="t.id" class="ticket-row" @click="openTicket(t.id)" title="Ouvrir dans GLPI">
              <td class="col-id text-muted">{{ t.id }}</td>
              <td class="col-name">{{ t.name || '—' }}</td>
              <td class="col-status">
                <span class="badge" :style="{ background: STATUS_COLORS[t.status] ?? '#6b7280' }">
                  {{ STATUS[t.status] ?? `Status ${t.status}` }}
                </span>
              </td>
              <td class="col-priority">
                <span class="badge" :style="{ background: PRIORITY_COLORS[t.priority] ?? '#6b7280' }">
                  {{ PRIORITY[t.priority] ?? `P${t.priority}` }}
                </span>
              </td>
              <td class="col-date text-muted">{{ t.date?.substring(0, 10) ?? '—' }}</td>
              <td class="col-sla">
                <span :class="t.breached ? 'sla-breach' : 'sla-ok'">
                  {{ t.breached ? '✗' : '✓' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { STATUS, PRIORITY, GLPI_URL } from '../api/glpi.js'

function openTicket(id) {
  window.open(`${GLPI_URL}/front/ticket.form.php?id=${id}`, '_blank', 'noopener')
}

const STATUS_COLORS = {
  1: '#3b82f6', 2: '#f59e0b', 3: '#8b5cf6',
  4: '#6b7280', 5: '#10b981', 6: '#374151',
}
const PRIORITY_COLORS = {
  1: '#6ee7b7', 2: '#34d399', 3: '#f59e0b',
  4: '#f97316', 5: '#ef4444', 6: '#7f1d1d',
}

const props = defineProps({
  tickets: { type: Array, default: () => [] },
})

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

const selectedGroup   = ref(null)
const selectedStatuses = ref([])
const dropdownOpen    = ref(false)

// All unique group names sorted by total ticket count (unfiltered)
const allGroupNames = computed(() => {
  const map = {}
  for (const t of props.tickets) {
    map[t.group] = (map[t.group] ?? 0) + 1
  }
  return Object.entries(map)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
})

// Auto-select first group when data loads
watch(allGroupNames, (groups) => {
  if (!selectedGroup.value && groups.length > 0) {
    selectedGroup.value = groups[0].name
  }
}, { immediate: true })

function toggleStatus(code) {
  const idx = selectedStatuses.value.indexOf(code)
  if (idx >= 0) selectedStatuses.value.splice(idx, 1)
  else selectedStatuses.value.push(code)
}

function complianceColor(pct) {
  if (pct >= 80) return '#10b981'
  if (pct >= 60) return '#f59e0b'
  return '#ef4444'
}

// Tickets for the selected group, filtered by status
const currentGroup = computed(() => {
  if (!selectedGroup.value) return null

  let tickets = props.tickets.filter(t => t.group === selectedGroup.value)
  if (selectedStatuses.value.length > 0) {
    tickets = tickets.filter(t => selectedStatuses.value.includes(t.status))
  }

  tickets = [...tickets].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  const breachCount = tickets.filter(t => t.breached).length
  const pct = tickets.length === 0 ? 0 : Math.round(((tickets.length - breachCount) / tickets.length) * 100)

  return { name: selectedGroup.value, tickets, breachCount, pct }
})
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
  gap: 14px;
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

/* Filters row */
.filters-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

/* Group dropdown */
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
  transition: border-color 0.15s;
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
  transition: background 0.1s;
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
  flex-shrink: 0;
}
.dropdown-item.selected .dropdown-item-count {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent);
}

/* Status filter */
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

/* Group summary bar */
.group-block {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.group-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}

.group-sep   { color: var(--border); }
.group-breach { color: var(--text-muted); }

/* Table */
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
}

.ticket-table td {
  padding: 9px 16px;
  border-top: 1px solid var(--border);
  color: var(--text);
  vertical-align: middle;
}

.ticket-row { cursor: pointer; }
.ticket-row:hover { background: rgba(255, 255, 255, 0.05) !important; }
.ticket-row:hover .col-id { color: var(--accent); }

.col-id       { width: 70px; }
.col-name     { min-width: 220px; }
.col-status   { width: 120px; }
.col-priority { width: 110px; }
.col-date     { width: 110px; white-space: nowrap; }
.col-sla      { width: 60px; text-align: center; }

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

.sla-ok     { color: #10b981; font-weight: 700; }
.sla-breach { color: #ef4444; font-weight: 700; }

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
