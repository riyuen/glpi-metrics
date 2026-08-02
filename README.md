# GLPI Metrics

A Vue 3 dashboard for visualising GLPI helpdesk metrics — SLA compliance, ticket volumes, satisfaction surveys, and more.

## Features

- **Tableau de bord** (`/`) — stat cards, interactive charts, drag-and-drop layout, PowerPoint export
- **Tickets par groupe** (`/tickets`) — per-group ticket list with status and SLA compliance
- **Sans prise en charge** (`/unacknowledged`) — open tickets with no TTO older than 30 days
- **Satisfaction** (`/satisfaction`) — satisfaction survey scores and comments by group

Each tab is a distinct URL — bookmarkable and browser-history aware.

## Prerequisites

- Docker + Docker Compose
- A running GLPI instance with REST API enabled
- A GLPI app token and user token

## Setup

1. Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `VITE_GLPI_URL` | Your GLPI instance URL, no trailing slash (e.g. `https://glpi.example.com`) |
| `VITE_GLPI_APP_TOKEN` | GLPI REST API app token — create one in **Setup → General → API** |
| `VITE_GLPI_USER_TOKEN` | GLPI user token — find it in your profile under **User token** |

2. Build and start:

```bash
docker compose up -d --build
```

The app is served on **port 80**. Point your domain's DNS A record at the server and it will be accessible at `http://your-domain`.

## Architecture

```
Browser → nginx (port 80)
            ├── /           → Vue SPA (built static files)
            └── /api/       → pre-fetched JSON written by Airflow
```

`VITE_GLPI_URL` is baked into the built JS bundle at build time (Vite inlines `import.meta.env.VITE_GLPI_URL` — see `src/api/glpi.js`). It's used only to build deep-links back to GLPI tickets (`${GLPI_URL}/front/ticket.form.php?id=…`) in `TicketListDialog.vue`, `Satisfaction.vue`, `UnacknowledgedTickets.vue`, and `TicketsByGroup.vue` — the frontend never calls the GLPI REST API directly or through a proxy; it only reads pre-fetched `/api/metrics.json` / `/api/satisfaction.json` written by Airflow.

## Development

Node 18+ is required locally only for linting/IDE support. The production build always runs inside Docker.

```bash
npm install
npm run dev    # Vite dev server on http://localhost:5173
npm run build  # Production build → dist/
```

## Airflow (optional)

A companion Airflow service pre-fetches and caches GLPI metrics as JSON under `~/glpi-metrics-data/`. This reduces load on the GLPI API and speeds up the dashboard. Configure DAGs in `airflow/dags/`.

```bash
docker compose up -d airflow
# Airflow UI: http://server:8080
```

## Scheduled email export (optional)

A dashboard can be rendered headlessly (screenshot + Excel + HTML email body)
via the `dashboard-render` service (`profiles: ["cron"]`, so it's excluded
from `docker compose up` and only runs on demand or from a scheduler).
Scheduling and actually sending the email are left to Rundeck — see
[`docs/rundeck-weekly-dashboard-export.md`](docs/rundeck-weekly-dashboard-export.md)
for the full runbook.

## Notes

- **Corporate proxy / self-signed SSL**: the Dockerfile uses `npm ci --strict-ssl=false` for environments with SSL inspection. Remove that flag if not needed.
- Chart order, card order, and sizes are persisted in `localStorage`.
- Theme (dark/light) is also persisted in `localStorage`.
