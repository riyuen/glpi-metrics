#!/usr/bin/env python3
"""
find_glpi_token_users.py

Finds GLPI users who have an API token stored — these are the users triggering:
  "Unable to decrypt string. It may have been crypted with another key."

This happens when GLPI's encryption key (glpicrypt.key) is regenerated after
a token was created. Every stored token becomes undecryptable.

Usage:
  python find_glpi_token_users.py [options]

Credentials are read from env vars (or a .env file) if not passed as CLI args:
  VITE_GLPI_URL, VITE_GLPI_APP_TOKEN, VITE_GLPI_USER_TOKEN

If GLPI is behind Cloudflare Access (Zero Trust), also set:
  CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET
Create a Service Token in Cloudflare Zero Trust → Access → Service Auth → Service Tokens.
"""

import argparse
import csv
import json
import os
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("Missing dependency: pip install requests")


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def load_dotenv(path=".env"):
    """Load key=value pairs from a .env file into os.environ (no override)."""
    env_path = Path(path)
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def parse_args():
    p = argparse.ArgumentParser(
        description="Find GLPI users with API tokens (candidates for the decrypt warning)."
    )
    p.add_argument("--url", help="GLPI base URL (e.g. https://glpi.example.com)")
    p.add_argument("--app-token", help="GLPI App-Token")
    p.add_argument("--user-token", help="GLPI user_token for initSession")
    p.add_argument(
        "--output",
        choices=["table", "csv", "json"],
        default="table",
        help="Output format (default: table)",
    )
    p.add_argument(
        "--include-deleted",
        action="store_true",
        help="Also include deleted/inactive users",
    )
    p.add_argument("--env-file", default=".env", help="Path to .env file (default: .env)")
    p.add_argument(
        "--no-verify",
        action="store_true",
        help="Disable SSL certificate verification (use if GLPI has a self-signed cert)",
    )
    p.add_argument(
        "--cf-client-id",
        help="Cloudflare Access Service Token Client ID (CF_ACCESS_CLIENT_ID env var)",
    )
    p.add_argument(
        "--cf-client-secret",
        help="Cloudflare Access Service Token Client Secret (CF_ACCESS_CLIENT_SECRET env var)",
    )
    p.add_argument(
        "--cf-cookie",
        help=(
            "CF_Authorization cookie value from your browser "
            "(DevTools → Application → Cookies → CF_Authorization). "
            "Also readable from CF_AUTH_COOKIE env var."
        ),
    )
    return p.parse_args()


def build_config(args):
    load_dotenv(args.env_file)
    url = args.url or os.environ.get("VITE_GLPI_URL", "").rstrip("/")
    app_token = args.app_token or os.environ.get("VITE_GLPI_APP_TOKEN", "")
    user_token = args.user_token or os.environ.get("VITE_GLPI_USER_TOKEN", "")
    cf_client_id = args.cf_client_id or os.environ.get("CF_ACCESS_CLIENT_ID", "")
    cf_client_secret = args.cf_client_secret or os.environ.get("CF_ACCESS_CLIENT_SECRET", "")
    cf_cookie = args.cf_cookie or os.environ.get("CF_AUTH_COOKIE", "")

    missing = []
    if not url:
        missing.append("--url / VITE_GLPI_URL")
    if not app_token:
        missing.append("--app-token / VITE_GLPI_APP_TOKEN")
    if not user_token:
        missing.append("--user-token / VITE_GLPI_USER_TOKEN")
    if missing:
        sys.exit("Missing required config:\n  " + "\n  ".join(missing))

    if cf_client_id and not cf_client_secret:
        sys.exit("--cf-client-id provided but --cf-client-secret is missing.")
    if cf_client_secret and not cf_client_id:
        sys.exit("--cf-client-secret provided but --cf-client-id is missing.")

    return {
        "url": url,
        "app_token": app_token,
        "user_token": user_token,
        "verify_ssl": not args.no_verify,
        "cf_client_id": cf_client_id,
        "cf_client_secret": cf_client_secret,
        "cf_cookie": cf_cookie,
    }


# ---------------------------------------------------------------------------
# GLPI session
# ---------------------------------------------------------------------------

