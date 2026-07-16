<template>
  <main class="content">
    <div class="dashboard-toolbar">
      <button class="export-btn" :disabled="loading" @click="showExportDialog = true">Exporter PPT</button>
    </div>

    <DashboardBar @add-widget="openEditor(null)" />
    <FilterBar />
    <DashboardGrid
      ref="gridRef"
      :theme="theme"
      @edit-widget="openEditor"
      @add-widget="openEditor(null)"
    />

    <WidgetEditor
      v-if="editorOpen"
      :widget="editingWidget"
      :theme="theme"
      @save="saveWidget"
      @cancel="editorOpen = false"
      @remove="removeEditedWidget"
    />

    <ExportDialog
      v-if="showExportDialog"
      :widget-els="gridRef?.widgetEls ?? {}"
      :theme="theme"
      @close="showExportDialog = false"
    />
  </main>
</template>

<script setup>
import { ref, inject } from 'vue'
import DashboardBar from '../components/dashboard/DashboardBar.vue'
import FilterBar from '../components/dashboard/FilterBar.vue'
import DashboardGrid from '../components/dashboard/DashboardGrid.vue'
import ExportDialog from '../components/dashboard/ExportDialog.vue'
import WidgetEditor from '../components/widgets/WidgetEditor.vue'
import { useDashboards } from '../composables/useDashboards.js'

const theme   = inject('theme')
const loading = inject('loading')

const { addWidget, updateWidget, removeWidget } = useDashboards()

const gridRef           = ref(null)
const showExportDialog  = ref(false)
const editorOpen        = ref(false)
const editingWidget     = ref(null) // null = create

function openEditor(widget) {
  editingWidget.value = widget ?? null
  editorOpen.value = true
}

function saveWidget(widget) {
  if (editingWidget.value) updateWidget(widget)
  else addWidget(widget)
  editorOpen.value = false
}

function removeEditedWidget() {
  if (editingWidget.value && window.confirm('Supprimer ce widget ?')) {
    removeWidget(editingWidget.value.id)
    editorOpen.value = false
  }
}
</script>

<style scoped>
.content {
  flex: 1;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dashboard-toolbar {
  display: flex;
  justify-content: flex-end;
}

.export-btn {
  background: none;
  border: 1px solid var(--accent);
  border-radius: 6px;
  color: var(--accent);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.export-btn:hover:not(:disabled) {
  background: var(--accent);
  color: #0f172a;
}
.export-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
