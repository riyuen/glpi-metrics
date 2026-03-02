<template>
  <div class="line-chart-card">
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
  // Safe cleanup — works even if the chart variable drifted out of sync
  const existing = Chart.getChart(canvas.value)
  if (existing) existing.destroy()

  if (!props.labels?.length) return

  const hl = new Set(props.highlightedPeriods)
  const hasHl = hl.size > 0
  const pointColors  = props.labels.map((l) => hasHl && !hl.has(l) ? 'rgba(56,189,248,0.2)' : '#38bdf8')
  const pointRadii   = props.labels.map((l) => hasHl && !hl.has(l) ? 3 : 5)
  const labelColors  = props.labels.map((l) => hasHl && !hl.has(l) ? 'transparent' : C.value.tick)

  new Chart(canvas.value, {
    type: 'line',
    plugins: [ChartDataLabels],
    data: {
      labels: props.labels,
      datasets: [
        {
          data: props.data,
          borderColor: '#38bdf8',
          backgroundColor: hasHl ? 'rgba(56,189,248,0.03)' : 'rgba(56,189,248,0.08)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointRadius: pointRadii,
          pointHoverRadius: 6,
          pointBackgroundColor: pointColors,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      onClick: (event, elements) => {
        if (elements.length > 0) emit('item-click', props.labels[elements[0].index])
      },
      onHover: (event, elements) => {
        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.raw} tickets opened`,
          },
        },
        datalabels: {
          anchor: 'end',
          align: 'top',
          color: (ctx) => labelColors[ctx.dataIndex],
          font: { size: 11 },
          formatter: (value) => value,
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
.line-chart-card {
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