class GLPISession:
    def __init__(self, base_url, app_token, user_token, verify_ssl=True,
                 cf_client_id="", cf_client_secret="", cf_cookie=""):
        self.base = base_url
        self.app_token = app_token
        self.user_token = user_token
        self.session_token = None
        self._http = requests.Session()
        self._http.verify = verify_ssl
        headers = {"App-Token": app_token, "Content-Type": "application/json"}
        if cf_client_id:
            headers["CF-Access-Client-Id"] = cf_client_id
            headers["CF-Access-Client-Secret"] = cf_client_secret
        self._http.headers.update(headers)
        if cf_cookie:
            self._http.cookies.set("CF_Authorization", cf_cookie)
        if not verify_ssl:
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    def _url(self, path):
        return f"{self.base}/apirest.php/{path.lstrip('/')}"

    def init(self):
        url = self._url("initSession")
        r = self._http.get(
            url,
            headers={"Authorization": f"user_token {self.user_token}"},
            allow_redirects=True,
        )
        if r.status_code not in (200, 201):
            sys.exit(
                f"initSession failed: HTTP {r.status_code}\n"
                f"URL: {r.url}\n"
                f"Body: {r.text[:500] or '(empty)'}"
            )
        if not r.text.strip():
            sys.exit(
                f"initSession returned an empty body (HTTP {r.status_code}).\n"
                f"Final URL after redirects: {r.url}\n"
                f"Check that VITE_GLPI_URL is the GLPI root (e.g. https://glpi.example.com),\n"
                f"not a subpath. The script appends /apirest.php/initSession automatically."
            )
        try:
            data = r.json()
        except Exception:
            cf_hint = (
                "\n  - Cloudflare Access is blocking the request — create a Service Token in\n"
                "    Cloudflare Zero Trust → Access → Service Auth → Service Tokens, then pass\n"
                "    --cf-client-id and --cf-client-secret (or set CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET)"
            )
            sys.exit(
                f"initSession returned non-JSON (HTTP {r.status_code}).\n"
                f"Final URL: {r.url}\n"
                f"Body snippet: {r.text[:500]}\n\n"
                f"Possible causes:\n"
                f"  - URL already contains /apirest.php — set VITE_GLPI_URL to the GLPI root only\n"
                f"  - SSL certificate error — try --no-verify\n"
                f"  - GLPI returned an HTML error page"
                f"{cf_hint}"
            )
        if "session_token" not in data:
            sys.exit(f"initSession response missing session_token: {data}")
        self.session_token = data["session_token"]
        self._http.headers["Session-Token"] = self.session_token
        return self

    def kill(self):
        if self.session_token:
            try:
                self._http.get(self._url("killSession"))
            except Exception:
                pass
            self.session_token = None

    def get(self, path, **params):
        r = self._http.get(self._url(path), params=params)
        r.raise_for_status()
        return r

    def __enter__(self):
        return self.init()

    def __exit__(self, *_):
        self.kill()


# ---------------------------------------------------------------------------
# Fetch users
# ---------------------------------------------------------------------------

PAGE = 500  # results per page


def fetch_all_users_direct(glpi, include_deleted):
    """
    Fetch all users via GET /User.
    Returns list of raw user dicts from GLPI (may or may not include api_token).
    """
    users = []
    start = 0
    while True:
        r = glpi.get(
            "User",
            **{
                "range": f"{start}-{start + PAGE - 1}",
                "expand_dropdowns": "false",
                "is_deleted": "true" if include_deleted else "false",
            },
        )
        batch = r.json()
        if not isinstance(batch, list):
            break
        users.extend(batch)
        content_range = r.headers.get("Content-Range", "")
        # Content-Range: 0-499/1234
        if "/" in content_range:
            total = int(content_range.split("/")[1])
            if start + PAGE >= total:
                break
        elif len(batch) < PAGE:
            break
        start += PAGE
    return users


def discover_api_token_field(glpi):
    """
    Call listSearchOptions/User and find the field ID for api_token.
    Returns the integer field ID, or None if not found.
    """
    try:
        r = glpi.get("listSearchOptions/User")
        options = r.json()
    except Exception:
        return None

    for fid, meta in options.items():
        if not isinstance(meta, dict):
            continue
        field = str(meta.get("field", "")).lower()
        name = str(meta.get("name", "")).lower()
        if "api_token" in field or "api_token" in name or "remote access key" in name:
            try:
                return int(fid)
            except ValueError:
                continue
    return None


def fetch_users_via_search(glpi, field_id, include_deleted):
    """
    Use the GLPI search API to find users where api_token is not empty.
    Returns list of dicts with keys: id, name, firstname, realname, email, api_token_date.
    """
    users = []
    start = 0
    while True:
        params = {
            "criteria[0][field]": field_id,
            "criteria[0][searchtype]": "isnotempty",
            "criteria[0][value]": "",
            "forcedisplay[0]": 2,    # ID
            "forcedisplay[1]": 1,    # Name (login)
            "forcedisplay[2]": 9,    # Email
            "forcedisplay[3]": 34,   # Firstname
            "forcedisplay[4]": 5,    # Realname
            "forcedisplay[5]": field_id,
            "range": f"{start}-{start + PAGE - 1}",
        }
        if include_deleted:
            params["is_deleted"] = 1

        try:
            r = glpi.get("search/User", **params)
            data = r.json()
        except Exception:
            break

        rows = data.get("data", [])
        if not rows:
            break
        for row in rows:
            users.append({
                "id": row.get("2", row.get("id", "")),
                "name": row.get("1", row.get("name", "")),
                "email": row.get("9", row.get("email", "")),
                "firstname": row.get("34", row.get("firstname", "")),
                "realname": row.get("5", row.get("realname", "")),
                "api_token_date": row.get(str(field_id), ""),
            })

        count = data.get("count", len(rows))
        total = data.get("totalcount", count)
        if start + PAGE >= total:
            break
        start += PAGE
    return users


