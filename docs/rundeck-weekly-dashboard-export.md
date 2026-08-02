# Weekly dashboard export by email (Rundeck)

This app already ships everything needed to render one dashboard headlessly and
produce email-ready artifacts — it just isn't wired to a scheduler yet. This
doc is the runbook for doing that with Rundeck (which runs on a separate host
from the Docker stack, reaching it as an SSH node).

Nothing here is application code: it's Rundeck job configuration, done once
through the Rundeck UI. No job export is checked into this repo, since the
job is host/SMTP-specific and lives entirely in Rundeck.

## What already exists

- `GET /print/:dashboardId` — a chrome-free render of one dashboard
  (`src/pages/DashboardPrint.vue`), purpose-built for headless capture. It
  waits for data + chart animation to settle, then sets
  `window.__DASHBOARD_EXPORT__ = { ready: true, dashboardName, widgets }`.
- `dashboard-render/render_dashboard.py` — a Playwright script that drives
  that route and writes `dashboard.png` (full-page screenshot),
  `dashboard.xlsx` (per-widget tables), and `dashboard.html` (self-contained
  email body, screenshot inlined as base64) to `OUTPUT_DIR` (default
  `/output`).
- The `dashboard-render` service in `docker-compose.yml` — `profiles: ["cron"]`,
  so it's excluded from `docker compose up` and only runs via an explicit
  `docker compose run`, invoked with a `DASHBOARD_ID` env var.

None of this sends email — that's intentionally left to Rundeck's own cron
trigger + mail step, which is what the rest of this doc sets up.

## 1. Prerequisites on the Docker host

Add the Docker host as a Rundeck node (SSH) if it isn't one already, and
make sure:

- The Rundeck SSH user can run `docker compose` in the repo's deployment
  directory — via docker group membership, or passwordless `sudo` scoped to
  `docker compose`.
- A mail-sending tool available on that node — `msmtp` is assumed below — to
  send the message from a script step. **Reuse the SMTP relay Rundeck's own
  notification plugin already sends through** (see step 3) rather than
  configuring separate mail infrastructure/credentials.

## 2. Finding a dashboard's ID

Dashboards are records (`{ id, name, widgets }`) in the shared doc served by
`dashboards-api` (see `src/composables/useDashboards.js`). Look one up with:

```bash
curl -s http://<app-host>/api/dashboards | jq '.dashboards[] | {id, name}'
```

Copy the `id` (looks like `d-<uuid>`) for the dashboard you want to export.

## 3. The Rundeck job

