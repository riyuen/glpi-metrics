// Flattens a computeWidgetData() payload (lib/aggregate.js) into a generic
// { columns, rows } table for the scheduled-email HTML table + Excel sheet.
// Reuses the exact payload driving on-screen rendering, so exported numbers
// can never disagree with what the dashboard shows.
export function widgetToTable(payload) {
  if (payload.kind === 'stat') {
    return { columns: ['Valeur'], rows: [[payload.value]] }
  }
  if (payload.kind === 'chart') {
    const columns = ['', ...payload.series.map(s => s.name)]
    const rows = payload.labels.map((label, i) => [
      label,
      ...payload.series.map(s => s.data[i] ?? ''),
    ])
    return { columns, rows }
  }
  // techTree / heatmap: kept out of the tabular export for v1 — still captured
  // in the dashboard screenshot.
  return null
}
