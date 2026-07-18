// Minimal, dependency-free store for the shared dashboards document.
// Single JSON file on the same volume the Airflow DAG writes metrics.json/satisfaction.json to.
// No auth — matches the rest of this app, which has none either.
const http = require('http')
const fs = require('fs')
const path = require('path')

const DATA_DIR = process.env.DATA_DIR || '/data'
const FILE = path.join(DATA_DIR, 'dashboards.json')
const PORT = process.env.PORT || 3001
const MAX_BODY_BYTES = 10 * 1024 * 1024 // 10MB, generous for a widget-list JSON doc

function readDoc() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return null
  }
}

// Same temp-file-then-rename pattern as the Airflow DAG's atomic_write().
function writeDocAtomic(doc) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const tmp = path.join(DATA_DIR, `.dashboards.json.tmp-${process.pid}-${Date.now()}`)
  fs.writeFileSync(tmp, JSON.stringify(doc))
  fs.renameSync(tmp, FILE)
}

function isValidDoc(doc) {
  return doc != null
    && typeof doc === 'object'
    && doc.version === 1
    && Array.isArray(doc.dashboards)
}

const server = http.createServer((req, res) => {
  if (req.url !== '/dashboards') {
    res.writeHead(404)
    res.end()
    return
  }

  if (req.method === 'GET') {
    const doc = readDoc()
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(doc == null ? 'null' : JSON.stringify(doc))
    return
  }

  // Accept POST as well as PUT: some front-line WAFs/proxies block PUT by default.
  if (req.method === 'PUT' || req.method === 'POST') {
    let body = ''
    let tooLarge = false
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > MAX_BODY_BYTES) {
        tooLarge = true
        req.destroy()
      }
    })
    req.on('end', () => {
      if (tooLarge) return
      let doc
      try {
        doc = JSON.parse(body)
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end(`Invalid JSON: ${e.message}`)
        return
      }
      if (!isValidDoc(doc)) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Invalid document shape: expected { version: 1, dashboards: [...] }')
        return
      }
      try {
        writeDocAtomic(doc)
        res.writeHead(204)
        res.end()
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end(`Write failed: ${e.message}`)
      }
    })
    return
  }

  res.writeHead(405, { 'Allow': 'GET, POST, PUT' })
  res.end()
})

server.listen(PORT, () => {
  console.log(`dashboards-api listening on :${PORT}, storing at ${FILE}`)
})
