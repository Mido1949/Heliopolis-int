"""Collect the raw material for the daily report into reports/daily/<date>/context.json.

Deterministic part of the pipeline: CRM numbers straight from Supabase, plus a
digest of today's Claude sessions, git commits and touched files. The narrative
is written afterwards by the headless agent (see prompt.md).
"""
import glob
import json
import os
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

ROOT = Path(__file__).resolve().parents[2]
CAIRO = ZoneInfo("Africa/Cairo")
RUN_MARKER = "[[DAILY-REPORT-RUN]]"
RUN_PROMPT = "Read tools/daily_report/prompt.md"
OPEN_STAGES_EXCLUDED = {"NEW", "LOST", "WELCOME_SENT", "NO_RESPONSE"}
REPOS = [ROOT, Path("d:/heliomax-web")]
SKIP_DIRS = {"node_modules", ".next", ".git", ".vercel", "__pycache__", ".superpowers", "spec-kit"}


# Mido's machine has .env.local. The cloud scheduled task has none: the Supabase URL
# comes from an environment variable and the agent proxy adds the key to every
# request for the Supabase host (a network secret), so the key is never in the VM.
LOCAL = (ROOT / ".env.local").exists()
BUCKET = "daily-reports"


def load_env():
    env = {}
    if LOCAL:
        for line in (ROOT / ".env.local").read_text(encoding="utf-8-sig").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"')
    for k, v in os.environ.items():
        env.setdefault(k, v)
    return env


def auth(env):
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    return {"apikey": key, "Authorization": f"Bearer {key}"} if key else {}


def storage_get(env, obj):
    """The run's memory between days (stage history, yesterday's report) lives in the
    report bucket, so a run on any machine sees what the previous run left."""
    r = requests.get(f"{env['NEXT_PUBLIC_SUPABASE_URL']}/storage/v1/object/{BUCKET}/{obj}", headers=auth(env), timeout=60)
    return r.content if r.ok else None


def storage_put(env, obj, data, content_type="application/json"):
    base = env["NEXT_PUBLIC_SUPABASE_URL"] + "/storage/v1"
    requests.post(f"{base}/bucket", headers=auth(env), json={"id": BUCKET, "name": BUCKET, "public": False}, timeout=60)
    r = requests.post(f"{base}/object/{BUCKET}/{obj}", headers={**auth(env), "Content-Type": content_type, "x-upsert": "true"},
                      data=data, timeout=120)
    r.raise_for_status()


def rest(env, table, params):
    url = f"{env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/{table}"
    headers = auth(env)
    rows, offset = [], 0
    while True:
        r = requests.get(url, headers=headers, params={**params, "limit": 1000, "offset": offset}, timeout=60)
        r.raise_for_status()
        page = r.json()
        rows += page
        if len(page) < 1000:
            return rows
        offset += 1000


def clip(text, n):
    text = (text or "").strip()
    return text if len(text) <= n else text[:n] + "…"


