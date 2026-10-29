"""Render reports/daily/<date>/report.json into the branded PDF and deliver it.

Usage: python tools/daily_report/build.py [YYYY-MM-DD] [--no-send]

Delivery picks the first channel that is configured (.env.local, or the cloud task's environment):
  1. REPORT_SMTP_USER + REPORT_SMTP_PASS  -> email with the PDF attached
  2. otherwise                            -> PDF uploaded to a private Supabase
     bucket; delivery.json carries a signed link and email.html carries the
     message body, and the agent sends that through the Gmail connector.
"""
import base64
import html
import json
import smtplib
import sys
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from playwright.sync_api import sync_playwright

from collect import BUCKET, ROOT, auth, load_env, storage_put

HERE = Path(__file__).resolve().parent
RECIPIENT = "smido1949@gmail.com"
LINK_TTL = 60 * 60 * 24 * 30
MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
DAYS = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]
STAGES = {"NEW": "جديد", "WELCOME_SENT": "اتبعتله ترحيب", "NO_RESPONSE": "مابيردش", "QUOTED": "عرض سعر",
          "NEGOTIATION": "مناقشة", "POSTPONED": "مؤجل", "WON": "تم البيع", "LOST": "خسارة"}
TAGS = {"done": "done", "wip": "wip", "wait": "wait"}

e = html.escape


def b(text):
    """Escape, then honour **bold** so the agent can stress a phrase."""
    out, bold = "", False
    for i, part in enumerate(e(str(text or "")).split("**")):
        out += ("<b>" if i % 2 else "") + part + ("</b>" if i % 2 else "")
    return out


def tag(status, label=None):
    labels = {"done": "تم", "wip": "جاري", "wait": "مستني"}
    cls = TAGS.get(status, "wip")
    return f'<span class="tag {cls}">{e(label or labels[cls])}</span>'


def ul(items):
    return "<ul>" + "".join(f"<li>{b(i)}</li>" for i in items) + "</ul>" if items else ""


def num(v):
    if v is None or v == "":
        return "—"
    if isinstance(v, (int, float)):
        return f"{v:,.2f}".rstrip("0").rstrip(".") if isinstance(v, float) and v % 1 else f"{int(v):,}"
    return e(str(v))


def data_uri(name):
    return "data:image/png;base64," + base64.b64encode((HERE / "assets" / name).read_bytes()).decode()


def section(k, title, lead, body):
    lead_html = f'<p class="lead">{b(lead)}</p>' if lead else ""
    return f'<section class="sec"><div class="sechead"><h2><span class="k">{k}</span>{e(title)}</h2>{lead_html}</div>{body}</section>'


