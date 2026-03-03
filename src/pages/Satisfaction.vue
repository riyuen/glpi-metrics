<template>
  <div class="satisfaction-page">
    <!-- Header -->
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">Satisfaction</h2>
        <span v-if="!loading && !error" class="total-badge">
          {{ selectedScores.length ? `${filteredRecords.length} of ${records.length}` : records.length }}
          response{{ records.length === 1 ? '' : 's' }}
        </span>
      </div>
      <button class="reload-btn" @click="$emit('refresh')" :disabled="loading">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <!-- States -->
    <div v-if="loading" class="empty-state">Loading satisfaction data…</div>
    <div v-else-if="error" class="error-state">{{ error }}</div>
    <div v-else-if="records.length === 0" class="empty-state">No satisfaction survey responses found.</div>

    <template v-else>
      <!-- Summary cards -->
      <div class="summary-row">
        <div class="stat-card">
          <div class="stat-value" :style="{ color: scoreColor(avgScore) }">
            {{ avgScore.toFixed(1) }}<span class="stat-denom">/5</span>
          </div>
          <div class="stat-stars" :style="{ color: scoreColor(avgScore) }">{{ starsFor(avgScore) }}</div>
          <div class="stat-label">Average score</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ filteredRecords.length }}</div>
          <div class="stat-label">Survey responses</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ commentsCount }}</div>
          <div class="stat-label">With comments</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ groupStats.length }}</div>
          <div class="stat-label">Groups</div>
        </div>
      </div>

      <!-- Score filter -->
      <div class="score-filter">
        <span class="filter-label">Score</span>
        <button
          class="score-btn"
          :class="{ active: selectedScores.length === 0 }"
          @click="selectedScores = []"
        >All</button>
        <button
          v-for="n in [1, 2, 3, 4, 5]"
          :key="n"
          class="score-btn"
          :class="{ active: selectedScores.includes(n) }"
          :style="selectedScores.includes(n) ? { borderColor: scoreColor(n), color: scoreColor(n), background: scoreColor(n) + '22' } : {}"
          @click="toggleScore(n)"
        >{{ n }}★</button>
      </div>

      <!-- By Group -->
      <section class="section-card">
        <h3 class="section-title">By Group</h3>
        <table class="sat-table">
          <thead>
            <tr>
              <th class="th-name">Group / Technician</th>
              <th class="th-bar"></th>
              <th class="th-score">Score</th>
              <th class="th-count">Responses</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="g in groupStats" :key="g.name">
              <tr class="group-row" @click="toggleGroup(g.name)">
                <td class="td-name">
                  <span class="expand-icon">{{ expandedGroups.has(g.name) ? '▾' : '▸' }}</span>
                  {{ g.name }}
                </td>
                <td class="td-bar">
                  <div class="bar-track">
                    <div class="bar-fill" :style="{ width: (g.avg / 5 * 100) + '%', background: scoreColor(g.avg) }"></div>
                  </div>
                </td>
                <td class="td-score" :style="{ color: scoreColor(g.avg) }">
                  {{ starsFor(g.avg) }} {{ g.avg.toFixed(1) }}
                </td>
                <td class="td-count">{{ g.count }}</td>
              </tr>
              <template v-if="expandedGroups.has(g.name)">
                <tr v-for="t in g.technicians" :key="t.name" class="tech-row">
                  <td class="td-name td-tech">
                    <span class="tech-indent">└</span>{{ t.name }}
                  </td>
                  <td class="td-bar">
                    <div class="bar-track">
                      <div class="bar-fill" :style="{ width: (t.avg / 5 * 100) + '%', background: scoreColor(t.avg) }"></div>
                    </div>
                  </td>
                  <td class="td-score" :style="{ color: scoreColor(t.avg) }">
                    {{ starsFor(t.avg) }} {{ t.avg.toFixed(1) }}
                  </td>
                  <td class="td-count">{{ t.count }}</td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </section>

      <!-- Comments -->
      <section class="section-card">
        <div class="section-head">
          <h3 class="section-title">Comments</h3>
          <select class="group-select" v-model="commentGroupFilter">
            <option value="">All groups</option>
            <option v-for="g in groupStats" :key="g.name" :value="g.name">{{ g.name }}</option>
          </select>
        </div>

        <div v-if="filteredComments.length === 0" class="empty-state small">
          No comments for this selection.
        </div>
        <div v-else class="comments-list">
          <div v-for="c in filteredComments" :key="c.ticketId" class="comment-card">
            <div class="comment-meta">
              <span class="comment-stars" :style="{ color: scoreColor(c.score) }">{{ starsFor(c.score) }}</span>
              <span class="score-chip" :style="{ color: scoreColor(c.score), borderColor: scoreColor(c.score) }">{{ c.score }}/5</span>
              <span class="meta-sep">·</span>
              <span class="meta-group">{{ c.group }}</span>
              <span class="meta-sep">·</span>
              <span class="meta-tech">{{ c.requester }}</span>
              <span class="meta-sep">·</span>
              <span class="meta-date">{{ c.date?.substring(0, 10) }}</span>
              <a
                class="ticket-link"
                :href="`${GLPI_URL}/front/ticket.form.php?id=${c.ticketId}`"
                target="_blank"
                rel="noopener"
                @click.stop
              >#{{ c.ticketId }}</a>
            </div>
            <p class="comment-text">{{ c.comment }}</p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { GLPI_URL } from '../api/glpi.js'

