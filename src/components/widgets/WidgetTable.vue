<template>
  <div class="chart-card">
    <h3 class="chart-title">{{ title }}</h3>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th @click="sortBy(-1)">
              {{ dimensionLabel }}
              <span v-if="sortCol === -1" class="sort-arrow">{{ sortDir === 1 ? '▲' : '▼' }}</span>
            </th>
            <th v-for="(s, si) in series" :key="si" class="num" @click="sortBy(si)">
              {{ series.length > 1 ? s.name : 'Valeur' }}
              <span v-if="sortCol === si" class="sort-arrow">{{ sortDir === 1 ? '▲' : '▼' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in sortedRows"
            :key="row.index"
            :class="{ dimmed: dimmedLabels.includes(row.label), clickable }"
            @click="clickable && emit('item-click', row.index)"
          >
            <td>{{ row.label }}</td>
            <td v-for="(s, si) in series" :key="si" class="num">
              {{ fmt(s.data[row.index]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  title: String,
  labels: Array,
  series: { type: Array, default: () => [] }, // [{ name, data }]
  dimensionLabel: { type: String, default: 'Valeur' },
  valueSuffix: { type: String, default: '' },
  dimmedLabels: { type: Array, default: () => [] },
  clickable: { type: Boolean, default: false },
})
const emit = defineEmits(['item-click'])

const sortCol = ref(null) // null = original order, -1 = label column, n = series index
const sortDir = ref(-1)

function sortBy(col) {
  if (sortCol.value === col) {
    sortDir.value = -sortDir.value
  } else {
    sortCol.value = col
    sortDir.value = col === -1 ? 1 : -1
  }
}

const fmt = (v) => v == null ? '—' : `${v}${props.valueSuffix}`

const sortedRows = computed(() => {
  const rows = (props.labels ?? []).map((label, index) => ({ label, index }))
  if (sortCol.value === null) return rows
  const dir = sortDir.value
  if (sortCol.value === -1) {
    return rows.sort((a, b) => dir * a.label.localeCompare(b.label))
  }
  const data = props.series[sortCol.value]?.data ?? []
  return rows.sort((a, b) => dir * ((data[a.index] ?? -Infinity) - (data[b.index] ?? -Infinity)))
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
.table-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}
th {
  position: sticky;
  top: 0;
  background: var(--card-bg);
  text-align: left;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
th:hover { color: var(--accent); }
.sort-arrow { font-size: 0.6rem; margin-left: 4px; }
td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
}
.num { text-align: right; }
tr.clickable { cursor: pointer; }
tbody tr.clickable:hover { background: rgba(255, 255, 255, 0.04); }
tr.dimmed { opacity: 0.25; }
</style>
