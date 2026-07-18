<template>
  <div class="date-filter" v-click-outside="() => (open = false)">
    <button class="date-filter-btn" :class="{ active: hasRange }" @click="open = !open">
      <span>{{ label }}</span>
      <span class="caret">{{ open ? '▲' : '▼' }}</span>
    </button>

    <div v-if="open" class="date-dropdown">
      <div class="preset-list">
        <button
          v-for="(presetLabel, key) in PRESET_LABELS"
          :key="key"
          class="preset-item"
          :class="{ active: datePreset === key }"
          @click="selectPreset(key)"
        >{{ presetLabel }}</button>
      </div>

      <div class="custom-range">
        <label class="range-field">
          <span>Du</span>
          <input type="date" v-model="fromDraft" :max="toDraft || undefined" @change="applyCustom" />
        </label>
        <label class="range-field">
          <span>Au</span>
          <input type="date" v-model="toDraft" :min="fromDraft || undefined" @change="applyCustom" />
        </label>
      </div>

      <button class="reset-btn" @click="reset">Réinitialiser</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useFilters } from '../../composables/useFilters.js'

const { activeFilters, datePreset, setDatePreset, setCustomDateRange, clearDateFilter } = useFilters()

const PRESET_LABELS = {
  today:     "Aujourd'hui",
  yesterday: 'Hier',
  last7:     '7 derniers jours',
  last30:    '30 derniers jours',
  thisMonth: 'Ce mois-ci',
  thisYear:  'Cette année',
}

// Custom directive to close the dropdown on outside click (same pattern as GroupChart.vue)
const vClickOutside = {
  mounted(el, binding) {
    el._clickOutside = (e) => { if (!el.contains(e.target)) binding.value(e) }
    document.addEventListener('click', el._clickOutside)
  },
  unmounted(el) {
    document.removeEventListener('click', el._clickOutside)
  },
}

const open = ref(false)
const fromDraft = ref(activeFilters.dateFrom ?? '')
const toDraft = ref(activeFilters.dateTo ?? '')

watch(() => [activeFilters.dateFrom, activeFilters.dateTo], ([from, to]) => {
  fromDraft.value = from ?? ''
  toDraft.value = to ?? ''
})

function selectPreset(key) {
  setDatePreset(key)
  open.value = false
}

function applyCustom() {
  setCustomDateRange(fromDraft.value || null, toDraft.value || null)
}

function reset() {
  clearDateFilter()
  open.value = false
}

function fmtDisplay(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const hasRange = computed(() => activeFilters.dateFrom != null || activeFilters.dateTo != null)

const label = computed(() => {
  if (datePreset.value && PRESET_LABELS[datePreset.value]) return PRESET_LABELS[datePreset.value]
  if (hasRange.value) {
    return `${fmtDisplay(activeFilters.dateFrom) ?? '…'} → ${fmtDisplay(activeFilters.dateTo) ?? '…'}`
  }
  return 'Toutes les dates'
})
</script>

<style scoped>
.date-filter {
  position: relative;
}

.date-filter-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.8rem;
  padding: 5px 12px;
  cursor: pointer;
}
.date-filter-btn:hover { border-color: var(--accent); color: var(--accent); }
.date-filter-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.caret { font-size: 0.65rem; color: inherit; }

.date-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 10;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 220px;
  padding: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preset-item {
  text-align: left;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--text);
  font-size: 0.82rem;
  padding: 6px 8px;
  cursor: pointer;
}
.preset-item:hover { background: rgba(255, 255, 255, 0.04); }
.preset-item.active {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  font-weight: 600;
}

.custom-range {
  display: flex;
  gap: 8px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}

.range-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  font-size: 0.72rem;
  color: var(--text-muted);
}
.range-field input {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 0.78rem;
  padding: 5px 6px;
  outline: none;
  color-scheme: light dark;
}
.range-field input:focus { border-color: var(--accent); }

.reset-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.78rem;
  padding: 6px 10px;
  cursor: pointer;
}
.reset-btn:hover { border-color: var(--text); color: var(--text); }
</style>
