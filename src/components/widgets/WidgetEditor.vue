<template>
  <div class="dialog-overlay" @click.self="emit('cancel')">
    <div class="dialog editor-dialog">
      <h3 class="dialog-title">{{ isNew ? 'Ajouter un widget' : 'Modifier le widget' }}</h3>

      <div class="editor-body">
        <div class="editor-form">
          <!-- Kind -->
          <div class="field">
            <label class="field-label">Type de widget</label>
            <div class="chip-row">
              <button :class="{ active: draft.kind === 'chart' }" @click="setKind('chart')">Graphique</button>
              <button :class="{ active: draft.kind === 'stat' }" @click="setKind('stat')">Carte statistique</button>
            </div>
          </div>

          <!-- Metric -->
          <div class="field">
            <label class="field-label">Métrique</label>
            <select v-model="draft.metric" class="field-select" @change="onMetricChange">
              <option v-for="(m, key) in METRICS" :key="key" :value="key">{{ m.label }}</option>
            </select>
            <p v-if="isSatisfaction" class="field-hint">
              Basé sur les enquêtes de satisfaction — filtres statut/priorité non applicables.
            </p>
          </div>

          <!-- Dimension -->
          <div v-if="draft.kind === 'chart'" class="field">
            <label class="field-label">Regrouper par</label>
            <select v-model="draft.dimension" class="field-select" @change="onDimensionChange">
              <option v-for="(d, key) in availableDimensions" :key="key" :value="key">{{ d.label }}</option>
              <option value="custom">Personnalisé</option>
            </select>
          </div>

          <!-- Segment -->
          <div v-if="draft.kind === 'chart' && segmentable" class="field">
            <label class="field-label">Segmenter par</label>
            <select v-model="draft.segmentBy" class="field-select">
              <option :value="null">Aucune</option>
              <option v-for="(d, key) in availableSegments" :key="key" :value="key">{{ d.label }}</option>
              <option value="custom">Personnalisé</option>
            </select>
          </div>

          <!-- Custom groups (used when dimension and/or segment is "Personnalisé") -->
          <CustomGroupsEditor
            v-if="showCustomGroups"
            :custom-groups="draft.customGroups"
            :search-field-options="SEARCH_FIELD_OPTIONS"
          />

          <!-- Chart type -->
          <div v-if="draft.kind === 'chart'" class="field">
            <label class="field-label">Type de graphique</label>
            <div class="chip-row wrap">
              <button
                v-for="(label, key) in availableChartTypes"
                :key="key"
                :class="{ active: draft.chartType === key }"
                @click="draft.chartType = key"
              >{{ label }}</button>
            </div>
          </div>

          <!-- Widget filters -->
          <WidgetFilterFields
            :filters="draft.filters"
            :is-satisfaction="isSatisfaction"
            :status-options="statusOptions"
            :priority-options="priorityOptions"
            :type-options="typeOptions"
            :group-options="groupOptions"
            :entity-options="entityOptions"
            :category-options="categoryOptions"
            :location-options="locationOptions"
            :search-field-options="SEARCH_FIELD_OPTIONS"
          />

          <!-- Options -->
          <div class="field">
            <label class="field-label">Titre</label>
            <input
              v-model="titleDraft"
              type="text"
              class="field-input"
              :placeholder="autoTitlePlaceholder"
            />
            <p class="field-hint">Vide = titre automatique. Jetons : {période} → semaine/mois, {hebdo} → hebdo./mensuel.</p>
          </div>

          <div class="options-row">
            <div v-if="draft.kind === 'chart' && !isTimeDimension" class="field small">
              <label class="field-label">Top N</label>
              <input v-model.number="topNDraft" type="number" min="1" class="field-input" placeholder="Tous" />
            </div>
            <div v-if="draft.kind === 'chart' && !isTimeDimension" class="field small">
              <label class="field-label">Trier par</label>
              <select v-model="sortOrderDraft" class="field-select">
                <option value="">Par défaut</option>
                <option value="value-desc">Valeur (décroissant)</option>
                <option value="value-asc">Valeur (croissant)</option>
                <option value="label-asc">Alphabétique (A→Z)</option>
                <option value="label-desc">Alphabétique (Z→A)</option>
              </select>
            </div>
            <div v-if="isDurationMetric" class="field small">
              <label class="field-label">Unité</label>
              <div class="chip-row">
                <button :class="{ active: unitDraft === 'hours' }" @click="unitDraft = 'hours'">Heures</button>
                <button :class="{ active: unitDraft === 'days' }" @click="unitDraft = 'days'">Jours</button>
              </div>
            </div>
            <div v-if="canPercent" class="field small">
              <label class="field-label check-item" style="margin-top: 22px">
                <input type="checkbox" v-model="percentDraft" /> Pourcentage (100 %)
              </label>
            </div>
            <div v-if="draft.kind === 'chart' && !draft.segmentBy" class="field small">
              <label class="field-label">Couleur</label>
              <div class="color-row">
                <input type="color" :value="colorDraft || '#38bdf8'" @input="colorDraft = $event.target.value" />
                <button v-if="colorDraft" class="clear-color" @click="colorDraft = null">Auto</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Live preview -->
        <div class="editor-preview">
          <label class="field-label">Aperçu</label>
          <div class="preview-box" :class="{ 'preview-stat': draft.kind === 'stat' }">
            <WidgetRenderer
              :widget="previewWidget"
              :payload="previewPayload"
              :theme="theme"
              :period="period"
            />
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button v-if="!isNew" class="danger-btn" @click="emit('remove')">Supprimer le widget</button>
        <span class="footer-spacer" />
        <button class="outline-btn" @click="emit('cancel')">Annuler</button>
        <button class="confirm-btn" :disabled="!isValid" @click="save">Enregistrer</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch } from 'vue'
