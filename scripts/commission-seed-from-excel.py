"""One-off: convert 'S.E.ENGINEERING GST SHEET-2.xlsx' (COMISSION RECORD) into commission-seed.json.

Usage:  python scripts/commission-seed-from-excel.py "<path to xlsx>"
The output is committed so the app can auto-import the history on first run.
"""
import json
import os
import re
import sys
import uuid
from datetime import datetime

import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else r"c:\Users\Dell\Desktop\S.E.ENGINEERING GST SHEET-2.xlsx"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "commission-seed.json")

def clean(v):
    return str(v).strip() if v is not None else ""


def norm(name):
    key = re.sub(r"\s+", " ", clean(name)).lower()
    return key.replace(".", "").replace(",", "").strip()


SELLER_ALIASES = {norm(k): v for k, v in {
    "chagani": "Chagani",
    "chaghani": "Chagani",
    "al qaryan": "AL QARYAN",
    "alqaryan": "AL QARYAN",
    "saqi industry": "Saqi Industry",
    "saqi ind": "Saqi Industry",
    "alba": "ALBA",
}.items()}
BUYER_ALIASES = {norm(k): v for k, v in {
    "s.e engineering": "S.E. ENGINEERING (PRIVATE) LIMITED",
    "s.e engineering (private) limited": "S.E. ENGINEERING (PRIVATE) LIMITED",
    "s.e. engineering (private) limited": "S.E. ENGINEERING (PRIVATE) LIMITED",
    "se engineering (pvt) ltd": "S.E. ENGINEERING (PRIVATE) LIMITED",
}.items()}
ITEM_ALIASES = {norm(k): v for k, v in {
    "abs dana": "ABS DANA",
    "pp dana": "PP DANA",
    "pp plastic dana": "PP DANA",
    "pvc dana": "PVC DANA",
    "poly bag": "POLY BAG",
    "poly bags": "POLY BAG",
}.items()}


def item_name(raw):
    """'PP DANA             3902:-Pol       5000' -> 'PP DANA'"""
    name = re.sub(r"\s+", " ", clean(raw)).strip()
    name = re.sub(r"\s+\d{4}\b.*$", "", name)      # drop a HS code typed inside the description
    key = norm(name)
    return ITEM_ALIASES.get(key, name.upper())


def money(v):
    try:
        return round(float(v or 0), 2)
    except Exception:
        return 0.0


