<template>
  <div class="chart-card">
    <h3 class="chart-title">{{ title }}</h3>
    <div class="canvas-wrap">
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
  labels: Array,
  data: Array,
  color: { type: String, default: '#f59e0b' },
  theme: { type: String, default: 'dark' },
  highlightedPeriods: { type: Array, default: () => [] },
})
const emit = defineEmits(['item-click'])

const C = computed(() => props.theme === 'light'
  ? { tick: '#475569', grid: '#cbd5e1', gridFaint: '#f1f5f9' }
  : { tick: '#94a3b8', grid: '#334155', gridFaint: '#1e293b' }
)

const canvas = ref(null)

function buildChart() {
  const existing = Chart.getChart(canvas.value)
  if (existing) existing.destroy()

  if (!props.labels?.length) return

  const hl = new Set(props.highlightedPeriods)
  const hasHl = hl.size > 0
  const dimColor = props.color.replace(/[\d.]+\)$/, '0.12)')
  const colors = props.labels.map((l) => hasHl && !hl.has(l) ? dimColor : props.color)

  new Chart(canvas.value, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: {
      labels: props.labels,
      datasets: [
        {
          data: props.data,
          backgroundColor: colors,
          borderRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements.length > 0) emit('item-click', props.labels[elements[0].index])
      },
      onHover: (event, elements) => {
        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'
      },
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: 'center',
          align: 'center',
          color: '#fff',
          font: { size: 11, weight: 'bold' },
          formatter: (value) => (value > 0 ? value : ''),
        },
      },
      scales: {
        x: {
          ticks: { color: C.value.tick, maxRotation: 45 },
          grid: { color: C.value.gridFaint },
        },
        y: {
          ticks: { color: C.value.tick, precision: 0 },
          grid: { color: C.value.grid },
          beginAtZero: true,
        },
      },
    },
  })
}

onMounted(() => {
  watch([() => props.labels, () => props.data, () => props.theme, () => props.highlightedPeriods], buildChart, { deep: true, immediate: true })
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
}
.chart-title {
  margin: 0 0 16px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.canvas-wrap {
  height: 220px;
}
</style>
