<template>
  <div v-if="hasActiveFilters" class="filter-bar">
    <span class="filter-label">Filtres :</span>
    <span v-for="part in filterSummaryParts" :key="part.key" class="filter-chip">
      {{ part.text }}
      <button @click.stop="clearFilter(part.key)">×</button>
    </span>
    <button class="clear-all-btn" @click="clearFilters">Tout effacer</button>
  </div>
</template>

<script setup>
import { useFilters } from '../../composables/useFilters.js'

const { hasActiveFilters, filterSummaryParts, clearFilter, clearFilters } = useFilters()
</script>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
  background: var(--card-bg);
  border: 1px solid var(--accent);
  border-radius: 8px;
  font-size: 0.82rem;
}
.filter-label { color: var(--text-muted); font-weight: 600; }
.filter-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border: 1px solid var(--accent);
  border-radius: 4px;
  padding: 2px 8px;
  color: var(--accent);
}
.filter-chip button {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font-size: 14px;
  line-height: 1;
}
.clear-all-btn {
  background: none;
  border: 1px solid var(--text-muted);
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.78rem;
  padding: 2px 10px;
  transition: all 0.15s;
}
.clear-all-btn:hover { border-color: var(--text); color: var(--text); }
</style>
