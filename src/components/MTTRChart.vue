<template>
  <div class="line-chart-card">
    <div class="chart-header">
      <h3 class="chart-title">{{ title }}</h3>
      <div class="unit-toggle">
        <button :class="{ active: unit === 'hours' }" @click="unit = 'hours'">Heures</button>
        <button :class="{ active: unit === 'days'  }" @click="unit = 'days'">Jours</button>
      </div>
    </div>
    <div class="canvas-wrap">
      <canvas ref="canvas" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import Chart from 'chart.js/auto'

// One solid color per SLA group; target lines reuse the same color at lower opacity
const PALETTE = ['#a78bfa', '#38bdf8', '#34d399', '#fb923c', '#f87171', '#fbbf24', '#e879f9', '#4ade80']

const props = defineProps({
  title: String,
  labels:   Array,
  // [{ name, targetH, data: [hours|null, …] }] — hours converted to days for display
  datasets: { type: Array, default: () => [] },
  theme: { type: String, default: 'dark' },
  highlightedPeriods: { type: Array, default: () => [] },
})
const emit = defineEmits(['item-click'])

const C = computed(() => props.theme === 'light'
  ? { tick: '#475569', grid: '#cbd5e1', gridFaint: '#f1f5f9' }
  : { tick: '#94a3b8', grid: '#334155', gridFaint: '#1e293b' }
)

const canvas = ref(null)
const unit = ref('days')

const toU = (h) => {
  if (h == null) return null
  return unit.value === 'hours' ? +h.toFixed(1) : +(h / 24).toFixed(2)
}
const fmtU = (v) => v != null ? v + (unit.value === 'hours' ? 'h' : 'j') : '—'

const targetLabelPlugin = {
  id: 'mttrTargetLabels',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea, scales: { y } } = chart
    chart.data.datasets.forEach((ds, i) => {
      if (!ds._isTarget || !chart.isDatasetVisible(i)) return
      const val = ds.data[0]
      if (val == null) return
      const yPx = y.getPixelForValue(val)
      ctx.save()
      ctx.fillStyle = ds.borderColor
      ctx.globalAlpha = 0.85
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      ctx.fillText(fmtU(val), chartArea.right - 4, yPx - 2)
      ctx.restore()
    })
  },
}

function buildChart() {
  const existing = Chart.getChart(canvas.value)
  if (existing) existing.destroy()

  if (!props.labels?.length || !props.datasets?.length) return

  const chartDatasets = []
  // pairs[i] = { actual: datasetIndex, target: datasetIndex|null }
  const pairs = []

  props.datasets.forEach((group, i) => {
    const color = PALETTE[i % PALETTE.length]

    const targetD = toU(group.targetH)

    const actualIdx = chartDatasets.length
    chartDatasets.push({
      label: group.name,
      data: group.data.map(toU),
      borderColor: color,
      backgroundColor: 'transparent',
      borderWidth: 2,
      tension: 0.3,
      fill: false,
      spanGaps: true,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: color,
      _isTarget: false,
    })

    let targetIdx = null
    if (targetD != null) {
      targetIdx = chartDatasets.length
      chartDatasets.push({
        label: `${group.name} target (${fmtU(targetD)})`,
        data: Array(props.labels.length).fill(targetD),
        borderColor: color,
        borderDash: [6, 3],
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0,
        spanGaps: true,
        _isTarget: true,
      })
    }

    pairs.push({ actual: actualIdx, target: targetIdx })
  })

  new Chart(canvas.value, {
    type: 'line',
    data: { labels: props.labels, datasets: chartDatasets },
    plugins: [targetLabelPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 8 } },
      onClick: (event, elements) => {
        if (elements.length > 0) emit('item-click', props.labels[elements[0].index])
      },
      onHover: (event, elements) => {
        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: C.value.tick,
            boxWidth: 12,
            padding: 14,
            font: { size: 11 },
            // Hide target datasets from the legend — they're controlled by their paired actual line
            generateLabels: (chart) =>
              Chart.defaults.plugins.legend.labels.generateLabels(chart)
                .filter(lbl => !chart.data.datasets[lbl.datasetIndex]?._isTarget),
          },
          onClick: (e, legendItem, legend) => {
            const ci = legend.chart
            const clicked = pairs.find(p => p.actual === legendItem.datasetIndex)
            if (!clicked) return
            const visible = ci.isDatasetVisible(clicked.actual)
            ci[visible ? 'hide' : 'show'](clicked.actual)
            if (clicked.target != null) ci[visible ? 'hide' : 'show'](clicked.target)
          },
        },
        tooltip: {
          callbacks: {
            label: (item) => {
              const val = item.raw
              if (val == null) return null
              return item.dataset._isTarget
                ? ` ${item.dataset.label}`
                : ` ${item.dataset.label}: ${fmtU(val)}`
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: C.value.tick, maxRotation: 45 },
          grid: { color: C.value.gridFaint },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: C.value.tick,
            callback: (v) => fmtU(v),
          },
          grid: { color: C.value.grid },
        },
      },
    },
  })
}

onMounted(() => {
  watch(
    [() => props.labels, () => props.datasets, () => props.theme, () => props.highlightedPeriods, unit],
    buildChart,
    { deep: true, immediate: true }
  )
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
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
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
.unit-toggle {
  display: flex;
  gap: 2px;
  background: var(--border);
  border-radius: 6px;
  padding: 2px;
}
.unit-toggle button {
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 0.75rem;
  padding: 3px 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.unit-toggle button.active {
  background: var(--card-bg);
  color: var(--text);
  font-weight: 600;
}
.canvas-wrap {
  flex: 1;
  min-height: 0;
  position: relative;
}
</style>
