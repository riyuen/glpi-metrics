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
  // Array of { week, compliant, nonCompliant }
  weekData: Array,
  theme: { type: String, default: 'dark' },
})

const C = computed(() => props.theme === 'light'
  ? { tick: '#475569', grid: '#cbd5e1', gridFaint: '#f1f5f9' }
  : { tick: '#94a3b8', grid: '#334155', gridFaint: '#1e293b' }
)

const canvas = ref(null)

function buildChart() {
  const existing = Chart.getChart(canvas.value)
  if (existing) existing.destroy()

  if (!props.weekData?.length) return

  const labels = props.weekData.map((d) => d.week)
  const compliant = props.weekData.map((d) => d.compliant)
  const nonCompliant = props.weekData.map((d) => d.nonCompliant)

  new Chart(canvas.value, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: {
      labels,
      datasets: [
        {
          label: 'Compliant',
          data: compliant,
          backgroundColor: 'rgba(16,185,129,0.8)',
          borderRadius: 3,
        },
        {
          label: 'Non-compliant',
          data: nonCompliant,
          backgroundColor: 'rgba(239,68,68,0.8)',
          borderRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: C.value.tick, boxWidth: 12, padding: 16 },
        },
        datalabels: {
          color: '#fff',
          font: { size: 11, weight: 'bold' },
          formatter: (value) => (value > 0 ? value : ''),
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: C.value.tick, maxRotation: 45 },
          grid: { color: C.value.gridFaint },
        },
        y: {
          stacked: true,
          ticks: { color: C.value.tick, precision: 0 },
          grid: { color: C.value.grid },
          beginAtZero: true,
        },
      },
    },
  })
}

onMounted(() => {
  watch([() => props.weekData, () => props.theme], buildChart, { deep: true, immediate: true })
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
