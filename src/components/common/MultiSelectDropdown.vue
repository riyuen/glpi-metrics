<template>
  <div class="filter-wrap" v-click-outside="() => (open = false)">
    <button type="button" class="filter-btn" @click="open = !open">
      <span>{{ triggerLabel }}</span>
      <span v-if="modelValue.length" class="filter-count">{{ modelValue.length }}</span>
      <span class="caret">{{ open ? '▲' : '▼' }}</span>
    </button>

    <div v-if="open" class="dropdown">
      <div class="dropdown-header">
        <button type="button" class="select-all-btn" @click="toggleAll">
          {{ allSelected ? 'Tout désélectionner' : 'Tout sélectionner' }}
        </button>
      </div>
      <label v-for="opt in options" :key="opt.value" class="dropdown-item">
        <input type="checkbox" :value="opt.value" :checked="modelValue.includes(opt.value)" @change="toggle(opt.value)" />
        <span>{{ opt.label }}</span>
      </label>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  options: { type: Array, default: () => [] }, // [{ value, label }]
  modelValue: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Tous' },
})
const emit = defineEmits(['update:modelValue'])

const vClickOutside = {
  mounted(el, binding) {
    el._clickOutside = (e) => { if (!el.contains(e.target)) binding.value(e) }
    document.addEventListener('click', el._clickOutside)
  },
  unmounted(el) {
    document.removeEventListener('click', el._clickOutside)
  },
}

const open = ref(false)

const allSelected = computed(() => props.options.length > 0 && props.modelValue.length === props.options.length)

const triggerLabel = computed(() =>
  props.modelValue.length ? `${props.modelValue.length} sélectionné(s)` : props.placeholder
)

function toggle(value) {
  const set = new Set(props.modelValue)
  if (set.has(value)) set.delete(value); else set.add(value)
  emit('update:modelValue', [...set])
}

function toggleAll() {
  emit('update:modelValue', allSelected.value ? [] : props.options.map((o) => o.value))
}
</script>

<style scoped>
.filter-wrap {
  position: relative;
}

.filter-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 0.82rem;
  padding: 6px 10px;
  cursor: pointer;
}
.filter-btn:hover {
  border-color: var(--accent);
}
.filter-btn > span:first-child {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-count {
  background: var(--accent);
  color: #0f172a;
  border-radius: 10px;
  padding: 1px 6px;
  font-size: 0.7rem;
  font-weight: 600;
}

.caret {
  font-size: 0.65rem;
  color: var(--text-muted);
}

.dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  z-index: 10;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 200px;
  max-height: 220px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.dropdown-header {
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
}

.select-all-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 0.76rem;
  cursor: pointer;
  padding: 0;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 0.82rem;
  color: var(--text);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.dropdown-item:hover {
  background: rgba(255, 255, 255, 0.04);
}
.dropdown-item input[type='checkbox'] {
  accent-color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
}
</style>