**Options**
| Name | Required | Notes |
|---|---|---|
| `dashboard_id` | yes | from step 2 above |
| `recipients` | yes | comma-separated email addresses |
| `smtp_password` | yes | **Secure** option, bound to "Option value from Key Storage" (see step 3's Step 2) — never entered as plain text |

**Node filter**: the single Docker-host node — both steps below need to run
on it so they share a filesystem.

**Schedule**: weekly cron trigger, e.g. `0 0 8 ? * MON *` for Monday 08:00.
Adjust per dashboard/audience.

**Concurrency**: enable "do not run concurrent executions" on the job. The
`dashboard-render` service's default bind mount is a single
`./dashboard-render/output` directory — two overlapping runs (e.g. this job
cloned for a second dashboard on a similar schedule) would otherwise race and
clobber each other's files. Step 1 below also gives each *execution* its own
output subdirectory as a second layer of protection, and as a side effect
keeps a small history of past exports for debugging.

**Step 1 — render** (node step, on the Docker host):

```bash
cd /path/to/glpi-metrics && \
docker compose --profile cron run --rm \
  -e DASHBOARD_ID=${option.dashboard_id} \
  -v "$(pwd)/dashboard-render/output/${RD_JOB_EXECID}:/output" \
  dashboard-render
```

`${RD_JOB_EXECID}` is Rundeck's own execution-ID variable. Substitute
`/path/to/glpi-metrics` with wherever this repo is deployed on the host.

**Step 2 — send email** (node step, same node, runs after step 1 succeeds):
read `dashboard.html` from that same execution's output directory as the
email body, attach `dashboard.png` and `dashboard.xlsx`, send to
`${option.recipients}` — **through the same SMTP relay Rundeck's own
notification plugin already uses**, not a newly-configured one.

Rundeck's stock email notification plugin can only attach the execution log,
not arbitrary workspace files, which is why this is a script step instead of
a notification — but there's no reason to stand up separate mail
infrastructure just because of that. Reuse what's already there:

1. On the Rundeck server, find the relay it already sends through (used by
   its own job notifications):
   ```bash
   grep -i '^grails.mail' /etc/rundeck/rundeck-config.properties
   ```
   Note `grails.mail.host`, `grails.mail.port`, `grails.mail.username`, and
   whether `grails.mail.props.mail.smtp.auth` / `...starttls.enable` are set.
   Paths vary by install (e.g. `$RDECK_BASE/server/config/...` for a
   non-package install) — search there if the path above doesn't exist.
2. If the password isn't already in Rundeck's **Key Storage**, add it there
   (Project → Key Storage → upload a Password-type key). Bind it to the
   job's `smtp_password` option via "Option value from Key Storage" so it's
   injected at execution time and never written to disk or shown in logs.
3. Hardcode `smtp_host`/`smtp_port`/`smtp_user` (not secrets) directly in the
   script below from what you found in step 1, and build the `msmtp` config
   in-memory rather than as a persisted `~/.msmtprc`:

```bash
OUT="/path/to/glpi-metrics/dashboard-render/output/${RD_JOB_EXECID}"
DASHBOARD_NAME=$(grep -oP '(?<=<h2>).*?(?=</h2>)' "$OUT/dashboard.html")

msmtp_config=$(mktemp)
trap 'rm -f "$msmtp_config"' EXIT
cat > "$msmtp_config" <<CONF
account default
host <smtp-host-from-step-1>
port <smtp-port-from-step-1>
auth on
user <smtp-user-from-step-1>
password ${option.smtp_password}
tls on
from <smtp-user-from-step-1>
CONF
chmod 600 "$msmtp_config"

{
  echo "To: ${option.recipients}"
  echo "Subject: Weekly dashboard export – ${DASHBOARD_NAME}"
  echo "MIME-Version: 1.0"
  echo "Content-Type: multipart/mixed; boundary=\"BOUNDARY\""
  echo
  echo "--BOUNDARY"
  echo "Content-Type: text/html; charset=UTF-8"
  echo
  cat "$OUT/dashboard.html"
  for f in dashboard.png dashboard.xlsx; do
    echo "--BOUNDARY"
    echo "Content-Type: application/octet-stream; name=\"$f\""
    echo "Content-Transfer-Encoding: base64"
    echo "Content-Disposition: attachment; filename=\"$f\""
    echo
    base64 "$OUT/$f"
  done
  echo "--BOUNDARY--"
} | msmtp -C "$msmtp_config" -t
```

Set `tls`/`auth` above to match whatever `grails.mail.props.*` showed in
step 1 — if Rundeck's relay doesn't use STARTTLS or auth, drop those lines
to match.

## 4. Verification

- Run the job once ad hoc (not on the schedule) against a known
  `dashboard_id` and a test recipient. Confirm the email arrives with a
  readable screenshot, a working `.xlsx` attachment, and correctly rendered
  HTML tables in the body.
- Check that each execution's output lands in its own
  `dashboard-render/output/<execid>/` directory rather than overwriting a
  shared one.
- After the first scheduled run, check Rundeck's execution history to
  confirm the weekly trigger actually fired.
- Optional follow-up, not a blocker: old `dashboard-render/output/*`
  directories aren't cleaned up automatically — add a retention step (cron
  or logrotate-style) if disk usage becomes a concern.