def crm(env, day_start_utc, date_str):
    since = day_start_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    leads = rest(env, "leads", {"select": "*", "country": "eq.EG", "archived_at": "is.null"})
    names = {p["id"]: p["name"] for p in rest(env, "profiles", {"select": "id,name"})}
    by_id = {l["id"]: l for l in leads}

    def brief(l):
        return {
            "name": l.get("name"), "company": l.get("company"), "stage": l.get("pipeline_stage"),
            "deal_value": l.get("deal_value"), "source": l.get("source"), "client_type": l.get("client_type"),
            "region": l.get("region"), "project": clip(l.get("project_description"), 160),
            "notes": clip(l.get("notes"), 240),
        }

    new_today = [l for l in leads if l["created_at"] >= since.replace("Z", "")]
    new_ids = {l["id"] for l in new_today}
    updated_today = [l for l in leads if (l.get("updated_at") or "") >= since.replace("Z", "") and l["id"] not in new_ids]

    # Stage moves need yesterday's picture; the CRM keeps no stage history.
    state_file = ROOT / "reports" / "daily" / "_state" / "stages.json"
    saved = state_file.read_bytes() if state_file.exists() else storage_get(env, "_state/stages.json")
    state = json.loads(saved) if saved else {}
    prev_dates = sorted(d for d in state if d < date_str)
    moves, prev_date = [], prev_dates[-1] if prev_dates else None
    if prev_date:
        prev = state[prev_date]
        for l in leads:
            old = prev.get(l["id"])
            if old and old != l.get("pipeline_stage"):
                moves.append({"name": l.get("name"), "from": old, "to": l.get("pipeline_stage"), "deal_value": l.get("deal_value")})
    state[date_str] = {l["id"]: l.get("pipeline_stage") for l in leads}
    for d in sorted(state)[:-7]:
        del state[d]
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(json.dumps(state), encoding="utf-8")
    storage_put(env, "_state/stages.json", json.dumps(state).encode())

    day = {"created_at": f"gte.{since}", "country": "eq.EG"}
    acts = rest(env, "lead_activities", {"select": "type,user_id,lead_id,details", **day})
    calls = rest(env, "call_logs", {"select": "outcome,created_by", **day})
    tasks_new = rest(env, "tasks", {"select": "title,status", **day})
    tasks_done = rest(env, "tasks", {"select": "title", "completed_at": f"gte.{since}", "country": "eq.EG"})
    visits = rest(env, "field_visits", {"select": "id", **day})

    return {
        "scope": "Egypt only, non-archived leads",
        "deal_value_warning": "deal_value mixes currencies (USD and EGP). Never sum it. Quote each value as stored.",
        "stage_counts": dict(Counter(l.get("pipeline_stage") for l in leads)),
        "total_leads": len(leads),
        "new_today": [brief(l) for l in new_today],
        "new_today_by_source": dict(Counter(l.get("source") or "—" for l in new_today)),
        "updated_today": [brief(l) for l in updated_today][:40],
        "stage_moves_since": prev_date,
        "stage_moves": moves,
        "open_pipeline": sorted(
            (brief(l) for l in leads if l.get("pipeline_stage") not in OPEN_STAGES_EXCLUDED),
            key=lambda b: b["stage"] or "",
        ),
        "activities_today": {
            "total": len(acts),
            "by_type": dict(Counter(a["type"] for a in acts)),
            "by_user": dict(Counter(names.get(a["user_id"], "غير معروف") for a in acts)),
            "edited_fields": dict(Counter(f for a in acts for f in (a.get("details") or {}).get("changes", []))),
            "leads_touched": len({a["lead_id"] for a in acts if a.get("lead_id") in by_id}),
        },
        "calls_today": {"total": len(calls), "by_outcome": dict(Counter(c.get("outcome") or "—" for c in calls))},
        "tasks_created_today": len(tasks_new),
        "tasks_completed_today": [t["title"] for t in tasks_done],
        "field_visits_today": len(visits),
    }


REMINDER = re.compile(r"<system-reminder>.*?</system-reminder>", re.S)
NOISE_PREFIXES = ("This session is being continued", "<", "Caveat:", "[Request interrupted")


def sessions(day_start_utc):
    """One entry per turn: what Mido asked and the last thing Claude answered."""
    turns = []
    pattern = os.path.expanduser("~/.claude/projects/*/*.jsonl")
    for path in glob.glob(pattern):
        if "helio" not in Path(path).parent.name.lower():
            continue
        if datetime.fromtimestamp(os.path.getmtime(path), timezone.utc) < day_start_utc:
            continue
        file_turns, current, is_report_run, seen_user = [], None, False, False
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                try:
                    d = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if d.get("isSidechain") or d.get("isMeta") or d.get("type") not in ("user", "assistant"):
                    continue
                content = (d.get("message") or {}).get("content")
                if isinstance(content, str):
                    text = content
                elif isinstance(content, list):
                    text = "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
                else:
                    continue
                text = REMINDER.sub("", text).strip()
                if not text:
                    continue
                # A report run opens with the run prompt; later mentions of the marker
                # (a summary, a file read) don't make an ordinary session a report run.
                if d["type"] == "user" and not seen_user:
                    seen_user = True
                    if RUN_MARKER in text or text.startswith(RUN_PROMPT):
                        is_report_run = True
                        break
                ts = d.get("timestamp") or ""
                try:
                    when = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except ValueError:
                    continue
                if when < day_start_utc:
                    continue
                if d["type"] == "user":
                    if text.startswith(NOISE_PREFIXES):
                        continue
                    current = {"time": when.astimezone(CAIRO).strftime("%H:%M"), "mido": clip(text, 1200), "claude": ""}
                    file_turns.append(current)
                elif current is not None:
                    current["claude"] = clip(text, 1800)
        if not is_report_run:
            turns += file_turns
    turns.sort(key=lambda t: t["time"])
    # Keep the digest small enough for one read; the most recent turns matter most.
    while len(json.dumps(turns, ensure_ascii=False)) > 70000 and len(turns) > 5:
        turns.pop(0)
    return turns


