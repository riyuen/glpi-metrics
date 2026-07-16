<template>
  <div class="chart-card">
    <h3 class="chart-title">{{ title }}</h3>
    <div v-if="horizontal" class="canvas-scroll">
      <div class="canvas-wrap-h" :style="{ height: Math.max(160, (labels?.length ?? 0) * 44) + 'px' }">
        <canvas ref="canvas" />
      </div>
    </div>
    <div v-else class="canvas-wrap">
      <canvas ref="canvas" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import Chart from 'chart.js/auto'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { withAlpha } from '../../lib/colors.js'

const props = defineProps({
  title: String,
  labels: Array,
  // [{ name, data: [Number|null], color }] — raw values (counts or converted durations)
  series: { type: Array, default: () => [] },
  // per-bar colors for a single series (categorical); overrides series color
  itemColors: { type: Array, default: null },
  stacked: { type: Boolean, default: false },
  horizontal: { type: Boolean, default: false },
  // 100%-stacked mode: values are converted to per-column percentages, counts kept in tooltips
  percent: { type: Boolean, default: false },
  // time cross-filter: labels NOT in this list get dimmed (null/empty = no highlight)
  highlighted: { type: Array, default: null },
  // own-dimension cross-filter: these labels get dimmed
  dimmedLabels: { type: Array, default: () => [] },
  // value suffix for labels/tooltips ('', 'h', 'j', …)
  valueSuffix: { type: String, default: '' },
  theme: { type: String, default: 'dark' },
})
const emit = defineEmits(['item-click'])

const C = computed(() => props.theme === 'light'
  ? { tick: '#475569', grid: '#cbd5e1', gridFaint: '#f1f5f9' }
  : { tick: '#94a3b8', grid: '#334155', gridFaint: '#1e293b' }
)

const canvas = ref(null)

function isDim(label) {
  if (props.dimmedLabels?.includes(label)) return true
  if (props.highlighted?.length && !props.highlighted.includes(label)) return true
  return false
}

function buildChart() {
  const existing = Chart.getChart(canvas.value)
  if (existing) existing.destroy()

  if (!props.labels?.length || !props.series?.length) return

  const multi = props.series.length > 1

  // Column totals for percent mode
  const totals = props.labels.map((_, i) =>
    props.series.reduce((s, ser) => s + (ser.data[i] ?? 0), 0)
  )

  const datasets = props.series.map((ser, si) => {
    const baseFor = (i) =>
      (!multi && props.itemColors?.[i]) || ser.color || '#38bdf8'
    return {
      label: ser.name,
      counts: ser.data,
      data: props.percent
        ? ser.data.map((v, i) => totals[i] > 0 ? Math.round(((v ?? 0) / totals[i]) * 100) : 0)
        : ser.data,
      backgroundColor: props.labels.map((l, i) => isDim(l) ? withAlpha(baseFor(i), 0.12) : baseFor(i)),
      borderRadius: 3,
    }
  })

  const valueAxis = {
    stacked: props.stacked,
    beginAtZero: true,
    ...(props.percent ? { min: 0, max: 100 } : {}),
    ticks: {
      color: C.value.tick,
      precision: props.valueSuffix ? undefined : 0,
      callback: (v) => props.percent ? `${v}%` : `${v}${props.valueSuffix}`,
    },
    grid: { color: C.value.grid },
  }
  const labelAxis = {
    stacked: props.stacked,
    ticks: { color: C.value.tick, ...(props.horizontal ? {} : { maxRotation: 45 }) },
    grid: { color: C.value.gridFaint },
  }

  new Chart(canvas.value, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: { labels: props.labels, datasets },
    options: {
      indexAxis: props.horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements.length > 0) emit('item-click', elements[0].index)
      },
      onHover: (event, elements) => {
        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'
      },
      plugins: {
        legend: multi
          ? { display: true, labels: { color: C.value.tick, boxWidth: 12, padding: 16 } }
          : { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const idx = items[0].dataIndex
              return props.percent
                ? `${items[0].label}  (${totals[idx]} ticket${totals[idx] > 1 ? 's' : ''})`
                : items[0].label
            },
            label: (item) => {
              if (item.raw == null) return null
              if (props.percent) {
                const count = item.dataset.counts[item.dataIndex] ?? 0
                return ` ${item.dataset.label}: ${count} (${item.raw}%)`
              }
              const name = multi ? `${item.dataset.label}: ` : ' '
              return ` ${name}${item.raw}${props.valueSuffix}`
            },
          },
        },
        datalabels: {
          anchor: 'center',
          align: 'center',
          color: '#fff',
          font: { size: 11, weight: 'bold' },
          formatter: (value, ctx) => {
            if (!value) return ''
            if (isDim(props.labels[ctx.dataIndex])) return ''
            return props.percent ? `${value}%` : `${value}${props.valueSuffix}`
          },
        },
      },
      scales: props.horizontal
        ? { x: valueAxis, y: labelAxis }
        : { x: labelAxis, y: valueAxis },
    },
  })
}

onMounted(() => {
  watch(
    [() => props.labels, () => props.series, () => props.itemColors, () => props.theme,
     () => props.highlighted, () => props.dimmedLabels, () => props.percent],
    buildChart,
    { deep: true, immediate: true }
  )
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
.canvas-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.canvas-wrap-h { position: relative; }
</style>
