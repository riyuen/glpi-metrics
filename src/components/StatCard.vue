<template>
  <div class="stat-card">
    <div class="stat-value">{{ value }}</div>
    <div class="stat-label">{{ label }}</div>
  </div>
</template>

<script setup>
defineProps({
  label: String,
  value: [Number, String],
})
</script>

<style scoped>
.stat-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 24px 16px;
  text-align: center;
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.stat-value {
  font-size: 3rem;
  font-weight: 700;
  color: var(--accent);
  line-height: 1;
}
.stat-label {
  margin-top: 8px;
  font-size: 0.85rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
