<template>
  <div class="search-filter">
    <select class="search-select" v-model="activeFilters.searchField">
      <option v-for="(label, key) in SEARCH_FIELD_LABELS" :key="key" :value="key">{{ label }}</option>
    </select>
    <div class="search-input-wrap">
      <input
        v-model="draft"
        type="text"
        class="search-input"
        placeholder="Rechercher…"
      />
      <button v-if="draft" class="clear-btn" title="Effacer" @click="clear">×</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useFilters } from '../../composables/useFilters.js'

const { activeFilters, SEARCH_FIELD_LABELS } = useFilters()

const draft = ref(activeFilters.searchQuery)

// Keep local draft in sync if cleared externally (filter chip × or "Tout effacer")
watch(() => activeFilters.searchQuery, (q) => {
  if (q !== draft.value) draft.value = q
})

// Debounce: commit to the shared filter state after the user stops typing,
// so widgets don't recompute on every keystroke.
let timer = null
watch(draft, (q) => {
  clearTimeout(timer)
  timer = setTimeout(() => { activeFilters.searchQuery = q }, 280)
})

function clear() {
  clearTimeout(timer)
  draft.value = ''
  activeFilters.searchQuery = ''
}
</script>

<style scoped>
.search-filter {
  display: flex;
  align-items: center;
  gap: 6px;
}

.search-select {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.8rem;
  padding: 5px 8px;
  cursor: pointer;
}
.search-select:focus { outline: none; border-color: var(--accent); }

.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-input {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 0.8rem;
  padding: 5px 26px 5px 10px;
  width: 180px;
  outline: none;
  color-scheme: light dark;
}
.search-input:focus { border-color: var(--accent); }

.clear-btn {
  position: absolute;
  right: 4px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  padding: 2px;
  cursor: pointer;
}
.clear-btn:hover { color: var(--text); }
</style>