defineEmits(['refresh'])

const props = defineProps({
  records: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error:   { type: String, default: null },
})

const expandedGroups     = ref(new Set())
const commentGroupFilter = ref('')
const selectedScores     = ref([])

function toggleScore(n) {
  const idx = selectedScores.value.indexOf(n)
  if (idx >= 0) selectedScores.value.splice(idx, 1)
  else selectedScores.value.push(n)
}

const filteredRecords = computed(() =>
  selectedScores.value.length
    ? props.records.filter(r => selectedScores.value.includes(r.score))
    : props.records
)

function toggleGroup(name) {
  const next = new Set(expandedGroups.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  expandedGroups.value = next
}

function starsFor(score) {
  const n = Math.min(5, Math.max(0, Math.round(score)))
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}

function scoreColor(score) {
  if (score >= 4) return '#10b981'
  if (score >= 3) return '#f59e0b'
  return '#ef4444'
}

const avgScore = computed(() =>
  filteredRecords.value.length
    ? filteredRecords.value.reduce((s, r) => s + r.score, 0) / filteredRecords.value.length
    : 0
)

const commentsCount = computed(() => filteredRecords.value.filter(r => r.comment).length)

const groupStats = computed(() => {
  const groups = {}
  for (const r of filteredRecords.value) {
    if (!groups[r.group]) groups[r.group] = { total: 0, count: 0, techs: {} }
    groups[r.group].total += r.score
    groups[r.group].count++
    const t = r.technician
    if (!groups[r.group].techs[t]) groups[r.group].techs[t] = { total: 0, count: 0 }
    groups[r.group].techs[t].total += r.score
    groups[r.group].techs[t].count++
  }
  return Object.entries(groups)
    .map(([name, g]) => ({
      name,
      avg:  g.total / g.count,
      count: g.count,
      technicians: Object.entries(g.techs)
        .map(([tName, t]) => ({ name: tName, avg: t.total / t.count, count: t.count }))
        .sort((a, b) => b.count - a.count || b.avg - a.avg),
    }))
    .sort((a, b) => b.count - a.count)
})

const filteredComments = computed(() => {
  let list = filteredRecords.value.filter(r => r.comment)
  if (commentGroupFilter.value) list = list.filter(r => r.group === commentGroupFilter.value)
  return list
})
</script>

<style scoped>
.satisfaction-page {
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.page-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text);
}

