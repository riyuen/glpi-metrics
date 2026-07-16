<template>
  <div class="dialog-overlay" @click.self="emit('close')">
    <div class="dialog">
      <h3 class="dialog-title">Exporter en PowerPoint</h3>

      <!-- Stat cards (grouped on a single slide) -->
      <template v-if="statWidgets.length">
        <div class="export-section-label">Cartes de statistiques</div>
        <div class="export-row">
          <input type="checkbox" v-model="includeStats" class="export-checkbox" />
          <input type="text" v-model="statTitle" class="export-title-input" :disabled="!includeStats" placeholder="Titre de la diapositive" />
        </div>
      </template>

      <!-- Charts -->
      <div class="export-section-label" style="margin-top:14px">
        Graphiques
        <button class="select-toggle-btn" @click="toggleAll">
          {{ selectedIds.length === chartWidgets.length ? 'Tout désélectionner' : 'Tout sélectionner' }}
        </button>
      </div>
      <ul class="export-chart-list">
        <li v-for="w in chartWidgets" :key="w.id" class="export-row">
          <input type="checkbox" :value="w.id" v-model="selectedIds" class="export-checkbox" />
          <input type="text" v-model="titles[w.id]" class="export-title-input" :disabled="!selectedIds.includes(w.id)" placeholder="Titre de la diapositive" />
        </li>
      </ul>

      <div class="dialog-footer">
        <span class="dialog-count">{{ slideCount }} diapositive{{ slideCount === 1 ? '' : 's' }}</span>
        <button class="outline-btn" @click="emit('close')">Annuler</button>
        <button class="confirm-btn" :disabled="slideCount === 0 || exporting" @click="runExport">
          {{ exporting ? 'Exportation…' : 'Exporter' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { displayTitle } from '../../lib/registry.js'
import { useDashboards } from '../../composables/useDashboards.js'
import { useFilters } from '../../composables/useFilters.js'

const props = defineProps({
  // { widgetId → DOM element } registry maintained by DashboardGrid
  widgetEls: { type: Object, required: true },
  theme: { type: String, default: 'dark' },
})
const emit = defineEmits(['close'])

const { activeWidgets } = useDashboards()
const { period, hasActiveFilters, filterSummaryParts } = useFilters()

const chartWidgets = computed(() => activeWidgets.value.filter(w => w.kind !== 'stat'))
const statWidgets  = computed(() => activeWidgets.value.filter(w => w.kind === 'stat'))

const selectedIds  = ref(chartWidgets.value.map(w => w.id))
const titles       = ref(Object.fromEntries(chartWidgets.value.map(w => [w.id, displayTitle(w, period.value)])))
const includeStats = ref(statWidgets.value.length > 0)
const statTitle    = ref('Key Metrics')
const exporting    = ref(false)

const slideCount = computed(() => selectedIds.value.length + (includeStats.value && statWidgets.value.length ? 1 : 0))

function toggleAll() {
  selectedIds.value = selectedIds.value.length === chartWidgets.value.length
    ? []
    : chartWidgets.value.map(w => w.id)
}

async function runExport() {
  exporting.value = true
  await nextTick()

  try {
    const PptxGenJS = (await import('pptxgenjs')).default
    const { toPng }  = await import('html-to-image')

    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_WIDE' // 13.33" × 7.5"

    const isDark  = props.theme === 'dark'
    const bgFill  = isDark ? '0f172a' : 'f1f5f9'
    const accent  = isDark ? '38bdf8' : '0284c7'
    const muted   = isDark ? '94a3b8' : '64748b'
    const textClr = isDark ? 'f1f5f9' : '1e293b'

    // ── Title slide ──────────────────────────────────────────────────────────
    const titleSlide = pptx.addSlide()
    titleSlide.background = { fill: bgFill }
    titleSlide.addText('GLPI Metrics', {
      x: 0, y: 2.2, w: '100%', h: 1.6,
      fontSize: 52, bold: true, color: accent, align: 'center',
    })
    titleSlide.addText(new Date().toLocaleString(), {
      x: 0, y: 3.9, w: '100%', h: 0.5,
      fontSize: 15, color: muted, align: 'center',
    })
    if (hasActiveFilters.value) {
      titleSlide.addText(`Filtré par : ${filterSummaryParts.value.map(p => p.text).join('  •  ')}`, {
        x: 0.5, y: 4.55, w: 12.33, h: 0.45,
        fontSize: 12, color: accent, align: 'center',
        border: { type: 'solid', color: accent, pt: 1 },
        fill: { color: accent, transparency: 85 },
      })
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    const slideW = 13.33, slideH = 7.5
    const TITLE_H = 0.55
    const SCALE = 3

    async function captureEl(el) {
      const restored = []
      for (const canvas of el.querySelectorAll('canvas')) {
        const hd = document.createElement('canvas')
        hd.width  = canvas.offsetWidth  * SCALE
        hd.height = canvas.offsetHeight * SCALE
        hd.style.cssText = canvas.style.cssText
        hd.getContext('2d').drawImage(canvas, 0, 0, hd.width, hd.height)
        canvas.replaceWith(hd)
        restored.push({ hd, canvas })
      }
      const png = await toPng(el, { pixelRatio: SCALE, skipFonts: true })
      for (const { hd, canvas } of restored) hd.replaceWith(canvas)
      return png
    }

    function addSlideWithTitle(title) {
      const slide = pptx.addSlide()
      slide.background = { fill: bgFill }
      if (title) {
        slide.addText(title, {
          x: 0.4, y: 0.12, w: slideW - 0.8, h: TITLE_H,
          fontSize: 18, bold: true, color: textClr,
        })
      }
      return slide
    }

    function fitImage(px, py, reservedH) {
      const maxH = slideH - reservedH
      let w = slideW
      let h = w * (py / px)
      if (h > maxH) { h = maxH; w = h * (px / py) }
      const x = (slideW - w) / 2
      const y = reservedH + (maxH - h) / 2
      return { x, y, w, h }
    }

    // ── Stat cards slide (all stat widgets composed side by side) ────────────
    if (includeStats.value && statWidgets.value.length) {
      const captures = []
      for (const w of statWidgets.value) {
        const el = props.widgetEls[w.id]
        if (!el) continue
        const png = await captureEl(el)
        const { width: px, height: py } = el.getBoundingClientRect()
        captures.push({ png, px, py })
      }
      if (captures.length) {
        const slide = addSlideWithTitle(statTitle.value)
        const imgH = 1.5, gap = 0.25, margin = 0.5
        let x = margin
        let y = (statTitle.value ? TITLE_H + 0.3 : 0.5)
        for (const cap of captures) {
          const imgW = imgH * (cap.px / cap.py)
          if (x + imgW > slideW - margin) { x = margin; y += imgH + gap }
          slide.addImage({ data: cap.png, x, y, w: imgW, h: imgH })
          x += imgW + gap
        }
      }
    }

    // ── One slide per chart, in dashboard order ───────────────────────────────
    for (const w of chartWidgets.value) {
      if (!selectedIds.value.includes(w.id)) continue
      const el = props.widgetEls[w.id]
      if (!el) continue

      const png = await captureEl(el)
      const { width: px, height: py } = el.getBoundingClientRect()
      const slideTitle = titles.value[w.id] ?? ''
      const slide = addSlideWithTitle(slideTitle)
      const { x, y, w: iw, h: ih } = fitImage(px, py, slideTitle ? TITLE_H + 0.1 : 0)
      slide.addImage({ data: png, x, y, w: iw, h: ih })
    }

    const date = new Date().toISOString().slice(0, 10)
    await pptx.writeFile({ fileName: `glpi-metrics-${date}.pptx` })
  } catch (e) {
    console.error('PPT export failed:', e)
  } finally {
    exporting.value = false
    emit('close')
  }
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
  width: 560px;
  max-width: 92vw;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}
.dialog-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 14px;
}
.export-section-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.export-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}
.export-checkbox {
  accent-color: var(--accent);
  width: 15px;
  height: 15px;
  cursor: pointer;
  flex-shrink: 0;
}
.export-title-input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 0.85rem;
  padding: 5px 10px;
  outline: none;
  transition: border-color 0.15s;
}
.export-title-input:focus { border-color: var(--accent); }
.export-title-input:disabled { opacity: 0.35; cursor: not-allowed; }
.select-toggle-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0;
}
.dialog-count {
  font-size: 0.78rem;
  color: var(--text-muted);
}
.export-chart-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 8px 0 4px;
  padding: 0;
  max-height: 320px;
  overflow-y: auto;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
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