import WidgetRenderer from './WidgetRenderer.vue'
import WidgetFilterFields from './WidgetFilterFields.vue'
import CustomGroupsEditor from './CustomGroupsEditor.vue'
import { computeWidgetData } from '../../lib/aggregate.js'
import { METRICS, DIMENSIONS, CHART_TYPES, autoTitle, emptyWidget, newWidgetId } from '../../lib/registry.js'
import { STATUS, PRIORITY, TYPE } from '../../api/glpi.js'
import { useFilters } from '../../composables/useFilters.js'
import { useMetricsData } from '../../composables/useMetricsData.js'

const props = defineProps({
  // null → create a new widget
  widget: { type: Object, default: null },
  theme: { type: String, default: 'dark' },
})
const emit = defineEmits(['save', 'cancel', 'remove'])

const { period } = useFilters()
const { processedTickets, satisfactionRecords, loadSatisfaction } = useMetricsData()

const isNew = computed(() => props.widget == null)

const clone = (o) => JSON.parse(JSON.stringify(o))
const draft = reactive(props.widget ? clone(props.widget) : emptyWidget('chart'))
draft.filters = draft.filters ?? {}
draft.options = draft.options ?? {}
draft.customGroups = draft.customGroups ?? []

// Shared with WidgetFilterFields (search clauses) and CustomGroupsEditor (custom-group rules)
const SEARCH_FIELD_OPTIONS = { name: 'Titre', category: 'Catégorie', requester: 'Demandeur', techName: 'Technicien' }

const titleDraft = computed({
  get: () => draft.title ?? '',
  set: (v) => { draft.title = v.trim() ? v : null },
})
const topNDraft = computed({
  get: () => draft.options.topN ?? '',
  set: (v) => { if (v > 0) draft.options.topN = v; else delete draft.options.topN },
})
const sortOrderDraft = computed({
  get: () => draft.options.sortOrder ?? '',
  set: (v) => { if (v) draft.options.sortOrder = v; else delete draft.options.sortOrder },
})
const unitDraft = computed({
  get: () => draft.options.unit ?? 'days',
  set: (v) => { draft.options.unit = v },
})
const percentDraft = computed({
  get: () => draft.options.percent === true,
  set: (v) => { if (v) draft.options.percent = true; else delete draft.options.percent },
})
const colorDraft = computed({
  get: () => draft.options.color ?? null,
  set: (v) => { if (v) draft.options.color = v; else delete draft.options.color },
})

