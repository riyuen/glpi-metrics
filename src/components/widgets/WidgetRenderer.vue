<template>
  <StatCard v-if="payload.kind === 'stat'" :label="title" :value="payload.value" />

  <TechTimeChart
    v-else-if="payload.kind === 'techTree'"
    :title="title"
    :groups="payload.groups"
    :theme="theme"
  />

  <GroupChart
    v-else-if="payload.kind === 'heatmap'"
    :title="title"
    :groups="payload.groups"
    :theme="theme"
  />

  <div v-else-if="payload.kind === 'empty' || !payload.labels?.length" class="chart-card empty-card">
    <h3 class="chart-title">{{ title }}</h3>
    <p class="empty-msg">Aucune donnée</p>
  </div>

  <BarChart
    v-else-if="renderAs === 'htmlBar'"
    :title="title"
    :items="htmlBarItems"
    @item-click="onValueClick"
  />

  <GenericBar
    v-else-if="renderAs === 'genericBar'"
    :title="title"
    :labels="payload.labels"
    :series="convertedSeries"
    :item-colors="payload.itemColors"
    :stacked="stacked"
    :horizontal="widget.chartType === 'hbar'"
    :percent="payload.meta.percent"
    :highlighted="payload.meta.highlighted"
    :dimmed-labels="dimmedLabels"
    :value-suffix="valueSuffix"
    :theme="theme"
    @item-click="onIndexClick"
  />

  <LineChart
    v-else-if="renderAs === 'line'"
    :title="title"
    :labels="payload.labels"
    :data="convertedSeries[0].data"
    :theme="theme"
    :highlighted-periods="payload.meta.highlighted ?? []"
    :value-suffix="valueSuffix"
    @item-click="onLabelClick"
  />

  <MultiLineChart
    v-else-if="renderAs === 'multiLine'"
    :title="title"
    :labels="payload.labels"
    :series="payload.series"
    :is-duration="payload.meta.isDuration"
    :initial-unit="widget.options?.unit ?? 'days'"
    :theme="theme"
    @item-click="onIndexClick"
  />

  <PieChart
    v-else-if="renderAs === 'pie'"
    :title="title"
    :items="pieItems"
    :colors="payload.itemColors"
    :cutout="widget.chartType === 'donut' ? '55%' : null"
    :dimmed-labels="dimmedLabels"
    :theme="theme"
    @item-click="onLabelClick"
  />

  <WidgetTable
    v-else
    :title="title"
    :labels="payload.labels"
    :series="convertedSeries"
    :dimension-label="dimensionLabel"
    :value-suffix="valueSuffix"
    :dimmed-labels="dimmedLabels"
    :clickable="payload.meta.filterKey != null"
    @item-click="onIndexClick"
  />
</template>

<script setup>
import { computed } from 'vue'
import StatCard from '../StatCard.vue'
import BarChart from '../BarChart.vue'
import LineChart from '../LineChart.vue'
import PieChart from '../PieChart.vue'
import TechTimeChart from '../TechTimeChart.vue'
import GroupChart from '../GroupChart.vue'
import GenericBar from './GenericBar.vue'
import MultiLineChart from './MultiLineChart.vue'
import WidgetTable from './WidgetTable.vue'
import { DIMENSIONS, displayTitle } from '../../lib/registry.js'
import { resolveDimKey } from '../../lib/aggregate.js'

const props = defineProps({
  widget: { type: Object, required: true },
  payload: { type: Object, required: true },
  theme: { type: String, default: 'dark' },
  period: { type: String, default: 'week' },
})
const emit = defineEmits(['select'])

const title = computed(() => displayTitle(props.widget, props.period))

const dimensionLabel = computed(() => {
  const dimKey = resolveDimKey(props.widget.dimension, props.period)
  return DIMENSIONS[dimKey]?.label ?? 'Valeur'
})

// Which concrete renderer handles this payload
const renderAs = computed(() => {
  const { chartType } = props.widget
  const meta = props.payload.meta ?? {}
  const multi = (props.payload.series?.length ?? 0) > 1
  switch (chartType) {
    case 'bar':
      return (meta.isTime || multi) ? 'genericBar' : 'htmlBar'
    case 'stackedBar':
    case 'hbar':
      return 'genericBar'
    case 'line': {
      const hasTargets = props.payload.series?.some(s => s.targetH != null)
      return (multi || hasTargets || meta.isDuration) ? 'multiLine' : 'line'
    }
    case 'pie':
    case 'donut':
      return 'pie'
    case 'table':
      return 'table'
    default:
      return 'genericBar'
  }
})

const stacked = computed(() =>
  props.widget.chartType === 'stackedBar' ||
  (props.widget.chartType === 'hbar' && (props.payload.series?.length ?? 0) > 1)
)

// Duration data is computed in hours; convert once when displaying days
const valueSuffix = computed(() => props.payload.meta?.unit ?? '')

const convertedSeries = computed(() => {
  const meta = props.payload.meta ?? {}
  if (!meta.isDuration || meta.unit !== 'j') return props.payload.series ?? []
  return (props.payload.series ?? []).map(s => ({
    ...s,
    data: s.data.map(v => v == null ? null : +(v / 24).toFixed(1)),
  }))
})

// Raw values → labels for components that dim by label
const dimmedLabels = computed(() => {
  const dimmed = props.payload.meta?.dimmedValues
  if (!dimmed?.length) return []
  return dimmed.map(v => props.payload.labels[props.payload.values.indexOf(v)]).filter(l => l != null)
})

const htmlBarItems = computed(() =>
  props.payload.labels.map((label, i) => ({
    label,
    count: props.payload.series[0].data[i] ?? 0,
    color: props.payload.itemColors?.[i] ?? '#38bdf8',
    code: props.payload.values[i],
    dimmed: props.payload.meta?.dimmedValues?.includes(props.payload.values[i]) ?? false,
  }))
)

const pieItems = computed(() =>
  props.payload.labels.map((label, i) => [label, props.payload.series[0].data[i] ?? 0])
)

function emitSelect(value) {
  const filterKey = props.payload.meta?.filterKey
  if (filterKey == null || value == null) return
  emit('select', { filterKey, value })
}

const onValueClick = (value) => emitSelect(value)
const onIndexClick = (index) => emitSelect(props.payload.values?.[index])
const onLabelClick = (label) => {
  const idx = props.payload.labels.indexOf(label)
  if (idx >= 0) emitSelect(props.payload.values?.[idx])
}
</script>

<style scoped>
.empty-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px 24px;
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
.empty-msg {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