def render(rep, ctx):
    d = datetime.strptime(rep["date"], "%Y-%m-%d")
    date_ar = f"{DAYS[d.weekday()]} {d.day} {MONTHS[d.month - 1]} {d.year}"
    crm = ctx["crm"]

    kpis = "".join(
        f'<div class="kpi{" warn" if k.get("warn") else ""}"><div class="v">{num(k.get("v"))}</div><div class="l">{b(k.get("l"))}</div></div>'
        for k in rep.get("kpis", [])[:8]
    )
    s1 = section("01", "الملخص التنفيذي", rep.get("headline"),
                 f'<div class="kpis">{kpis}</div><h3>أهم النقاط</h3>{ul(rep.get("summary", []))}')

    work = ""
    for w in rep.get("work_done", []):
        work += (f'<div class="box"><h4>{e(w.get("title", ""))} {tag(w.get("status"), w.get("status_label"))}</h4>'
                 f'{"<p>" + b(w["body"]) + "</p>" if w.get("body") else ""}{ul(w.get("bullets", []))}</div>')
    s2 = section("02", "شغل النهاردة بالتفصيل", rep.get("work_lead"), work or "<p>مافيش شغل متسجل النهاردة.</p>")

    stand = ""
    for w in rep.get("where_we_stand", []):
        stand += f'<tr><td><b>{e(w.get("area", ""))}</b></td><td>{b(w.get("status", ""))}</td></tr>'
    s3 = section("03", "واقفين فين", rep.get("stand_lead"),
                 f'<table><tr><th style="width:24%">المحور</th><th>الوضع دلوقتي</th></tr>{stand}</table>')

    chg = ""
    for i, c in enumerate(rep.get("changing", []), 1):
        chg += (f'<tr><td class="num">{i}</td><td><b>{e(c.get("item", ""))}</b></td><td>{b(c.get("what", ""))}</td>'
                f'<td>{tag(c.get("status"), c.get("status_label"))}</td></tr>')
    s4 = section("04", "بنعدّل إيه وبنجدّد إيه", rep.get("changing_lead"),
                 f'<table><tr><th style="width:5%">#</th><th style="width:26%">البند</th><th>التعديل أو التجديد</th>'
                 f'<th style="width:17%">الحالة</th></tr>{chg}</table>' if chg else "<p>مافيش تعديلات مفتوحة النهاردة.</p>")

    ads = rep.get("ads", {})
    rows = ""
    for r in ads.get("rows", []):
        rows += (f'<tr><td><b>{e(r.get("name", ""))}</b><div class="small">{e(r.get("level", ""))}</div></td>'
                 f'<td class="num">{num(r.get("spend_today"))}</td><td class="num">{num(r.get("results_today"))}</td>'
                 f'<td class="num">{num(r.get("cost_today"))}</td><td class="num">{num(r.get("spend_7d"))}</td>'
                 f'<td class="num">{num(r.get("results_7d"))}</td><td class="num">{num(r.get("cost_7d"))}</td>'
                 f'<td class="num">{num(r.get("frequency_7d"))}</td><td>{e(r.get("state", ""))}</td></tr>')
    ads_table = (f'<table class="tight"><tr><th>الحملة / المجموعة</th><th>صرف النهاردة</th><th>نتائج النهاردة</th><th>تكلفة النتيجة</th>'
                 f'<th>صرف 7 أيام</th><th>نتائج 7 أيام</th><th>تكلفة 7 أيام</th><th>التكرار</th><th>الحالة</th></tr>{rows}</table>'
                 if rows else '<div class="box amber"><p>أرقام Meta ماتسحبتش النهاردة.</p></div>')
    ads_notes = f'<div class="box blue"><h4>قراءة الأرقام</h4>{ul(ads.get("notes", []))}</div>' if ads.get("notes") else ""
    s5 = section("05", "الإعلانات على Meta", ads.get("lead") or "الحساب الإعلاني لـ HelioMax مصر. الأرقام بالجنيه، وأرقام النهاردة لحد وقت إصدار التقرير.",
                 ads_table + ads_notes)

    site = rep.get("site", {})
    srows = "".join(f'<tr><td><b>{e(r.get("label", ""))}</b></td><td class="num">{num(r.get("today"))}</td>'
                    f'<td class="num">{num(r.get("last_7d"))}</td></tr>' for r in site.get("rows", []))
    site_table = (f'<table><tr><th>الرقم</th><th style="width:18%">النهاردة</th><th style="width:18%">آخر 7 أيام</th></tr>{srows}</table>'
                  if srows else '<div class="box amber"><p>أرقام الموقع ماتسحبتش النهاردة.</p></div>')
    site_notes = f'<div class="box blue"><h4>قراءة الأرقام</h4>{ul(site.get("notes", []))}</div>' if site.get("notes") else ""
    s_site = section("06", "الموقع heliomax.co", site.get("lead") or "زوار الموقع ومين منهم كلّمنا على واتساب، من بيكسل Meta اللي على صفحات مصر.",
                     site_table + site_notes)

    sc = crm["stage_counts"]
    stage_cells = "".join(f'<div class="kpi"><div class="v">{num(sc.get(s, 0))}</div><div class="l">{STAGES[s]}</div></div>'
                          for s in ["NEW", "NEGOTIATION", "POSTPONED", "WON"] if True)
    act = crm["activities_today"]
    day_rows = [
        ("عملاء جدد اتسجلوا", len(crm["new_today"]),
         "، ".join(f"{k}: {v}" for k, v in crm["new_today_by_source"].items())),
        ("حركات على السيستم", act["total"], "، ".join(f"{k}: {v}" for k, v in act["by_user"].items())),
        ("عملاء اتعدلت بياناتهم", len(crm["updated_today"]), ""),
        ("مكالمات اتسجلت", crm["calls_today"]["total"], "، ".join(f"{k}: {v}" for k, v in crm["calls_today"]["by_outcome"].items())),
        ("مهام جديدة / مهام خلصت", f'{crm["tasks_created_today"]} / {len(crm["tasks_completed_today"])}', ""),
        ("زيارات ميدانية", crm["field_visits_today"], ""),
    ]
    day_table = "<table><tr><th style='width:34%'>حركة النهاردة</th><th style='width:14%'>العدد</th><th>تفاصيل</th></tr>" + "".join(
        f'<tr><td><b>{e(a)}</b></td><td class="num">{num(v)}</td><td>{e(x)}</td></tr>' for a, v, x in day_rows) + "</table>"
    moves = ""
    if crm["stage_moves"]:
        moves = "<h3>عملاء اتنقلوا من مرحلة لمرحلة</h3><table><tr><th>العميل</th><th>من</th><th>إلى</th></tr>" + "".join(
            f'<tr><td><b>{e(m["name"] or "")}</b></td><td>{STAGES.get(m["from"], m["from"])}</td><td>{STAGES.get(m["to"], m["to"])}</td></tr>'
            for m in crm["stage_moves"]) + "</table>"
    new_rows = ""
    if crm["new_today"]:
        new_rows = "<h3>العملاء الجدد النهاردة</h3><table><tr><th>العميل</th><th>المصدر</th><th>النوع</th><th>المشروع</th></tr>" + "".join(
            f'<tr><td><b>{e(l["name"] or "")}</b></td><td>{e(l["source"] or "—")}</td><td>{e(l["client_type"] or "—")}</td><td>{e(l["project"] or l["notes"] or "—")}</td></tr>'
            for l in crm["new_today"][:15]) + "</table>"
    pipe = "<h3>الصفقات المفتوحة والمكسوبة</h3><table><tr><th>العميل</th><th style='width:14%'>المرحلة</th><th style='width:16%'>القيمة المسجلة</th><th>ملاحظات</th></tr>" + "".join(
        f'<tr><td><b>{e(l["name"] or "")}</b><div class="small">{e(l["source"] or "")}</div></td><td>{STAGES.get(l["stage"], l["stage"])}</td>'
        f'<td class="num">{num(l["deal_value"])}</td><td>{e(l["notes"] or l["project"] or "—")}</td></tr>'
        for l in crm["open_pipeline"]) + "</table><p class='small'>القيم زي ما هي متسجلة على السيستم، وفيها جنيه ودولار، فماينفعش تتجمع على بعض.</p>"
    crm_notes = f'<div class="box blue"><h4>قراءة الأرقام</h4>{ul(rep.get("crm_notes", []))}</div>' if rep.get("crm_notes") else ""
    s6 = section("07", "حركة الـ CRM", "عملاء مصر على السيستم، من أول اليوم لحد وقت إصدار التقرير.",
                 f'<div class="kpis">{stage_cells}</div>{day_table}{moves}{new_rows}{pipe}{crm_notes}')

    dec = "".join(f'<div class="box amber"><h4>{i}. {e(x.get("title", ""))}</h4><p>{b(x.get("body", ""))}</p></div>'
                  for i, x in enumerate(rep.get("decisions", []), 1))
    s7 = section("08", "نقاط تحتاج قرار أو متابعة", None, dec or "<p>مافيش نقاط مفتوحة النهاردة.</p>")

    nxt = "".join(f'<tr><td class="num">{i}</td><td>{b(n.get("item", ""))}</td><td>{tag(n.get("status"), n.get("status_label"))}</td></tr>'
                  for i, n in enumerate(rep.get("next", []), 1))
    goal = f'<div class="box blue"><h4>هدف بكرة</h4><p>{b(rep["tomorrow_goal"])}</p></div>' if rep.get("tomorrow_goal") else ""
    s8 = section("09", "فاضل إيه والخطوات الجاية", "بالترتيب حسب الأولوية.",
                 f'<table><tr><th style="width:5%">#</th><th>البند</th><th style="width:19%">الحالة</th></tr>{nxt}</table>{goal}')

    toc = ["الملخص التنفيذي", "شغل النهاردة بالتفصيل", "واقفين فين", "بنعدّل إيه وبنجدّد إيه", "الإعلانات على Meta",
           "الموقع heliomax.co", "حركة الـ CRM", "نقاط تحتاج قرار أو متابعة", "فاضل إيه والخطوات الجاية"]
    toc_html = "".join(f'<div><span class="n num">{i:02d}</span>{t}</div>' for i, t in enumerate(toc, 1))

    return (HERE / "template.html").read_text(encoding="utf-8").format_map({
        "logo": data_uri("heliomax-logo.png"), "logo_dark": data_uri("heliomax-logo-dark.png"),
        "date_ar": date_ar, "toc": toc_html, "generated": ctx["generated_at_cairo"].split(" ")[1],
        "sections": s1 + s2 + s3 + s4 + s5 + s_site + s6 + s7 + s8,
    })