def git_today(date_str):
    out = {}
    for repo in REPOS:
        if not (repo / ".git").exists():
            continue
        res = subprocess.run(
            ["git", "-C", str(repo), "log", f"--since={date_str} 00:00", "--pretty=%h %s"],
            capture_output=True, text=True, encoding="utf-8",
        )
        out[repo.name] = [l for l in res.stdout.splitlines() if l]
    return out


def files_today(day_start_local):
    cutoff = day_start_local.timestamp()
    hits = []
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        rel_base = Path(base).relative_to(ROOT)
        if rel_base.parts[:2] == ("reports", "daily"):
            continue
        for f in files:
            p = Path(base) / f
            try:
                if p.stat().st_mtime >= cutoff:
                    hits.append(str(rel_base / f).replace("\\", "/"))
            except OSError:
                pass
    return sorted(hits)[:80]


def main():
    now = datetime.now(CAIRO)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    date_str = args[0] if args else now.strftime("%Y-%m-%d")
    day_start = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=CAIRO)
    day_start_utc = day_start.astimezone(timezone.utc)
    env = load_env()

    out_dir = ROOT / "reports" / "daily" / date_str
    out_dir.mkdir(parents=True, exist_ok=True)
    yesterday = (day_start - timedelta(days=1)).strftime("%Y-%m-%d")
    prev_report = ROOT / "reports" / "daily" / yesterday / "report.json"
    if not prev_report.exists() and (saved := storage_get(env, f"{yesterday}/report.json")):
        prev_report.parent.mkdir(parents=True, exist_ok=True)
        prev_report.write_bytes(saved)
    worklog = ROOT / "reports" / "daily" / "worklog" / f"{date_str}.md"

    # The day's chats, commits and files only exist on Mido's machine. At 16:50 it
    # uploads them (--digest); the 17:00 cloud run picks them up if the PC was on.
    if LOCAL:
        work = {
            "session_turns": sessions(day_start_utc),
            "git_commits_today": git_today(date_str),
            "files_touched_today": files_today(day_start),
            "worklog": worklog.read_text(encoding="utf-8") if worklog.exists() else "",
        }
        if "--digest" in sys.argv:
            storage_put(env, f"{date_str}/local.json", json.dumps(work, ensure_ascii=False).encode())
            print("digest uploaded:", len(work["session_turns"]), "turns")
            return
        work_source = "Mido's machine"
    elif saved := storage_get(env, f"{date_str}/local.json"):
        work, work_source = json.loads(saved), "Mido's machine, uploaded at 16:50"
    else:
        work = {"session_turns": [], "git_commits_today": git_today(date_str), "files_touched_today": [], "worklog": ""}
        work_source = "missing: Mido's PC was off, so only this repo's commits are known"

    # website_inquiries gets one row per WhatsApp tap on the site (lib/inquiry.ts in
    # heliomax-web). It is our own table, so the cookie banner does not hide any of them.
    # Page views and the calculator come from the Meta pixel, pulled by the agent over
    # these two windows.
    since = day_start_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    week_start = day_start - timedelta(days=6)
    site = {
        "pixel_dataset_id": "2302611100579846",
        "today_start_epoch": int(day_start.timestamp()),
        "week_start_epoch": int(week_start.timestamp()),
    }
    try:
        site["wa_taps_today"] = len(rest(env, "website_inquiries", {"select": "id", "country": "eq.EG", "created_at": f"gte.{since}"}))
        site["wa_taps_7d"] = len(rest(env, "website_inquiries", {
            "select": "id", "country": "eq.EG", "created_at": f"gte.{week_start.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}"}))
    except requests.RequestException as err:
        site["wa_taps_error"] = str(err)[:200]

    context = {
        "date": date_str,
        "site": site,
        "generated_at_cairo": now.strftime("%Y-%m-%d %H:%M"),
        "yesterday": yesterday,
        "work_log_source": work_source,
        "crm": crm(env, day_start_utc, date_str),
        **work,
    }
    (out_dir / "context.json").write_text(json.dumps(context, ensure_ascii=False, indent=1), encoding="utf-8")
    print(out_dir / "context.json")


if __name__ == "__main__":
    main()
