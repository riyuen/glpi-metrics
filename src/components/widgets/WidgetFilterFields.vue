<template>
  <details class="filters-details">
    <summary>Filtres du widget (facultatif) <span v-if="activeFilterCount" class="filter-badge">{{ activeFilterCount }}</span></summary>

    <template v-if="!isSatisfaction">
      <div class="field">
        <label class="field-label">Statut</label>
        <MultiSelectDropdown v-model="filterStatus" :options="statusOptions" />
      </div>
      <div class="field">
        <label class="field-label">Priorité</label>
        <MultiSelectDropdown v-model="filterPriority" :options="priorityOptions" />
      </div>
      <div class="field">
        <label class="field-label">Type</label>
        <MultiSelectDropdown v-model="filterType" :options="typeOptions" />
      </div>
    </template>

    <div class="field">
      <label class="field-label">Groupe</label>
      <MultiSelectDropdown v-model="filterGroup" :options="groupOptions" />
    </div>

    <template v-if="!isSatisfaction">
      <div class="field">
        <label class="field-label">Entité</label>
        <MultiSelectDropdown v-model="filterEntity" :options="entityOptions" />
      </div>
      <div class="field">
        <label class="field-label">Catégorie</label>
        <MultiSelectDropdown v-model="filterCategory" :options="categoryOptions" />
      </div>
      <div class="field">
        <label class="field-label">Conformité SLA</label>
        <div class="chip-row">
          <button :class="{ active: !filters.compliance }" @click="filters.compliance = null">Tous</button>
          <button :class="{ active: filters.compliance === 'compliant' }" @click="filters.compliance = 'compliant'">Conformes</button>
          <button :class="{ active: filters.compliance === 'nonCompliant' }" @click="filters.compliance = 'nonCompliant'">Non conformes</button>
        </div>
      </div>
      <div class="field">
        <label class="field-label">Recherche</label>
        <div v-for="(clause, i) in (filters.searches || [])" :key="i" class="search-row">
          <select v-if="i > 0" v-model="clause.link" class="field-select search-link-select">
            <option value="AND">ET</option>
            <option value="OR">OU</option>
            <option value="ANDNOT">ET NON</option>
            <option value="ORNOT">OU NON</option>
          </select>
          <span v-else class="search-link-spacer" />
          <select v-model="clause.field" class="field-select search-field-select">
            <option v-for="(label, key) in searchFieldOptions" :key="key" :value="key">{{ label }}</option>
          </select>
          <input v-model="clause.query" type="text" class="field-input" placeholder="Rechercher…" />
          <button type="button" class="remove-search-btn" title="Retirer" @click="removeSearchClause(i)">×</button>
        </div>
        <button type="button" class="add-search-btn" @click="addSearchClause">+ Ajouter une recherche</button>
      </div>
    </template>

    <div class="field">
      <label class="field-label">Période</label>
      <div class="date-row">
        <label class="date-field">
          <span>Du</span>
          <input v-model="dateFromDraft" type="date" class="field-input" :max="dateToDraft || undefined" />
        </label>
        <label class="date-field">
          <span>Au</span>
          <input v-model="dateToDraft" type="date" class="field-input" :min="dateFromDraft || undefined" />
        </label>
      </div>
    </div>
  </details>
</template>

<script setup>
import { computed } from 'vue'
import MultiSelectDropdown from '../common/MultiSelectDropdown.vue'

const props = defineProps({
  filters: { type: Object, required: true },
  isSatisfaction: { type: Boolean, default: false },
  statusOptions: { type: Array, default: () => [] },
  priorityOptions: { type: Array, default: () => [] },
  typeOptions: { type: Array, default: () => [] },
  groupOptions: { type: Array, default: () => [] },
  entityOptions: { type: Array, default: () => [] },
  categoryOptions: { type: Array, default: () => [] },
  searchFieldOptions: { type: Object, required: true },
})

const filters = props.filters

// v-model proxies for filters (kept null-free in the saved widget)
const mkArrayFilter = (key) => computed({
  get: () => filters[key] ?? [],
  set: (v) => { if (v.length) filters[key] = v; else delete filters[key] },
})
const filterStatus   = mkArrayFilter('status')
const filterPriority = mkArrayFilter('priority')
const filterType     = mkArrayFilter('type')
const filterGroup    = mkArrayFilter('group')
const filterEntity   = mkArrayFilter('entity')
const filterCategory = mkArrayFilter('category')

const dateFromDraft = computed({
  get: () => filters.dateFrom ?? '',
  set: (v) => { if (v) filters.dateFrom = v; else delete filters.dateFrom },
})
const dateToDraft = computed({
  get: () => filters.dateTo ?? '',
  set: (v) => { if (v) filters.dateTo = v; else delete filters.dateTo },
})

function addSearchClause() {
  if (!filters.searches) filters.searches = []
  filters.searches.push({ field: 'name', query: '', link: 'AND' })
}
function removeSearchClause(i) {
  filters.searches.splice(i, 1)
  if (filters.searches.length === 0) delete filters.searches
}

const activeFilterCount = computed(() => {
  const f = filters
  let n = 0
  for (const k of ['status', 'priority', 'type', 'group', 'entity', 'category']) {
    if (f[k]?.length) n++
  }
  if (f.compliance) n++
  if (f.dateFrom || f.dateTo) n++
  if (f.searches?.length) n += f.searches.filter(c => c.query?.trim()).length
  return n
})
</script>

<style scoped>
.field { margin-bottom: 14px; }
.field-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.field-select,
.field-input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 0.85rem;
  padding: 7px 10px;
  outline: none;
}
.field-select:focus, .field-input:focus { border-color: var(--accent); }

.chip-row { display: flex; gap: 6px; }
.chip-row button {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.8rem;
  padding: 5px 12px;
  cursor: pointer;
}
.chip-row button.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #0f172a;
  font-weight: 600;
}

.filters-details {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 14px;
}
.filters-details summary {
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  user-select: none;
}
.filters-details[open] summary { margin-bottom: 12px; }
.filter-badge {
  display: inline-block;
  background: var(--accent);
  color: #0f172a;
  border-radius: 10px;
  font-size: 0.7rem;
  padding: 1px 7px;
  margin-left: 6px;
}

.search-row { display: flex; gap: 8px; margin-bottom: 6px; }
.search-link-select { flex: 0 0 90px; }
.search-link-spacer { flex: 0 0 90px; }
.search-field-select { flex: 0 0 140px; }
.search-row .field-input { flex: 1; }
.remove-search-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  padding: 0 10px;
  cursor: pointer;
  flex-shrink: 0;
}
.remove-search-btn:hover { border-color: #ef4444; color: #ef4444; }
.add-search-btn {
  background: none;
  border: 1px dashed var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.78rem;
  padding: 5px 10px;
  cursor: pointer;
}
.add-search-btn:hover { border-color: var(--accent); color: var(--accent); }

.date-row { display: flex; gap: 8px; }
.date-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  font-size: 0.72rem;
  color: var(--text-muted);
}
</style>