.total-badge {
  background: var(--border);
  border-radius: 20px;
  padding: 2px 12px;
  font-size: 0.82rem;
  color: var(--text-muted);
}

.reload-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.82rem;
  font-weight: 600;
  padding: 6px 14px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.reload-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.reload-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Summary */
.summary-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.stat-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px 24px;
  flex: 1;
  min-width: 130px;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
}

.stat-denom {
  font-size: 1rem;
  font-weight: 400;
  color: var(--text-muted);
}

.stat-stars {
  font-size: 1rem;
  margin: 5px 0 6px;
  letter-spacing: 0.05em;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  margin-top: 4px;
}

/* Score filter */
.score-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-right: 4px;
}

.score-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.82rem;
  font-weight: 600;
  padding: 5px 12px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.score-btn:hover { border-color: var(--accent); color: var(--accent); }
.score-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(56,189,248,0.1); }

/* Section */
.section-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.section-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  margin: 0;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  padding-right: 20px;
}
.section-head .section-title { border-bottom: none; }

/* Groups table */
.sat-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}

.sat-table th {
  padding: 9px 16px;
  text-align: left;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(255,255,255,0.02);
  white-space: nowrap;
}

.sat-table td {
  padding: 11px 16px;
  border-top: 1px solid var(--border);
  vertical-align: middle;
  color: var(--text);
}

.th-name, .td-name { min-width: 200px; }
.th-bar,  .td-bar  { width: 40%; }
.th-score,.td-score { width: 140px; white-space: nowrap; font-variant-numeric: tabular-nums; letter-spacing: 0.04em; }
.th-count,.td-count { width: 90px; text-align: right; color: var(--text-muted); }

.group-row { cursor: pointer; font-weight: 600; }
.group-row:hover { background: rgba(255,255,255,0.03); }

.tech-row { color: var(--text-muted); font-weight: 400; }
.tech-row:hover { background: rgba(255,255,255,0.02); }
.td-tech { padding-left: 36px !important; }

.expand-icon {
  display: inline-block;
  width: 14px;
  margin-right: 6px;
  color: var(--text-muted);
  font-size: 0.75rem;
}

.tech-indent {
  display: inline-block;
  width: 14px;
  margin-right: 6px;
  color: var(--border);
}

.bar-track {
  background: var(--border);
  border-radius: 4px;
  height: 6px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}

/* Group select */
.group-select {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 0.82rem;
  padding: 5px 10px;
  cursor: pointer;
  margin-right: 0;
}
.group-select:focus { outline: none; border-color: var(--accent); }

/* Comments */
.comments-list {
  display: flex;
  flex-direction: column;
}

.comment-card {
  padding: 14px 20px;
  border-top: 1px solid var(--border);
}
.comment-card:first-child { border-top: none; }

.comment-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 0.82rem;
}

.comment-stars { font-size: 0.9rem; letter-spacing: 0.04em; }

.score-chip {
  border: 1px solid;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 0.73rem;
  font-weight: 700;
}

.meta-sep   { color: var(--border); }
.meta-group { color: var(--text); font-weight: 600; }
.meta-tech, .meta-date { color: var(--text-muted); }

.ticket-link {
  margin-left: auto;
  color: var(--accent);
  text-decoration: none;
  font-size: 0.78rem;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.ticket-link:hover { opacity: 1; }

.comment-text {
  color: var(--text);
  font-size: 0.88rem;
  line-height: 1.55;
  margin: 0;
  white-space: pre-wrap;
}

/* States */
.empty-state {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
  font-size: 0.9rem;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.empty-state.small { padding: 24px; border: none; }

.error-state {
  padding: 16px 20px;
  background: #7f1d1d;
  border: 1px solid #b91c1c;
  border-radius: 8px;
  color: #fca5a5;
  font-size: 0.9rem;
}
</style>
