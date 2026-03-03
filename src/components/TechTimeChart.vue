<template>
  <div class="chart-card" v-click-outside="() => (dropdownOpen = false)">
    <div class="chart-header">
      <h3 class="chart-title">{{ title }}</h3>
      <div class="filter-wrap">
        <button class="filter-btn" @click="dropdownOpen = !dropdownOpen">
          Groups
          <span class="filter-count">{{ selected.length }}/{{ groups.length }}</span>
          <span class="caret">{{ dropdownOpen ? '▲' : '▼' }}</span>
        </button>
        <div v-if="dropdownOpen" class="dropdown">
          <div class="dropdown-header">
            <button class="select-all-btn" @click="toggleAll">
              {{ allSelected ? 'Deselect all' : 'Select all' }}
            </button>
          </div>
          <label v-for="g in groups" :key="g.group" class="dropdown-item">
            <input type="checkbox" :value="g.group" v-model="selected" />
            <span>{{ g.group }}</span>
          </label>
        </div>
      </div>
    </div>

    <div v-if="!filteredGroups.length" class="empty">No data</div>

    <div v-else class="rows">
      <template v-for="g in filteredGroups" :key="g.group">
        <!-- Group header -->
        <div class="group-row" @click="toggle(g.group)">
          <span class="expand-icon">{{ expanded.has(g.group) ? '▾' : '▸' }}</span>
          <span class="row-label">{{ g.group }}</span>
          <div class="bar-track">
            <div class="bar-fill group-fill" :style="{ width: pct(g.avgDays) + '%' }" />
          </div>
          <span class="row-val">{{ g.avgDays }}d</span>
          <span class="row-count">{{ g.count }}</span>
        </div>

        <!-- Tech children -->
        <template v-if="expanded.has(g.group)">
          <div v-for="t in g.techs" :key="t.name" class="tech-row">
            <span class="tech-indent">└</span>
            <span class="row-label">{{ t.name }}</span>
            <div class="bar-track">
              <div class="bar-fill tech-fill" :style="{ width: pct(t.avgDays) + '%' }" />
            </div>
            <span class="row-val">{{ t.avgDays }}d</span>
            <span class="row-count">{{ t.count }}</span>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  title: String,
  // [{ group, avgDays, count, techs: [{ name, avgDays, count }] }]
  groups: { type: Array, default: () => [] },
  theme: { type: String, default: 'dark' },
})

// ── Group filter ──────────────────────────────────────────────────────────────
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

watch(() => props.groups, (gs) => {
  const names = gs.map(g => g.group)
  if (selected.value.length === 0) {
    selected.value = [...names]
  } else {
    selected.value = selected.value.filter(n => names.includes(n))
  }
}, { immediate: true })

const allSelected = computed(() => selected.value.length === props.groups.length)
const filteredGroups = computed(() => props.groups.filter(g => selected.value.includes(g.group)))

function toggleAll() {
  selected.value = allSelected.value ? [] : props.groups.map(g => g.group)
}

// ── Expand/collapse ───────────────────────────────────────────────────────────
const expanded = ref(new Set())

// Auto-expand all groups when data arrives
watch(() => props.groups, (gs) => {
  expanded.value = new Set(gs.map(g => g.group))
}, { immediate: true })

function toggle(group) {
  const next = new Set(expanded.value)
  if (next.has(group)) next.delete(group)
  else next.add(group)
  expanded.value = next
}

// Max avgDays across visible groups AND all their techs — shared scale
const maxVal = computed(() => {
  let m = 0
  for (const g of filteredGroups.value) {
    if (g.avgDays > m) m = g.avgDays
    for (const t of g.techs) if (t.avgDays > m) m = t.avgDays
  }
  return m || 1
})

function pct(val) {
  return Math.round((val / maxVal.value) * 100)
}
</script>

<style scoped>
.chart-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px 24px;
  width: 100%;
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
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
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
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
.dropdown-item:hover { background: rgba(255,255,255,0.04); }
.dropdown-item input[type='checkbox'] {
  accent-color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
}

.empty {
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 16px 0;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 400px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

/* shared row layout */
.group-row,
.tech-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
}

.group-row {
  cursor: pointer;
  font-weight: 600;
  font-size: 0.84rem;
  color: var(--text);
  border-top: 1px solid var(--border);
}
.group-row:first-child { border-top: none; }
.group-row:hover { background: rgba(255,255,255,0.03); border-radius: 4px; }

.tech-row {
  font-size: 0.82rem;
  color: var(--text-muted);
  font-weight: 400;
}
.tech-row:hover { background: rgba(255,255,255,0.02); border-radius: 4px; }

.expand-icon {
  width: 14px;
  flex-shrink: 0;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.tech-indent {
  width: 14px;
  flex-shrink: 0;
  padding-left: 4px;
  color: var(--border);
}

.row-label {
  width: 160px;
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-track {
  flex: 1;
  height: 8px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.4s ease;
}

.group-fill { background: rgba(167,139,250,0.85); }
.tech-fill  { background: rgba(167,139,250,0.45); }

.row-val {
  width: 44px;
  text-align: right;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  flex-shrink: 0;
}

.row-count {
  width: 36px;
  text-align: right;
  font-size: 0.78rem;
  color: var(--text-muted);
  flex-shrink: 0;
}
</style>
