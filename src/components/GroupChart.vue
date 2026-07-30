<template>
  <div class="chart-card" v-click-outside="() => (dropdownOpen = false)">
    <div class="chart-header">
      <h3 class="chart-title">{{ title }}</h3>
      <div class="filter-wrap">
        <button class="filter-btn" @click="dropdownOpen = !dropdownOpen">
          Groupes
          <span class="filter-count">{{ selected.length }}/{{ (groups ?? []).length }}</span>
          <span class="caret">{{ dropdownOpen ? '▲' : '▼' }}</span>
        </button>

        <div v-if="dropdownOpen" class="dropdown">
          <div class="dropdown-header">
            <button class="select-all-btn" @click="toggleAll">
              {{ allSelected ? 'Tout désélectionner' : 'Tout sélectionner' }}
            </button>
          </div>
          <label v-for="g in groups" :key="g.name" class="dropdown-item">
            <input type="checkbox" :value="g.name" v-model="selected" />
            <span>{{ g.name }}</span>
          </label>
        </div>
      </div>
    </div>

    <div class="heatmap-scroll">
      <table v-if="filtered.length && allWeeks.length" class="heatmap-table">
        <thead>
          <tr>
            <th class="label-col"></th>
            <th v-for="w in allWeeks" :key="w" class="week-col">{{ w }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in filtered" :key="g.name">
            <td class="row-label" :title="g.name">{{ g.name }}</td>
            <td
              v-for="w in allWeeks"
              :key="w"
              class="heat-cell"
              :style="cellStyle(g, w)"
              :title="cellTitle(g, w)"
              @click="emit('cell-click', { group: g.name, week: w })"
            >
              <span class="cell-text">{{ cellText(g, w) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">Aucune donnée</div>
    </div>

    <div class="legend">
      <span class="legend-label">0%</span>
      <div class="legend-gradient"></div>
      <span class="legend-label">100%</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  title:  String,
  groups: Array, // Array<{ name, weekMap: Record<week, { compliant, nonCompliant }> }>
  theme:  { type: String, default: 'dark' },
})
const emit = defineEmits(['cell-click'])

// Custom directive to close dropdown on outside click
const vClickOutside = {
  mounted(el, binding) {
    el._clickOutside = (e) => { if (!el.contains(e.target)) binding.value(e) }
    document.addEventListener('click', el._clickOutside)
  },
  unmounted(el) {
    document.removeEventListener('click', el._clickOutside)
  },
}

const selected    = ref([])
const dropdownOpen = ref(false)

watch(
  () => props.groups,
  (groups) => {
    const names = (groups ?? []).map((g) => g.name)
    if (selected.value.length === 0) {
      selected.value = [...names]
    } else {
      selected.value = selected.value.filter((n) => names.includes(n))
    }
  },
  { immediate: true }
)

const filtered = computed(() =>
  (props.groups ?? []).filter((g) => selected.value.includes(g.name))
)

const allSelected = computed(() => selected.value.length === (props.groups ?? []).length)

function toggleAll() {
  selected.value = allSelected.value ? [] : (props.groups ?? []).map((g) => g.name)
}

// Union of all week keys across filtered groups, sorted
const allWeeks = computed(() => {
  const set = new Set()
  for (const g of filtered.value) Object.keys(g.weekMap).forEach(w => set.add(w))
  return Array.from(set).sort()
})

function pct(g, w) {
  const v = g.weekMap[w]
  if (!v) return null
  const total = v.compliant + v.nonCompliant
  return total ? Math.round(v.compliant / total * 100) : null
}

function cellStyle(g, w) {
  const p = pct(g, w)
  if (p === null) return { background: 'transparent' }

  // Interpolate red (0%) → yellow (50%) → green (100%)
  let r, gr, b
  if (p <= 50) {
    const t = p / 50
    r  = 220
    gr = Math.round(38 + t * (161 - 38))   // 38 → 161
    b  = 38
  } else {
    const t = (p - 50) / 50
    r  = Math.round(220 - t * (220 - 34))  // 220 → 34
    gr = Math.round(161 + t * (197 - 161)) // 161 → 197
    b  = Math.round(38 + t * (94 - 38))    // 38 → 94
  }
  const alpha = props.theme === 'light' ? 0.85 : 0.75
  return {
    background:  `rgba(${r},${gr},${b},${alpha})`,
    color: p < 40 ? '#fff' : (props.theme === 'light' ? '#1e293b' : '#f1f5f9'),
  }
}

function cellText(g, w) {
  const p = pct(g, w)
  return p === null ? '—' : `${p}%`
}

function cellTitle(g, w) {
  const v = g.weekMap[w]
  if (!v) return `${g.name} – ${w}: aucune donnée`
  const total = v.compliant + v.nonCompliant
  const p = pct(g, w)
  return `${g.name} – ${w}: ${p}% (${v.compliant}/${total})`
}
</script>

<style scoped>
.chart-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px 24px;
  box-sizing: border-box;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.chart-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.filter-wrap {
  position: relative;
}

.filter-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 0.8rem;
  padding: 5px 12px;
  cursor: pointer;
}
.filter-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.filter-count {
  background: var(--border);
  border-radius: 10px;
  padding: 1px 6px;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.caret {
  font-size: 0.65rem;
  color: var(--text-muted);
}

.dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 10;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 200px;
  max-height: 280px;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.dropdown-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.select-all-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  font-size: 0.82rem;
  color: var(--text);
  cursor: pointer;
  user-select: none;
}
.dropdown-item:hover {
  background: rgba(255, 255, 255, 0.04);
}
.dropdown-item input[type='checkbox'] {
  accent-color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
}

/* Heatmap */
.heatmap-scroll {
  flex: 1;
  overflow: auto;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.heatmap-table {
  border-collapse: collapse;
  font-size: 0.78rem;
  white-space: nowrap;
}

.label-col {
  min-width: 140px;
  max-width: 180px;
  padding: 0;
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--card-bg);
}

.week-col {
  min-width: 52px;
  padding: 4px 2px;
  text-align: center;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 0.7rem;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  height: 70px;
  vertical-align: bottom;
}

.row-label {
  padding: 0 10px 0 0;
  color: var(--text);
  text-align: right;
  font-size: 0.8rem;
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--card-bg);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.heat-cell {
  min-width: 52px;
  height: 32px;
  text-align: center;
  border-radius: 4px;
  padding: 0 2px;
  cursor: pointer;
  transition: opacity 0.15s;
}
.heat-cell:hover {
  opacity: 0.85;
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}

.cell-text {
  font-size: 0.72rem;
  font-weight: 600;
  pointer-events: none;
}

.empty {
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 20px 0;
  text-align: center;
}

/* Legend */
.legend {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.legend-label {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.legend-gradient {
  flex: 1;
  height: 10px;
  border-radius: 4px;
  background: linear-gradient(to right,
    rgba(220, 38, 38, 0.8),
    rgba(220, 161, 38, 0.8),
    rgba(34, 197, 94, 0.8)
  );
}
</style>
