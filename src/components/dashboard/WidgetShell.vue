<template>
  <div
    class="widget-shell"
    :class="{
      'stat-shell': widget.kind === 'stat',
      'card-clickable': clickable,
      'card-active': active,
    }"
    :style="{
      gridColumn: `span ${widget.span?.col ?? 6}`,
      gridRow:    `span ${widget.span?.row ?? 4}`,
    }"
    @click="clickable && emit('stat-click')"
  >
    <button class="drag-handle" title="Glisser pour réordonner">⠿</button>

    <div class="widget-toolbar">
      <button class="tool-btn" title="Modifier" @click.stop="emit('edit')">✎</button>
      <button class="tool-btn" title="Dupliquer" @click.stop="emit('duplicate')">⧉</button>
      <button class="tool-btn tool-danger" title="Supprimer" @click.stop="emit('remove')">✕</button>
    </div>

    <slot />

    <div
      class="resize-handle"
      @mousedown.prevent.stop="emit('resize-start', $event)"
      @touchstart.prevent.stop="emit('resize-start', $event)"
    />
  </div>
</template>

<script setup>
defineProps({
  widget: { type: Object, required: true },
  clickable: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
})
const emit = defineEmits(['edit', 'duplicate', 'remove', 'resize-start', 'stat-click'])
</script>

<style scoped>
.widget-shell {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.card-clickable { cursor: pointer; }
.card-clickable:hover { box-shadow: 0 0 0 1px var(--accent); border-radius: 10px; }
.card-active    { box-shadow: 0 0 0 2px var(--accent); border-radius: 10px; }

.drag-handle {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  background: var(--border);
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  padding: 3px 8px;
  cursor: grab;
  user-select: none;
  opacity: 0;
  transition: opacity 0.15s;
}
.drag-handle:active { cursor: grabbing; }
.widget-shell:hover .drag-handle { opacity: 1; }

.widget-toolbar {
  position: absolute;
  top: 6px;
  right: 8px;
  z-index: 20;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}
.widget-shell:hover .widget-toolbar { opacity: 1; }

.tool-btn {
  background: var(--border);
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1;
  padding: 4px 7px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.tool-btn:hover { color: var(--accent); }
.tool-danger:hover { color: #ef4444; }

.resize-handle {
  position: absolute;
  bottom: 6px;
  right: 6px;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  opacity: 0.4;
  z-index: 20;
  background-image: radial-gradient(circle, var(--text-muted) 1.5px, transparent 1.5px);
  background-size: 5px 5px;
  transition: opacity 0.2s;
}
.resize-handle:hover { opacity: 1; }
</style>
