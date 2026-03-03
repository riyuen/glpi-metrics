<template>
  <div class="line-chart-card">
    <h3 class="chart-title">{{ title }}</h3>
    <div class="canvas-wrap" :style="{ height: height + 'px' }">
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
  height: { type: Number, default: 220 },
})
const emit = defineEmits(['item-click'])

const C = computed(() => props.theme === 'light'
  ? { tick: '#475569', grid: '#cbd5e1', gridFaint: '#f1f5f9' }
  : { tick: '#94a3b8', grid: '#334155', gridFaint: '#1e293b' }
)

const canvas = ref(null)

const toD = (h) => h != null ? +(h / 24).toFixed(2) : null
const fmtD = (d) => d != null ? d + 'd' : '—'

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
      ctx.fillText(fmtD(val), chartArea.right - 4, yPx - 2)
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

    const targetD = toD(group.targetH)

    const actualIdx = chartDatasets.length
    chartDatasets.push({
      label: group.name,
      data: group.data.map(toD),
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
        label: `${group.name} target (${fmtD(targetD)})`,
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
          // Clicking an SLA type in the legend toggles both its actual line and target together
          onClick: (e, legendItem, legend) => {
            const ci = legend.chart
            const clicked = pairs.find(p => p.actual === legendItem.datasetIndex)
            if (!clicked) return
            // If this group is already the only visible one, restore all; otherwise isolate it
            const alreadyIsolated = ci.isDatasetVisible(clicked.actual) &&
              pairs.every(p => p.actual === clicked.actual || !ci.isDatasetVisible(p.actual))
            pairs.forEach(p => {
              const visible = alreadyIsolated || p.actual === clicked.actual
              ci[visible ? 'show' : 'hide'](p.actual)
              if (p.target != null) ci[visible ? 'show' : 'hide'](p.target)
            })
          },
        },
        tooltip: {
          callbacks: {
            label: (item) => {
              const val = item.raw
              if (val == null) return null
              return item.dataset._isTarget
                ? ` ${item.dataset.label}`
                : ` ${item.dataset.label}: ${fmtD(val)}`
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
            callback: (v) => fmtD(v),
          },
          grid: { color: C.value.grid },
        },
      },
    },
  })
}

onMounted(() => {
  watch(
    [() => props.labels, () => props.datasets, () => props.theme, () => props.highlightedPeriods],
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
}
</style>
