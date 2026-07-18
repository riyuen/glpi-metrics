<template>
  <div class="dialog-overlay" @click.self="emit('close')">
    <div class="dialog">
      <div class="dialog-header">
        <h3 class="dialog-title">{{ title }}</h3>
        <span class="total-badge">{{ tickets.length }} ticket{{ tickets.length === 1 ? '' : 's' }}</span>
        <button class="close-btn" title="Fermer" @click="emit('close')">✕</button>
      </div>

      <div v-if="tickets.length === 0" class="empty-state">
        Aucun ticket associé à cette carte.
      </div>

      <div v-else class="table-wrap">
        <table class="ticket-table">
          <thead>
            <tr>
              <th class="col-id">#</th>
              <th class="col-name">Titre</th>
              <th class="col-status">Statut</th>
              <th class="col-priority">Priorité</th>
              <th class="col-group">Groupe</th>
              <th class="col-date">Ouverture</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in tickets"
              :key="t.id"
              class="ticket-row"
              title="Ouvrir dans GLPI"
              @click="openTicket(t.id)"
            >
              <td class="col-id text-muted">{{ t.id }}</td>
              <td class="col-name">{{ t.name || '—' }}</td>
              <td class="col-status">
                <span class="badge" :style="{ background: STATUS_COLORS[t.status] ?? '#6b7280' }">
                  {{ STATUS[t.status] ?? `Status ${t.status}` }}
                </span>
              </td>
              <td class="col-priority">
                <span class="badge" :style="{ background: PRIORITY_COLORS[t.priority] ?? '#6b7280' }">
                  {{ PRIORITY[t.priority] ?? `Priorité ${t.priority}` }}
                </span>
              </td>
              <td class="col-group text-muted">{{ t.group ?? '—' }}</td>
              <td class="col-date text-muted">{{ t.date?.substring(0, 10) ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { GLPI_URL, STATUS, PRIORITY } from '../../api/glpi.js'
import { STATUS_COLORS, PRIORITY_COLORS } from '../../lib/registry.js'

defineProps({
  tickets: { type: Array, default: () => [] },
  title: { type: String, default: 'Tickets' },
})
const emit = defineEmits(['close'])

function openTicket(id) {
  window.open(`${GLPI_URL}/front/ticket.form.php?id=${id}`, '_blank', 'noopener')
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
  width: 720px;
  max-width: 92vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}
.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  flex-shrink: 0;
}
.dialog-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.total-badge {
  background: var(--border);
  border-radius: 20px;
  padding: 2px 12px;
  font-size: 0.82rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}
.close-btn:hover { color: var(--text); }

.empty-state {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.table-wrap { overflow: auto; }

.ticket-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.83rem;
}
.ticket-table thead tr { background: rgba(255, 255, 255, 0.02); }
.ticket-table th {
  position: sticky;
  top: 0;
  background: var(--card-bg);
  padding: 9px 14px;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
.ticket-table td {
  padding: 9px 14px;
  border-top: 1px solid var(--border);
  color: var(--text);
  vertical-align: middle;
}
.ticket-row { cursor: pointer; }
.ticket-row:hover { background: rgba(255, 255, 255, 0.05); }
.ticket-row:hover .col-id { color: var(--accent); }

.col-id       { width: 60px; }
.col-name     { min-width: 200px; }
.col-status   { width: 130px; }
.col-priority { width: 120px; }
.col-group    { min-width: 140px; }
.col-date     { width: 110px; white-space: nowrap; }

.text-muted { color: var(--text-muted); }

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}
</style>
