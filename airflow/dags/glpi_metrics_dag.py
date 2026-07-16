"""
GLPI Metrics DAG
Fetches data from GLPI REST API every 15 minutes, processes it,
and writes /data/metrics.json + /data/satisfaction.json.
"""
import json
import logging
import math
import os
import re
import tempfile
from datetime import datetime, timezone

import requests
from airflow import DAG
from airflow.operators.python import PythonOperator

log = logging.getLogger(__name__)

GLPI_URL       = os.environ["GLPI_URL"].rstrip("/")
APP_TOKEN      = os.environ["GLPI_APP_TOKEN"]
USER_TOKEN     = os.environ["GLPI_USER_TOKEN"]
BASE           = f"{GLPI_URL}/apirest.php"
PAGE_SIZE      = 1000
OUTPUT_DIR     = "/data"


# ---------------------------------------------------------------------------
# GLPI session helpers
# ---------------------------------------------------------------------------

def init_session() -> str:
    resp = requests.post(
        f"{BASE}/initSession",
        headers={
            "Authorization": f"user_token {USER_TOKEN}",
            "App-Token": APP_TOKEN,
            "Content-Type": "application/json",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["session_token"]


def api_headers(session_token: str) -> dict:
    return {"Session-Token": session_token, "App-Token": APP_TOKEN}


def fetch_page(session_token: str, path: str, start: int) -> tuple[list, int]:
    sep = "&" if "?" in path else "?"
    url = f"{BASE}/{path}{sep}range={start}-{start + PAGE_SIZE - 1}"
    resp = requests.get(url, headers=api_headers(session_token), timeout=60)
    if not resp.ok:
        return [], 0
    data = resp.json()
    cr = resp.headers.get("Content-Range", "")
    total = int(cr.split("/")[1]) if "/" in cr else len(data)
    return data, total


def fetch_all(session_token: str, path: str) -> list:
    first, total = fetch_page(session_token, path, 0)
    if total <= PAGE_SIZE:
        return first
    pages = []
    for start in range(PAGE_SIZE, total, PAGE_SIZE):
        page, _ = fetch_page(session_token, path, start)
        pages.extend(page)
    return first + pages


def fetch_all_tickets(session_token: str) -> list:
    tickets = fetch_all(session_token, "Ticket?is_deleted=0")
    return [t for t in tickets if not t.get("is_deleted")]


# ---------------------------------------------------------------------------
# Business logic (mirrors glpi.js)
# ---------------------------------------------------------------------------

def clean_group_name(name: str) -> str:
    return re.sub(r"^G_SEC_USR_TAUTURU_", "", name, flags=re.IGNORECASE)


def is_breached(ticket: dict) -> bool:
    now = datetime.now(timezone.utc)

    def parse(s):
        if not s:
            return None
        try:
            dt = datetime.fromisoformat(s)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None

    if ticket.get("time_to_own"):
        deadline = parse(ticket["time_to_own"])
        achieved = parse(ticket.get("takeintoaccountdate"))
        if deadline:
            if achieved:
                if achieved > deadline:
                    return True
            elif now > deadline:
                return True

    if ticket.get("time_to_resolve"):
        deadline = parse(ticket["time_to_resolve"])
        solved = parse(ticket.get("solvedate"))
        if deadline:
            if solved:
                if solved > deadline:
                    return True
            elif now > deadline:
                return True

    return False


def to_iso_week(date_str: str) -> str:
    """Return 'YYYY-WXX' ISO week label for a GLPI date string."""
    try:
        d = datetime.fromisoformat(date_str)
    except (ValueError, TypeError):
        return ""
    iso_year, iso_week, _ = d.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def to_iso_quarter(date_str: str) -> str:
    """Return 'YYYY-QX' quarter label for a GLPI date string."""
    try:
        d = datetime.fromisoformat(date_str)
    except (ValueError, TypeError):
        return ""
    return f"{d.year}-Q{(d.month - 1) // 3 + 1}"


def ms_between(a: str | None, b: str | None) -> int | None:
    if not a or not b:
        return None
    try:
        ta = datetime.fromisoformat(a)
        tb = datetime.fromisoformat(b)
        diff = int((tb - ta).total_seconds() * 1000)
        return diff if diff > 0 else None
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Main task
# ---------------------------------------------------------------------------

def fetch_and_write(**_):
    log.info("Connecting to GLPI at %s", GLPI_URL)
    session_token = init_session()

    log.info("Fetching all data in parallel (sequential here for simplicity)")
    tickets      = fetch_all_tickets(session_token)
    groups       = fetch_all(session_token, "Group")
    group_tickets = fetch_all(session_token, "Group_Ticket")
    entities     = fetch_all(session_token, "Entity")
    slas         = fetch_all(session_token, "SLA")
    users        = fetch_all(session_token, "User")
    ticket_users = fetch_all(session_token, "Ticket_User")
    group_users  = fetch_all(session_token, "Group_User")
    satisfactions = fetch_all(session_token, "TicketSatisfaction")

    log.info(
        "Fetched: %d tickets, %d groups, %d group_tickets, %d entities, "
        "%d slas, %d users, %d ticket_users, %d group_users, %d satisfactions",
        len(tickets), len(groups), len(group_tickets), len(entities),
        len(slas), len(users), len(ticket_users), len(group_users), len(satisfactions),
    )

    # Build lookup maps
    group_names = {g["id"]: clean_group_name(g["name"]) for g in groups}
    entity_names = {e["id"]: e["name"] for e in entities}
    user_names = {
        u["id"]: " ".join(filter(None, [u.get("firstname"), u.get("realname")])) or u.get("name", "")
        for u in users
    }

    sla_map = {}
    for s in slas:
        secs = int(s.get("resolution_time") or 0)
        sla_map[s["id"]] = {
            "name": s["name"],
            "targetH": round(secs / 3600, 1) if secs > 0 else None,
        }

    # ticket → assigned group (type 2)
    group_map: dict[int, str] = {}
    for gt in group_tickets:
        if gt.get("type") == 2 and gt["tickets_id"] not in group_map:
            group_map[gt["tickets_id"]] = group_names.get(gt["groups_id"], "Unknown")

    # ticket → tech name + userId (type 2)
    tech_map: dict[int, str] = {}
    tech_user_id_map: dict[int, int] = {}
    # ticket → requester (type 1)
    requester_map: dict[int, str] = {}
    for tu in ticket_users:
        t = int(tu.get("type", 0))
        tid = tu["tickets_id"]
        if t == 2 and tid not in tech_map:
            tech_map[tid] = user_names.get(tu["users_id"], f"User {tu['users_id']}")
            tech_user_id_map[tid] = tu["users_id"]
        elif t == 1 and tid not in requester_map:
            requester_map[tid] = user_names.get(tu["users_id"], f"User {tu['users_id']}")

    # userId → set of group names
    group_membership: dict[int, set] = {}
    for gu in group_users:
        gname = group_names.get(gu["groups_id"])
        if not gname:
            continue
        group_membership.setdefault(gu["users_id"], set()).add(gname)

    # ------------------------------------------------------------------
    # Process tickets → metrics.json
    # ------------------------------------------------------------------
    by_status: dict[int, int] = {}
    by_priority: dict[int, int] = {}

    processed_tickets = []

    for ticket in tickets:
        tid    = ticket["id"]
        name   = ticket.get("name", "")
        status = int(ticket.get("status", 0))
        priority = int(ticket.get("priority", 0))
        date   = ticket.get("date")
        week    = to_iso_week(date) if date else None
        month   = date[:7] if date else None
        quarter = to_iso_quarter(date) if date else None
        group  = group_map.get(tid, "Unassigned")
        entity = entity_names.get(ticket.get("entities_id"), f"Entity {ticket.get('entities_id')}")
        breached = is_breached(ticket)

        by_status[status] = by_status.get(status, 0) + 1
        by_priority[priority] = by_priority.get(priority, 0) + 1

        ttr_sla_id = int(ticket.get("slas_id_ttr") or 0)
        tto_sla_id = int(ticket.get("slas_id_tto") or 0)
        ttr_sla = sla_map.get(ttr_sla_id) if ttr_sla_id > 0 else None
        tto_sla = sla_map.get(tto_sla_id) if tto_sla_id > 0 else None

        uid = tech_user_id_map.get(tid)
        tech_name = (
            tech_map[tid]
            if uid is not None and group in group_membership.get(uid, set())
            else None
        )

        processed_tickets.append({
            "id":           tid,
            "name":         name,
            "date":         date,
            "status":       status,
            "priority":     priority,
            "week":         week,
            "month":        month,
            "quarter":      quarter,
            "group":        group,
            "entity":       entity,
            "breached":     breached,
            "hasNoTTO":     not ticket.get("takeintoaccountdate"),
            "resolveMs":    ms_between(date, ticket.get("solvedate")) if status in (5, 6) else None,
            "actualTTOMs":  ms_between(date, ticket.get("takeintoaccountdate")),
            "slaTTOMs":     ms_between(date, ticket.get("time_to_own")),
            "slaTTRMs":     ms_between(date, ticket.get("time_to_resolve")),
            "slaTTRName":   ttr_sla["name"]    if ttr_sla else None,
            "slaTTRTargetH":ttr_sla["targetH"] if ttr_sla else None,
            "ttoSlaName":   tto_sla["name"]    if tto_sla else None,
            "ttoSlaTargetH":tto_sla["targetH"] if tto_sla else None,
            "techName":     tech_name,
        })

    metrics = {
        "byStatus":        by_status,
        "byPriority":      by_priority,
        "processedTickets": processed_tickets,
        "fetchedAt":       datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

    # ------------------------------------------------------------------
    # Process satisfactions → satisfaction.json
    # ------------------------------------------------------------------
    satisfaction_list = []
    for s in satisfactions:
        if not s.get("date_answered") or not int(s.get("satisfaction") or 0) > 0:
            continue
        tid   = s["tickets_id"]
        group = group_map.get(tid, "Unassigned")
        uid   = tech_user_id_map.get(tid)
        technician = (
            tech_map[tid]
            if uid is not None and group in group_membership.get(uid, set())
            else "—"
        )
        satisfaction_list.append({
            "ticketId":   tid,
            "score":      int(s["satisfaction"]),
            "comment":    (s.get("comment") or "").strip(),
            "date":       s["date_answered"],
            "group":      group,
            "technician": technician,
            "requester":  requester_map.get(tid, "—"),
        })
    satisfaction_list.sort(key=lambda x: x["date"] or "", reverse=True)

    # ------------------------------------------------------------------
    # Atomic write (temp file → rename)
    # ------------------------------------------------------------------
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    def atomic_write(filename: str, data):
        dest = os.path.join(OUTPUT_DIR, filename)
        fd, tmp = tempfile.mkstemp(dir=OUTPUT_DIR, prefix=f".{filename}.tmp")
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(data, f, ensure_ascii=False)
            os.chmod(tmp, 0o644)  # Make readable by all
            os.replace(tmp, dest)
            log.info("Wrote %s", dest)
        except Exception:
            os.unlink(tmp)
            raise

    atomic_write("metrics.json", metrics)
    atomic_write("satisfaction.json", satisfaction_list)
    log.info("Done. fetchedAt=%s", metrics["fetchedAt"])


# ---------------------------------------------------------------------------
# DAG definition
# ---------------------------------------------------------------------------

with DAG(
    dag_id="glpi_metrics",
    schedule_interval="*/15 * * * *",
    start_date=datetime(2024, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    tags=["glpi"],
) as dag:
    PythonOperator(
        task_id="fetch_and_write",
        python_callable=fetch_and_write,
    )
