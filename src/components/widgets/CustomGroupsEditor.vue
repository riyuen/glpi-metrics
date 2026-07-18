<template>
  <div class="field">
    <label class="field-label">Groupes personnalisés</label>
    <div v-for="(g, i) in customGroups" :key="i" class="search-row">
      <input v-model="g.label" type="text" class="field-input custom-group-label" placeholder="Nom du groupe" />
      <select v-model="g.field" class="field-select search-field-select">
        <option v-for="(label, key) in searchFieldOptions" :key="key" :value="key">{{ label }}</option>
      </select>
      <input v-model="g.query" type="text" class="field-input" placeholder="Contient…" />
      <button type="button" class="remove-search-btn" title="Retirer" @click="removeCustomGroup(i)">×</button>
    </div>
    <button type="button" class="add-search-btn" @click="addCustomGroup">+ Ajouter un groupe</button>
    <p class="field-hint">Un ticket est classé dans le premier groupe dont le champ contient le texte indiqué ; les autres vont dans « Autre ».</p>
  </div>
</template>

<script setup>
const props = defineProps({
  customGroups: { type: Array, required: true },
  searchFieldOptions: { type: Object, required: true },
})

function addCustomGroup() {
  props.customGroups.push({ label: '', field: 'name', query: '' })
}
function removeCustomGroup(i) {
  props.customGroups.splice(i, 1)
}
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
.field-hint {
  margin-top: 4px;
  font-size: 0.72rem;
  color: var(--text-muted);
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

.search-row { display: flex; gap: 8px; margin-bottom: 6px; }
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
</style>
