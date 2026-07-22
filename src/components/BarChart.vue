<template>
  <div class="bar-chart-card">
    <h3 class="chart-title">{{ title }}</h3>
    <div class="bars">
      <div
        v-for="item in items"
        :key="item.label"
        class="bar-row"
        :class="{ dimmed: item.dimmed }"
        @click="emit('item-click', item.code ?? item.label)"
      >
        <span class="bar-label">{{ item.label }}</span>
        <div class="bar-track">
          <div
            class="bar-fill"
            :style="{ width: pct(item.count) + '%', background: item.color }"
          />
        </div>
        <span class="bar-count">{{ item.count }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: String,
  items: Array, // [{ label, count, color, code?, dimmed? }]
})
const emit = defineEmits(['item-click'])

const max = computed(() => Math.max(...props.items.map((i) => i.count), 1))

function pct(count) {
  return Math.round((count / max.value) * 100)
}
</script>

<style scoped>
.bar-chart-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 24px;
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.chart-title {
  margin: 0 0 20px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}
.bars {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: opacity 0.2s;
}
.bar-row:hover:not(.dimmed) {
  opacity: 0.75;
}
.bar-row.dimmed {
  opacity: 0.2;
}
.bar-label {
  width: 90px;
  font-size: 0.82rem;
  color: var(--text);
  white-space: normal;
  overflow-wrap: break-word;
  line-height: 1.25;
  flex-shrink: 0;
}
.bar-track {
  flex: 1;
  height: 10px;
  background: var(--border);
  border-radius: 5px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.5s ease;
}
.bar-count {
  width: 28px;
  text-align: right;
  font-size: 0.82rem;
  color: var(--text-muted);
}
</style>
