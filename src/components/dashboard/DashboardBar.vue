<template>
  <div class="dashboard-bar">
    <div class="bar-left">
      <select class="dash-select" :value="activeDashboard?.id" @change="setActive($event.target.value)">
        <option v-for="d in dashboards" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>

      <button class="bar-btn" title="Nouveau tableau de bord" @click="openPrompt('create')">＋ Nouveau</button>
      <button class="bar-btn" title="Renommer" @click="openPrompt('rename')">Renommer</button>
      <button class="bar-btn" title="Dupliquer" @click="duplicateDashboard(activeDashboard.id)">Dupliquer</button>
      <button class="bar-btn bar-danger" title="Supprimer" @click="confirmDelete">Supprimer</button>
      <button
        class="bar-btn save-btn"
        :class="saveStatus"
        :disabled="saveStatus === 'saving'"
        @click="save"
      >{{ saveLabel }}</button>
    </div>

    <div class="bar-right">
      <div class="period-toggle">
        <button :class="{ active: period === 'week' }" @click="period = 'week'">Hebdomadaire</button>
        <button :class="{ active: period === 'month' }" @click="period = 'month'">Mensuel</button>
      </div>
      <button class="add-widget-btn" @click="emit('add-widget')">+ Ajouter un widget</button>
    </div>

    <!-- Name prompt mini-dialog -->
    <div v-if="promptMode" class="dialog-overlay" @click.self="promptMode = null">
      <div class="dialog name-dialog">
        <h3 class="dialog-title">{{ promptMode === 'create' ? 'Nouveau tableau de bord' : 'Renommer le tableau de bord' }}</h3>
        <input
          ref="nameInput"
          v-model="nameDraft"
          type="text"
          class="name-input"
          placeholder="Nom du tableau de bord"
          @keyup.enter="submitPrompt"
          @keyup.esc="promptMode = null"
        />
        <label v-if="promptMode === 'create'" class="seed-check">
          <input type="checkbox" v-model="seedDefaults" />
          Partir des widgets par défaut
        </label>
        <div class="dialog-footer">
          <button class="outline-btn" @click="promptMode = null">Annuler</button>
          <button class="confirm-btn" :disabled="!nameDraft.trim()" @click="submitPrompt">
            {{ promptMode === 'create' ? 'Créer' : 'Renommer' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useDashboards } from '../../composables/useDashboards.js'
import { useFilters } from '../../composables/useFilters.js'

const emit = defineEmits(['add-widget'])

const { dashboards, activeDashboard, setActive, createDashboard, renameDashboard, duplicateDashboard, deleteDashboard, save, saveStatus } = useDashboards()
const { period } = useFilters()

const saveLabel = computed(() => ({
  idle: 'Enregistrer',
  saving: 'Enregistrement…',
  saved: 'Enregistré ✓',
  error: 'Échec ⚠',
}[saveStatus.value]))

const promptMode = ref(null) // null | 'create' | 'rename'
const nameDraft = ref('')
const seedDefaults = ref(false)
const nameInput = ref(null)

function openPrompt(mode) {
  promptMode.value = mode
  nameDraft.value = mode === 'rename' ? (activeDashboard.value?.name ?? '') : ''
  seedDefaults.value = false
  nextTick(() => nameInput.value?.focus())
}

function submitPrompt() {
  const name = nameDraft.value.trim()
  if (!name) return
  if (promptMode.value === 'create') createDashboard(name, { seedDefaults: seedDefaults.value })
  else renameDashboard(activeDashboard.value.id, name)
  promptMode.value = null
}

function confirmDelete() {
  const dash = activeDashboard.value
  if (!dash) return
  if (window.confirm(`Supprimer le tableau de bord « ${dash.name} » ?`)) {
    deleteDashboard(dash.id)
  }
}
</script>

<style scoped>
.dashboard-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.bar-left, .bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.dash-select {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 0.88rem;
  font-weight: 600;
  padding: 7px 10px;
  cursor: pointer;
  max-width: 260px;
}
.dash-select:focus { outline: none; border-color: var(--accent); }

.bar-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.78rem;
  padding: 6px 10px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.bar-btn:hover { border-color: var(--accent); color: var(--accent); }
.bar-danger:hover { border-color: #ef4444; color: #ef4444; }

.save-btn.saved { border-color: #22c55e; color: #22c55e; }
.save-btn.error { border-color: #ef4444; color: #ef4444; }
.save-btn:disabled { opacity: 0.7; cursor: wait; }

.period-toggle { display: flex; gap: 6px; }
.period-toggle button {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.8rem;
  padding: 5px 14px;
  cursor: pointer;
}
.period-toggle button.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #0f172a;
  font-weight: 600;
}

.add-widget-btn {
  background: var(--accent);
  color: #0f172a;
  border: none;
  border-radius: 6px;
  padding: 7px 14px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

/* Name mini-dialog */
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
.name-dialog { width: 380px; max-width: 92vw; }
.dialog-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 14px;
}
.name-input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 0.9rem;
  padding: 8px 12px;
  outline: none;
}
.name-input:focus { border-color: var(--accent); }
.seed-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 0.84rem;
  color: var(--text-muted);
  cursor: pointer;
}
.seed-check input { accent-color: var(--accent); }
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}
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
</style>
