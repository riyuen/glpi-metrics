<template>
  <draggable
    ref="gridRef"
    v-model="activeWidgets"
    :item-key="w => w.id"
    tag="section"
    class="widgets-grid"
    handle=".drag-handle"
    ghost-class="widget-ghost"
  >
    <template #item="{ element: widget }">
      <WidgetShell
        :widget="widget"
        :clickable="payloads[widget.id]?.clickable === true"
        :active="payloads[widget.id]?.active === true"
        @edit="emit('edit-widget', widget)"
        @duplicate="duplicateWidget(widget.id)"
        @remove="confirmRemove(widget)"
        @resize-start="startResize($event, widget)"
        @stat-click="toggleStatClause(payloads[widget.id]?.clause)"
        @view-tickets="openTicketList(widget)"
      >
        <div :ref="el => registerEl(widget.id, el)" class="widget-body">
          <WidgetRenderer
            :widget="widget"
            :payload="payloads[widget.id] ?? { kind: 'empty' }"
            :theme="theme"
            :period="period"
            @select="({ filterKey, value }) => toggleFilter(filterKey, value)"
            @cell-tickets="({ group, week }) => openHeatmapCellTickets(widget, group, week)"
          />
        </div>
      </WidgetShell>
    </template>
  </draggable>

  <TicketListDialog
    v-if="ticketListDialog"
    :tickets="ticketListDialog.tickets"
    :title="ticketListDialog.title"
    @close="ticketListDialog = null"
  />

  <div v-if="ready && activeWidgets.length === 0" class="empty-dashboard">
    <p>Ce tableau de bord est vide.</p>
    <button class="add-btn" @click="emit('add-widget')">+ Ajouter un widget</button>
  </div>

  <div v-else-if="!ready" class="empty-dashboard">
    <p>Chargement du tableau de bord…</p>
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch, onMounted, onUnmounted } from 'vue'
import draggable from 'vuedraggable'
import WidgetShell from './WidgetShell.vue'
import WidgetRenderer from '../widgets/WidgetRenderer.vue'
import TicketListDialog from './TicketListDialog.vue'
import { computeWidgetData, rowsForWidget } from '../../lib/aggregate.js'
import { METRICS, displayTitle } from '../../lib/registry.js'
import { useDashboards } from '../../composables/useDashboards.js'
import { useFilters } from '../../composables/useFilters.js'
import { useMetricsData } from '../../composables/useMetricsData.js'

const props = defineProps({
  theme: { type: String, default: 'dark' },
})
const emit = defineEmits(['edit-widget', 'add-widget'])

const { ready, activeWidgets, duplicateWidget, removeWidget, setSpan } = useDashboards()
const { activeFilters, period, toggleFilter, toggleStatClause } = useFilters()
const { processedTickets, satisfactionRecords, loadSatisfaction } = useMetricsData()

const GRID_COLS  = 12
const GRID_ROW_H = 60   // px per row track
const GRID_GAP   = 20   // px gap between tracks

const theme = computed(() => props.theme)

// ── Aggregation context + per-widget payloads ────────────────────────────────
const ctx = computed(() => ({
  tickets: processedTickets.value,
  satisfaction: satisfactionRecords.value,
  activeFilters,
  period: period.value,
}))

const payloads = computed(() => {
  const out = {}
  for (const w of activeWidgets.value) {
    out[w.id] = computeWidgetData(w, ctx.value)
  }
  return out
})

// Satisfaction data loads lazily, the first time a widget needs it
watch(
  () => activeWidgets.value.some(w => METRICS[w.metric]?.source === 'satisfaction'),
  (needed) => { if (needed) loadSatisfaction() },
  { immediate: true }
)

// ── Widget DOM refs (screenshotted by the PPT export) ────────────────────────
const widgetEls = {}
function registerEl(id, el) {
  if (el) widgetEls[id] = el
  else delete widgetEls[id]
}

function confirmRemove(widget) {
  if (window.confirm('Supprimer ce widget ?')) removeWidget(widget.id)
}

// ── Ticket-list dialog (stat card toolbar "view tickets" action) ─────────────
const ticketListDialog = ref(null) // { title, tickets } | null

function openTicketList(widget) {
  const rows = rowsForWidget(widget, ctx.value)
  const isSatisfaction = METRICS[widget.metric]?.source === 'satisfaction'
  let tickets = rows
  if (isSatisfaction) {
    const byId = new Map(ctx.value.tickets.map(t => [t.id, t]))
    tickets = rows.map(r => byId.get(r.ticketId)).filter(Boolean)
  }
  ticketListDialog.value = { title: displayTitle(widget, period.value), tickets }
}

function openHeatmapCellTickets(widget, group, week) {
  const rows = rowsForWidget(widget, ctx.value)
  const tickets = rows.filter(t => t.week === week && t.groups?.includes(group))
  ticketListDialog.value = { title: `${displayTitle(widget, period.value)} — ${group} (${week})`, tickets }
}

// ── Grid resize (drag the bottom-right handle, snaps to grid tracks) ─────────
const gridRef = ref(null)
const resizeState = reactive({ id: null, startX: 0, startY: 0, startCol: 0, startRow: 0, cellW: 0, minCol: 2, minRow: 2 })

function startResize(e, widget) {
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  const container = gridRef.value?.$el
  const containerW = container?.offsetWidth ?? (GRID_COLS * 80)
  // step size = one column track including its trailing gap
  const colStep = (containerW - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS + GRID_GAP
  resizeState.id = widget.id
  resizeState.startX = clientX
  resizeState.startY = clientY
  resizeState.startCol = widget.span?.col ?? 6
  resizeState.startRow = widget.span?.row ?? 4
  resizeState.cellW = colStep
  resizeState.minCol = widget.kind === 'stat' ? 1 : 2
  resizeState.minRow = widget.kind === 'stat' ? 2 : 3
}

function onResizeMove(e) {
  if (!resizeState.id) return
  if (e.cancelable) e.preventDefault()
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  const newCol = Math.max(resizeState.minCol, Math.min(GRID_COLS, Math.round(resizeState.startCol + (clientX - resizeState.startX) / resizeState.cellW)))
  const newRow = Math.max(resizeState.minRow, Math.min(20, Math.round(resizeState.startRow + (clientY - resizeState.startY) / (GRID_ROW_H + GRID_GAP))))
  setSpan(resizeState.id, { col: newCol, row: newRow })
}

function onResizeEnd() {
  resizeState.id = null
}

onMounted(() => {
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  document.addEventListener('touchmove', onResizeMove, { passive: false })
  document.addEventListener('touchend', onResizeEnd)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
  document.removeEventListener('touchmove', onResizeMove)
  document.removeEventListener('touchend', onResizeEnd)
})

defineExpose({ widgetEls })
</script>

<style scoped>
.widgets-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-auto-rows: 60px;
  gap: 20px;
}

.widget-body {
  height: 100%;
  min-height: 0;
}

.widget-ghost { opacity: 0.3; }

.empty-dashboard {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 60px 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}
.add-btn {
  background: var(--accent);
  color: #0f172a;
  border: none;
  border-radius: 6px;
  padding: 8px 18px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
</style>