const isSatisfaction  = computed(() => METRICS[draft.metric]?.source === 'satisfaction')
const isDurationMetric = computed(() => METRICS[draft.metric]?.isDuration === true)
const isTimeDimension = computed(() => {
  const d = DIMENSIONS[draft.dimension]
  return d?.isTime === true
})

// Dimensions compatible with the metric's source
const availableDimensions = computed(() => {
  const out = {}
  for (const [key, d] of Object.entries(DIMENSIONS)) {
    if (isSatisfaction.value) {
      const supportsSat = d.satAccessor
        || (d.resolvesTo && DIMENSIONS[d.resolvesTo('week')]?.satAccessor && DIMENSIONS[d.resolvesTo('month')]?.satAccessor)
      if (!supportsSat) continue
    }
    out[key] = d
  }
  return out
})

const availableSegments = computed(() => {
  const out = {}
  for (const [key, d] of Object.entries(availableDimensions.value)) {
    if (key === draft.dimension) continue
    if (d.isTime) continue // time is an axis, not a segment
    out[key] = d
  }
  return out
})

const segmentable = computed(() => !['pie', 'donut'].includes(draft.chartType))

const availableChartTypes = computed(() => {
  const out = {}
  for (const [key, label] of Object.entries(CHART_TYPES)) {
    if (['pie', 'donut'].includes(key) && draft.segmentBy) continue
    if (key === 'techTree' && !(draft.metric === 'mttr' && !isSatisfaction.value)) continue
    if (key === 'heatmap' && !(draft.dimension === 'group' && !isSatisfaction.value)) continue
    out[key] = label
  }
  return out
})

const canPercent = computed(() =>
  draft.kind === 'chart' && draft.segmentBy && ['stackedBar', 'hbar'].includes(draft.chartType)
)

// Distinct filter values from the loaded tickets
const distincts = computed(() => {
  const groups = new Set(), entities = new Set(), categories = new Set(), locations = new Set()
  for (const t of processedTickets.value) {
    for (const g of t.groups ?? []) groups.add(g)
    entities.add(t.entity)
    categories.add(t.category)
    locations.add(t.location)
  }
  const sortFr = (a, b) => a.localeCompare(b, 'fr')
  return {
    groups: [...groups].sort(sortFr),
    entities: [...entities].sort(sortFr),
    categories: [...categories].sort(sortFr),
    locations: [...locations].sort(sortFr),
  }
})

const statusOptions   = computed(() => Object.entries(STATUS).map(([code, label]) => ({ value: Number(code), label })))
const priorityOptions = computed(() => Object.entries(PRIORITY).map(([code, label]) => ({ value: Number(code), label })))
const typeOptions     = computed(() => Object.entries(TYPE).map(([code, label]) => ({ value: Number(code), label })))
const groupOptions    = computed(() => distincts.value.groups.map((g) => ({ value: g, label: g })))
const entityOptions   = computed(() => distincts.value.entities.map((e) => ({ value: e, label: e })))
const categoryOptions = computed(() => distincts.value.categories.map((c) => ({ value: c, label: c })))
const locationOptions = computed(() => distincts.value.locations.map((l) => ({ value: l, label: l })))

const showCustomGroups = computed(() => draft.dimension === 'custom' || draft.segmentBy === 'custom')

// Seed a first empty rule the first time the custom-groups section appears
watch(showCustomGroups, (shown) => {
  if (shown && draft.customGroups.length === 0) draft.customGroups.push({ label: '', field: 'name', query: '' })
})

function setKind(kind) {
  draft.kind = kind
  if (kind === 'stat') {
    draft.dimension = null
    draft.segmentBy = null
  } else if (!draft.dimension) {
    draft.dimension = 'status'
  }
}