def fetch_users_with_tokens(glpi, include_deleted):
    """
    Strategy:
    1. Fetch all users directly; return those with non-empty api_token field.
    2. If api_token is missing from direct results, fall back to search API.
    """
    print("Fetching user list from GLPI...", flush=True)
    all_users = fetch_all_users_direct(glpi, include_deleted)

    # Check if direct results contain api_token
    has_token_field = any("api_token" in u for u in all_users)

    if has_token_field:
        affected = [
            {
                "id": u.get("id", ""),
                "name": u.get("name", ""),
                "firstname": u.get("firstname", ""),
                "realname": u.get("realname", ""),
                "email": u.get("email", u.get("_email", [""])[0] if isinstance(u.get("_email"), list) else ""),
                "api_token_date": u.get("api_token_date", ""),
                "is_active": u.get("is_active", 1),
            }
            for u in all_users
            if u.get("api_token") not in (None, "", "NULL")
        ]
        print(f"  Fetched {len(all_users)} users; {len(affected)} have an API token set.")
        return affected

    # Fallback: search API
    print("  api_token not exposed in direct results — trying search API...")
    field_id = discover_api_token_field(glpi)
    if field_id is None:
        print("  WARNING: Could not discover api_token field ID via listSearchOptions.")
        print("  Tip: run with an admin account, or pass --url/--app-token/--user-token for a super-admin.")
        return []

    print(f"  Found api_token search field ID: {field_id}")
    users = fetch_users_via_search(glpi, field_id, include_deleted)
    print(f"  Found {len(users)} user(s) with API token via search API.")
    return users


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

COLUMNS = ["id", "name", "firstname", "realname", "email", "api_token_date", "is_active"]
HEADERS = ["ID", "Username", "First name", "Last name", "Email", "Token date", "Active"]


def full_name(u):
    parts = [u.get("firstname", ""), u.get("realname", "")]
    return " ".join(p for p in parts if p).strip() or "-"


def print_table(users):
    if not users:
        print("\nNo users with API tokens found.")
        return

    rows = []
    for u in users:
        active = "Yes" if str(u.get("is_active", 1)) in ("1", "True", "true") else "No"
        rows.append([
            str(u.get("id", "")),
            u.get("name", "-"),
            full_name(u),
            u.get("email", "-"),
            str(u.get("api_token_date", "-")) or "-",
            active,
        ])

    hdrs = ["ID", "Username", "Full Name", "Email", "Token Date", "Active"]
    widths = [max(len(hdrs[i]), max(len(r[i]) for r in rows)) for i in range(len(hdrs))]

    sep = "+-" + "-+-".join("-" * w for w in widths) + "-+"
    hdr_row = "| " + " | ".join(hdrs[i].ljust(widths[i]) for i in range(len(hdrs))) + " |"

    print()
    print(f"=== GLPI Users with API Token set ({len(users)} found) ===")
    print("These users may trigger \"Unable to decrypt string\" if the GLPI key was rotated.")
    print()
    print(sep)
    print(hdr_row)
    print(sep)
    for r in rows:
        print("| " + " | ".join(r[i].ljust(widths[i]) for i in range(len(hdrs))) + " |")
    print(sep)

    print()
    print("FIX: Ask each user to regenerate their API token via:")
    print("  GLPI → Preferences → Remote access keys → Regenerate")
    print("Or an admin can clear the token in Administration → Users → [user] → Remote access keys.")


def print_csv(users):
    writer = csv.DictWriter(sys.stdout, fieldnames=COLUMNS, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(users)


def print_json(users):
    print(json.dumps(users, indent=2, default=str))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = parse_args()
    cfg = build_config(args)

    try:
        with GLPISession(
            cfg["url"], cfg["app_token"], cfg["user_token"],
            verify_ssl=cfg["verify_ssl"],
            cf_client_id=cfg["cf_client_id"],
            cf_client_secret=cfg["cf_client_secret"],
            cf_cookie=cfg["cf_cookie"],
        ) as glpi:
            users = fetch_users_with_tokens(glpi, args.include_deleted)
    except requests.exceptions.HTTPError as e:
        sys.exit(f"GLPI API error: {e}\nResponse: {e.response.text[:500]}")
    except requests.exceptions.ConnectionError as e:
        sys.exit(f"Connection error: {e}")

    if args.output == "csv":
        print_csv(users)
    elif args.output == "json":
        print_json(users)
    else:
        print_table(users)


if __name__ == "__main__":
    main()
