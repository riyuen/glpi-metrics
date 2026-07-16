<template>
  <div class="ori-card stat-card">
    <div class="ori-statistic">
      <span class="ori-statistic__value stat-value">{{ value }}</span>
      <span class="ori-statistic__label stat-label">{{ label }}</span>
    </div>
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
  padding: 20px 28px;
  text-align: center;
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.stat-value {
  font-size: 2.5rem;
  font-weight: var(--font-weight-bold, 700);
  color: var(--accent);
  line-height: 1;
  display: block;
}
.stat-label {
  margin-top: 6px;
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  display: block;
}
</style>
