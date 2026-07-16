// Data loading state (module singleton). Tickets load eagerly; satisfaction lazily —
// either when the Satisfaction page opens or when a widget uses a satisfaction metric.
import { ref } from 'vue'
import { fetchMetrics, fetchSatisfaction } from '../api/glpi.js'

const processedTickets = ref([])
const loading     = ref(false)
const error       = ref(null)
const lastUpdated = ref(null)

const satisfactionRecords = ref([])
const satisfactionLoading = ref(false)
const satisfactionError   = ref(null)
let satisfactionLoaded = false

async function load() {
  loading.value = true
  error.value   = null
  try {
    const data = await fetchMetrics()
    processedTickets.value = data.processedTickets ?? []
    lastUpdated.value      = new Date().toLocaleTimeString()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function loadSatisfaction(force = false) {
  if (satisfactionLoading.value) return
  if (!force && satisfactionLoaded) return
  satisfactionLoading.value = true
  satisfactionError.value   = null
  try {
    satisfactionRecords.value = await fetchSatisfaction()
    satisfactionLoaded = true
  } catch (e) {
    satisfactionError.value = e.message
  } finally {
    satisfactionLoading.value = false
  }
}

export function useMetricsData() {
  return {
    processedTickets,
    loading,
    error,
    lastUpdated,
    load,
    satisfactionRecords,
    satisfactionLoading,
    satisfactionError,
    loadSatisfaction,
  }
}
