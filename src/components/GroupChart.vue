<template>
  <div class="chart-card" v-click-outside="() => (dropdownOpen = false)">
    <div class="chart-header">
      <h3 class="chart-title">{{ title }}</h3>
      <div class="filter-wrap">
        <button class="filter-btn" @click="dropdownOpen = !dropdownOpen">
          Groups
          <span class="filter-count">{{ selected.length }}/{{ (groups ?? []).length }}</span>
          <span class="caret">{{ dropdownOpen ? '▲' : '▼' }}</span>
        </button>

        <div v-if="dropdownOpen" class="dropdown">
          <div class="dropdown-header">
            <button class="select-all-btn" @click="toggleAll">
              {{ allSelected ? 'Deselect all' : 'Select all' }}
            </button>
          </div>
          <label v-for="g in groups" :key="g.name" class="dropdown-item">
            <input type="checkbox" :value="g.name" v-model="selected" />
            <span>{{ g.name }}</span>
          </label>
        </div>
      </div>
    </div>

    <div class="canvas-wrap" :style="{ height: Math.max(160, filtered.length * 44) + 'px' }">
      <canvas ref="canvas" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import Chart from 'chart.js/auto'
import ChartDataLabels from 'chartjs-plugin-datalabels'

const props = defineProps({
  title: String,
  groups: Array, // [{ name, compliant, nonCompliant }]
  theme: { type: String, default: 'dark' },
})
const emit = defineEmits(['item-click'])

const C = computed(() => props.theme === 'light'
  ? { tick: '#475569', grid: '#cbd5e1', gridFaint: '#f1f5f9' }
  : { tick: '#94a3b8', grid: '#334155', gridFaint: '#1e293b' }
)

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

const selected = ref([])
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

const canvas = ref(null)

function buildChart() {
  const existing = Chart.getChart(canvas.value)
  if (existing) existing.destroy()

  if (!filtered.value.length) return

  const pct = (g) => {
    const total = g.compliant + g.nonCompliant
    return total === 0 ? [0, 0] : [
      Math.round((g.compliant / total) * 100),
      Math.round((g.nonCompliant / total) * 100),
    ]
  }

  const compliantCounts    = filtered.value.map((g) => g.compliant)
  const nonCompliantCounts = filtered.value.map((g) => g.nonCompliant)
  const totalCounts        = filtered.value.map((g) => g.compliant + g.nonCompliant)

  new Chart(canvas.value, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: {
      labels: filtered.value.map((g) => g.name),
      datasets: [
        {
          label: 'Compliant',
          data: filtered.value.map((g) => pct(g)[0]),
          counts: compliantCounts,
          backgroundColor: 'rgba(16,185,129,0.8)',
          borderRadius: 3,
        },
        {
          label: 'Non-compliant',
          data: filtered.value.map((g) => pct(g)[1]),
          counts: nonCompliantCounts,
          backgroundColor: 'rgba(239,68,68,0.8)',
          borderRadius: 3,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements.length > 0) emit('item-click', filtered.value[elements[0].index].name)
      },
      onHover: (event, elements) => {
        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'
      },
      plugins: {
        legend: {
          display: true,
          labels: { color: C.value.tick, boxWidth: 12, padding: 16 },
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const idx = items[0].dataIndex
              return `${items[0].label}  (${totalCounts[idx]} tickets)`
            },
            label: (item) => {
              const count = item.dataset.counts[item.dataIndex]
              return ` ${item.dataset.label}: ${count} (${item.raw}%)`
            },
          },
        },
        datalabels: {
          anchor: 'center',
          align: 'center',
          color: '#fff',
          font: { size: 11, weight: 'bold' },
          formatter: (value) => (value > 0 ? `${value}%` : ''),
        },
      },
      scales: {
        x: {
          stacked: true,
          min: 0,
          max: 100,
          ticks: { color: C.value.tick, callback: (v) => `${v}%` },
          grid: { color: C.value.grid },
        },
        y: {
          stacked: true,
          ticks: { color: C.value.tick },
          grid: { color: C.value.gridFaint },
        },
      },
    },
  })
}

onMounted(() => {
  watch([filtered, () => props.theme], buildChart, { deep: true, immediate: true })
})

onUnmounted(() => {
  Chart.getChart(canvas.value)?.destroy()
})
</script>

<style scoped>
.chart-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px 24px;
  width: 100%;
  position: relative;
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

.canvas-wrap {
  min-height: 160px;
}
</style>