function onMetricChange() {
  // Reset choices that don't exist for the new metric's source
  if (draft.kind === 'chart' && draft.dimension && draft.dimension !== 'custom' && !availableDimensions.value[draft.dimension]) {
    draft.dimension = isSatisfaction.value ? 'group' : 'status'
  }
  if (draft.segmentBy && draft.segmentBy !== 'custom' && !availableSegments.value[draft.segmentBy]) draft.segmentBy = null
  if (!availableChartTypes.value[draft.chartType]) draft.chartType = 'bar'
  if (isSatisfaction.value) {
    // Drop ticket-only filters
    for (const k of ['status', 'priority', 'type', 'entity', 'category', 'location']) delete draft.filters[k]
    delete draft.filters.compliance
    delete draft.filters.hasNoTTO
    delete draft.filters.searches
    loadSatisfaction()
  }
}

function onDimensionChange() {
  if (draft.segmentBy === draft.dimension) draft.segmentBy = null
  if (!availableChartTypes.value[draft.chartType]) draft.chartType = 'bar'
}

// Keep chartType valid when segment toggles pie/donut away
watch(() => draft.segmentBy, () => {
  if (!availableChartTypes.value[draft.chartType]) draft.chartType = 'stackedBar'
})

const isValid = computed(() =>
  METRICS[draft.metric] != null &&
  (draft.kind === 'stat' || draft.dimension === 'custom' || DIMENSIONS[draft.dimension] != null)
)

const autoTitlePlaceholder = computed(() => autoTitle(draft, period.value))

// ── Live preview (debounced against the real data) ───────────────────────────
const previewWidget = computed(() => ({ ...clone(draft), id: 'preview' }))

const emptyFilters = { statuses: [], priorities: [], groups: [], entities: [], compliance: null, periods: [] }
const previewPayload = ref({ kind: 'empty' })
let previewTimer = null
watch([() => clone(draft), processedTickets, satisfactionRecords], () => {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    try {
      previewPayload.value = computeWidgetData(previewWidget.value, {
        tickets: processedTickets.value,
        satisfaction: satisfactionRecords.value,
        activeFilters: emptyFilters,
        period: period.value,
      })
    } catch {
      previewPayload.value = { kind: 'empty' }
    }
  }, 150)
}, { immediate: true })

function save() {
  if (!isValid.value) return
  const widget = clone(draft)
  if (!widget.id || widget.id === 'preview') widget.id = newWidgetId()
  if (widget.kind === 'stat') {
    widget.dimension = null
    widget.segmentBy = null
    widget.span = props.widget?.span ?? { col: 2, row: 2 }
  }
  emit('save', widget)
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.dialog {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}
.editor-dialog {
  width: 980px;
  max-width: 96vw;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
}
.dialog-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 14px;
  flex-shrink: 0;
}

.editor-body {
  display: flex;
  gap: 24px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.editor-form {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding-right: 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.editor-preview {
  width: 380px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.preview-box {
  height: 280px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 6px;
  overflow: hidden;
}
.preview-box > * { height: 100%; }
.preview-stat {
  height: 150px;
}

.field { margin-bottom: 14px; }
.field.small { margin-bottom: 0; flex: 1; min-width: 120px; }
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

.chip-row { display: flex; gap: 6px; }
.chip-row.wrap { flex-wrap: wrap; }
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

.check-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: var(--text);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.check-item input { accent-color: var(--accent); }

.options-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-start;
}

.color-row { display: flex; align-items: center; gap: 8px; }
.color-row input[type='color'] {
  width: 42px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  padding: 2px;
  cursor: pointer;
}
.clear-color {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.75rem;
  padding: 4px 8px;
  cursor: pointer;
}

.dialog-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.footer-spacer { flex: 1; }
.outline-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 8px 14px;
  cursor: pointer;
}
.confirm-btn {
  background: var(--accent);
  color: #0f172a;
  border: none;
  border-radius: 6px;
  padding: 8px 18px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.confirm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.danger-btn {
  background: none;
  border: 1px solid #ef4444;
  border-radius: 6px;
  color: #ef4444;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 8px 14px;
  cursor: pointer;
}
</style>