def iso(v):
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, (int, float)) and 20000 < float(v) < 60000:
        # Excel serial date (days since 1899-12-30)
        from datetime import timedelta
        return (datetime(1899, 12, 30) + timedelta(days=float(v))).strftime("%Y-%m-%d")
    s = clean(v)
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return m.group(0)
    # The later rows store dates as text: 12.06.2026 / 12/06/2026 / 12-06-2026
    m = re.match(r"^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        elif y < 1900:
            y = 2000 + (y % 100)          # 0225 -> 2025 (typo in the sheet)
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{y:04d}-{mo:02d}-{d:02d}"
    return ""


def party(name, aliases):
    cleaned = re.sub(r"\s+", " ", clean(name))
    return aliases.get(norm(cleaned), cleaned)


def hs_parts(v):
    """'3901:-Pol       7000' -> ('3901', 'Pol'); 3902 -> ('3902', '')"""
    raw = clean(v)
    if not raw:
        return "", ""
    code = re.match(r"^([0-9]{4}(?:\.[0-9]+)?)", raw)
    grade = re.search(r":-?\s*([A-Za-z]+)", raw)
    return (code.group(1) if code else raw[:12]), (grade.group(1) if grade else "")


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws = wb["COMISSION RECORD"]

    invoices, payments = [], []
    last_seller = ""
    last_date = ""
    sellers, buyers, items, rates = set(), set(), {}, set()

    for r in range(6, ws.max_row + 1):
        seller_raw = clean(ws.cell(r, 1).value)
        buyer_raw = clean(ws.cell(r, 3).value)
        inv_no = clean(ws.cell(r, 6).value)
        date = iso(ws.cell(r, 7).value) or last_date
        desc = clean(ws.cell(r, 8).value)
        qty = money(ws.cell(r, 10).value)
        rate = money(ws.cell(r, 11).value)
        amount = money(ws.cell(r, 12).value)
        gst_pct = money(ws.cell(r, 13).value)
        gst_val = money(ws.cell(r, 14).value)
        comm_pct = money(ws.cell(r, 15).value)
        comm_val = money(ws.cell(r, 16).value)
        paid = money(ws.cell(r, 17).value)
        if iso(ws.cell(r, 7).value):
            last_date = iso(ws.cell(r, 7).value)

        # Some rows carry a date or junk in column A - only treat it as a seller when it looks like a name.
        seller_ok = seller_raw and not re.match(r"^\d{4}-\d{2}-\d{2}", seller_raw)
        if seller_ok:
            last_seller = party(seller_raw.split("  ")[0], SELLER_ALIASES)
        seller = party(seller_raw.split("  ")[0], SELLER_ALIASES) if seller_ok else last_seller

        # ---- invoice row
        if desc and amount and comm_val:
            buyer = party(buyer_raw, BUYER_ALIASES) or "S.E. ENGINEERING (PRIVATE) LIMITED"
            sellers.add(seller)
            buyers.add(buyer)
            item = item_name(desc)
            items.setdefault(item, hs_parts(ws.cell(r, 9).value)[0])
            rates.add(comm_pct)
            code, grade = hs_parts(ws.cell(r, 9).value)
            invoices.append({
                "id": "inv-" + uuid.uuid5(uuid.NAMESPACE_URL, f"se-gst-{r}-{inv_no}-{date}").hex[:24],
                "date": date,
                "seller": seller,
                "buyer": buyer,
                "invNo": inv_no,
                "item": item,
                "hsCode": code,
                "grade": grade,
                "qty": qty,
                "rate": rate,
                "amount": amount,
                "gstPct": round(gst_pct * 100, 4) if gst_pct < 1 else gst_pct,
                "gstValue": gst_val,
                "commPct": round(comm_pct * 100, 4) if comm_pct < 1 else comm_pct,
                "commValue": comm_val,
                "notes": "",
                "source": "excel-row-" + str(r),
            })
            continue

        # ---- payment / deduction row (Q column)
        if paid:
            label = buyer_raw or desc or "Payment Received"
            kind = "payment"
            narration = label
            if "INDUSTRY" in label.upper():
                kind = "expense"
                narration = "Deduct Industry Payment"
            elif label.upper() == "JV" or "JV" in label.upper():
                narration = "Payment Received-JV"
            payments.append({
                "id": "pay-" + uuid.uuid5(uuid.NAMESPACE_URL, f"se-gst-pay-{r}-{date}").hex[:24],
                "date": date,
                "party": seller,
                "amount": paid,
                "kind": kind,
                "mode": "Bank",
                "narration": narration,
                "source": "excel-row-" + str(r),
            })

    # Voucher numbers, in date order (RV = receipt, PV = payment)
    rc = pv = 0
    for p in sorted(payments, key=lambda x: (x["date"], x["source"])):
        if p["kind"] == "expense":
            pv += 1
            p["no"] = f"PV-{pv:04d}"
        else:
            rc += 1
            p["no"] = f"RV-{rc:04d}"

    data = {
        "generatedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "sourceFile": os.path.basename(SRC),
        "sellers": sorted(sellers),
        "buyers": sorted(buyers),
        "items": [{"name": k, "hsCode": v} for k, v in sorted(items.items())],
        "commissionRates": sorted(rates),
        "invoices": invoices,
        "payments": payments,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=1, ensure_ascii=False)

    total_comm = round(sum(i["commValue"] for i in invoices), 2)
    total_paid = round(sum(p["amount"] for p in payments if p["kind"] == "payment"), 2)
    total_exp = round(sum(p["amount"] for p in payments if p["kind"] == "expense"), 2)
    print(f"invoices={len(invoices)} payments={len(payments)}")
    print(f"commission earned={total_comm}  received={total_paid}  expenses={total_exp}  balance={round(total_comm - total_paid - total_exp, 2)}")
    print("sellers:", data["sellers"])
    print("rates:", data["commissionRates"])
    print("written ->", OUT)


if __name__ == "__main__":
    main()
