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

const PALETTE = [
  '#38bdf8', '#a78bfa', '#34d399', '#fb923c',
  '#f87171', '#fbbf24', '#e879f9', '#4ade80',
  '#60a5fa', '#f472b6',
]

const props = defineProps({
  title: String,
  // Array of [label, count] pairs
  items: Array,
  theme: { type: String, default: 'dark' },
})
const emit = defineEmits(['item-click'])

const C = computed(() => props.theme === 'light'
  ? { tick: '#475569', pieBorder: '#ffffff' }
  : { tick: '#94a3b8', pieBorder: '#0f172a' }
)

const canvas = ref(null)

function buildChart() {
  const existing = Chart.getChart(canvas.value)
  if (existing) existing.destroy()

  if (!props.items?.length) return

  const labels = props.items.map(([label]) => label)
  const data = props.items.map(([, count]) => count)
  const total = data.reduce((s, v) => s + v, 0)

  new Chart(canvas.value, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: PALETTE,
        borderColor: C.value.pieBorder,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements.length > 0) emit('item-click', props.items[elements[0].index][0])
      },
      onHover: (event, elements) => {
        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'
      },
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: C.value.tick,
            boxWidth: 12,
            padding: 10,
            font: { size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            label: (item) => {
              const pct = Math.round((item.raw / total) * 100)
              return ` ${item.raw} tickets (${pct}%)`
            },
          },
        },
      },
    },
  })
}

onMounted(() => {
  watch([() => props.items, () => props.theme], buildChart, { deep: true, immediate: true })
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
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.chart-title {
  margin: 0 0 16px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}
.canvas-wrap {
  flex: 1;
  min-height: 0;
  position: relative;
}
</style>