def email_html(rep, date_ar, link):
    points = "".join(f"<li style='margin-bottom:6px'>{b(x)}</li>" for x in rep.get("summary", []))
    button = (f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr>'
              f'<td bgcolor="#E3F3FB" style="background:#E3F3FB;border:2px solid #14284D;border-radius:8px;padding:12px 22px">'
              f'<a href="{e(link)}" style="color:#14284D;font-weight:bold;font-size:16px;text-decoration:underline">'
              f'افتح التقرير الكامل PDF</a></td></tr></table>'
              f'<p style="color:#5B6678;font-size:12px">اللينك خاص وشغال لمدة 30 يوم.</p>') if link else \
        '<p style="color:#5B6678">التقرير الكامل مرفق PDF.</p>'
    return (f'<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#1B2433;line-height:1.8;max-width:640px">'
            f'<h2 style="color:#14284D;border-bottom:2px solid #2BA8E0;padding-bottom:8px">تقرير الشغل اليومي — {e(date_ar)}</h2>'
            f'<p>{b(rep.get("headline", ""))}</p><ul>{points}</ul>{button}</div>')


def deliver(env, pdf, rep, date_ar, out_dir):
    subject = f"HelioMax — تقرير الشغل اليومي {rep['date']}"
    if env.get("REPORT_SMTP_USER") and env.get("REPORT_SMTP_PASS"):
        msg = EmailMessage()
        msg["Subject"], msg["From"], msg["To"] = subject, env["REPORT_SMTP_USER"], RECIPIENT
        msg.set_content(rep.get("headline", ""))
        msg.add_alternative(email_html(rep, date_ar, None), subtype="html")
        msg.add_attachment(pdf.read_bytes(), maintype="application", subtype="pdf", filename=pdf.name)
        with smtplib.SMTP_SSL(env.get("REPORT_SMTP_HOST", "smtp.gmail.com"), 465, timeout=60) as s:
            s.login(env["REPORT_SMTP_USER"], env["REPORT_SMTP_PASS"])
            s.send_message(msg)
        return {"mode": "sent", "to": RECIPIENT, "subject": subject}

    base = env["NEXT_PUBLIC_SUPABASE_URL"] + "/storage/v1"
    obj = f"{rep['date']}/HelioMax-daily-report-{rep['date']}.pdf"
    storage_put(env, obj, pdf.read_bytes(), "application/pdf")
    r = requests.post(f"{base}/object/sign/{BUCKET}/{obj}", headers=auth(env), json={"expiresIn": LINK_TTL}, timeout=60)
    r.raise_for_status()
    link = base + r.json()["signedURL"]
    (out_dir / "email.html").write_text(email_html(rep, date_ar, link), encoding="utf-8")
    return {"mode": "link", "to": RECIPIENT, "subject": subject, "url": link, "body_file": str(out_dir / "email.html")}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    date_str = args[0] if args else datetime.now(ZoneInfo("Africa/Cairo")).strftime("%Y-%m-%d")
    out_dir = ROOT / "reports" / "daily" / date_str
    rep = json.loads((out_dir / "report.json").read_text(encoding="utf-8"))
    ctx = json.loads((out_dir / "context.json").read_text(encoding="utf-8"))
    rep["date"] = date_str

    page_html = render(rep, ctx)
    (out_dir / "report.html").write_text(page_html, encoding="utf-8")
    pdf = out_dir / f"HelioMax-تقرير-يومي-{date_str}.pdf"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto((out_dir / "report.html").as_uri(), wait_until="networkidle")
        page.evaluate("document.fonts.ready")
        page.pdf(path=str(pdf), prefer_css_page_size=True, print_background=True)
        browser.close()
    print("PDF:", pdf)

    if "--no-send" in sys.argv:
        return
    d = datetime.strptime(date_str, "%Y-%m-%d")
    date_ar = f"{DAYS[d.weekday()]} {d.day} {MONTHS[d.month - 1]} {d.year}"
    env = load_env()
    # Tomorrow's run carries open items over from this file, wherever it runs.
    storage_put(env, f"{date_str}/report.json", (out_dir / "report.json").read_bytes())
    result = deliver(env, pdf, rep, date_ar, out_dir)
    (out_dir / "delivery.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print("DELIVERY:", json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
