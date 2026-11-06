#!/usr/bin/env python3
"""
Commission Accounts — Excel workbook → seed JSON converter.

The old Excel sheets stay the source of truth for everything that happened before
the app existed. This turns one dealer's workbook into the JSON that
`commissionApi.mjs` imports at boot (as sales vouchers + dealer receipts).

Layout it understands (the sheet every dealer sends us looks like this):

    row 3         delaer :  <dealer name>
    row 6         SELLER | BUYER | INV No | INV DATE | DESCRIPTION | HS CODE | Qty | RATE |
                  VALUE | ST.RATE | ST AMOUNT | TOTAL AMOUNT | comission rate | DR. | Cr. |
                  comission receivable | TOTAL AMOUNT
    row 7 +       one deal per row; a row with only a Cr. amount is a receipt from the dealer.

Columns are found by their header text, so a shifted or re-ordered sheet still imports.

Usage:
    python scripts/commission-xlsx-to-seed.py "C:/path/book.xlsx" scripts/commission-<dealer>-seed.json
    python scripts/commission-xlsx-to-seed.py book.xlsx out.json --dealer "SOME DEALER"
"""
import datetime
import json
import re
import sys

try:
    import openpyxl
except ImportError:  # pragma: no cover
    sys.exit("openpyxl is required:  pip install openpyxl")

HEADER_HINTS = ("seller", "buyer", "inv no", "inv date", "description", "qty", "rate", "cr.")

# The sheets are typed by hand, so the same buyer shows up with the M/S prefix, without
# punctuation, in lower case, or split over several lines. Normalising keeps one ledger
# per party instead of one per spelling. Key = whitespace-collapsed lowercase.
ALIASES = {
    "ar packages": "M/S AR PACKAGES",
    "a.r packages": "M/S AR PACKAGES",
    "m/s ar packages": "M/S AR PACKAGES",
    "a.r packges": "M/S AR PACKAGES",
    "m/s ar packges": "M/S AR PACKAGES",
    "elite packages": "ELITE PACKAGES",
    "global packaging": "GLOBAL PACKAGING & PRINTING",
    "global packaging & printing": "GLOBAL PACKAGING & PRINTING",
    "industrust pvt ltd": "INDUSTRUST PVT LTD",
    "industrust (private) limited": "INDUSTRUST PVT LTD",
    "indus trust pvt ltd": "INDUSTRUST PVT LTD",
    "m/s khursheed traders": "M/S KHURSHEED TRADERS",
    "m/s s.m. packages.": "M/S S.M. PACKAGES",
    "m/s s.m. packages": "M/S S.M. PACKAGES",
    "musab packages": "MUSAB PACKAGES",
    "musab packges": "MUSAB PACKAGES",
    "master papers": "MASTER PAPERS",
    "master paper": "MASTER PAPERS",
    "s.m. enterprises": "S.M. ENTERPRISES",
    "s.m. enterprise": "S.M. ENTERPRISES",
    "s.m enterprises": "S.M. ENTERPRISES",
    "s.m enterprise": "S.M. ENTERPRISES",
    "sm enterprises": "S.M. ENTERPRISES",
    "sm enterprise": "S.M. ENTERPRISES",
    "hifzaws engineering": "HIFZAWS ENGINEERING",
    "al karim packages": "AL KARIM PACKAGES",
    "c.n.c packages": "C.N.C PACKAGES",
    "shah enterprises": "SHAH ENTERPRISES",
    "premier enterprises": "PREMIER ENTERPRISES",
    "fine carton": "FINE CARTON",
}
# Sellers keep the spelling already used in the app so the Seller Register stays in one piece.
SELLER_NAMES = {"chagani": "Chagani", "saqi industry": "Saqi Industry"}

# Hand-checked typos: the row is clearly dated wrong for where it sits in the sheet, and
# the running-balance column confirms the position. Corrected here instead of silently.
DATE_FIXES = {
    "zv-rcpt-90": ("2023-12-09", "sheet said 2022-12-09 among October 2023 rows"),
    "zv-rcpt-91": ("2023-10-11", "sheet said 2022-10-11 among October 2023 rows"),
    "zv-rcpt-375": ("2025-06-17", "sheet said 2026-06-17 among June 2025 rows"),
}

DATE_HINTS = ("%d.%m.%Y", "%d.%m.%y", "%Y-%m-%d", "%d/%m/%Y")


def clean(v):
    return re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""


def num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", "").replace("%", "").strip())
    except ValueError:
        return None


def party(raw, aliases=True):
    name = clean(raw)
    if not name:
        return ""
    key = name.lower()
    if aliases and key in ALIASES:
        return ALIASES[key]
    return name.upper()


def seller_name(raw):
    name = clean(raw)
    return SELLER_NAMES.get(name.lower(), name.upper()) if name else ""


def parse_date(v, warnings, row, fallback=None):
    """Day-first dates (03.01.2023) are the house style; a 4-digit leading part is Y-M-D.

    Hand-typed years come out mangled now and then (``02.09.20204``, ``25.02.206``), so an
    unusable year is repaired by dropping the offending digit and keeping the candidate
    closest to the row above — the sheets are written in date order.
    """
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()
    if isinstance(v, datetime.date):
        return v.isoformat()
    text = re.sub(r"\s+", "", clean(v))
    if not text:
        return None
    text = re.sub(r"\.+", ".", re.sub(r"[-/]", ".", text))
    parts = text.split(".")
    if len(parts) != 3:
        warnings.append("row %s: unreadable date %r" % (row, text))
        return fallback
    if len(parts[0]) == 4:  # typed as year-month-day
        y, m, d = parts
    else:
        d, m, y = parts
    d, m = d.zfill(2), m.zfill(2)

    years = []
    if len(y) == 2:
        years.append("20" + y)
    elif len(y) == 4:
        years.append(y)
    for i in range(len(y)):
        cand = y[:i] + y[i + 1:]
        years.append(("20" + cand) if len(cand) == 2 else cand)

    options = []
    for cand in years:
        if len(cand) != 4 or not cand.isdigit() or cand in [o[0] for o in options]:
            continue
        try:
            options.append((cand, datetime.date(int(cand), int(m), int(d))))
        except ValueError:
            continue
    options = [o for o in options if 2000 <= int(o[0]) <= 2100]
    if not options:
        warnings.append("row %s: unusable date %r -> used %s" % (row, text, fallback))
        return fallback
    if len(options) > 1:
        if fallback:
            anchor = datetime.date.fromisoformat(fallback)
            options.sort(key=lambda o: abs((o[1] - anchor).days))
        warnings.append("row %s: repaired date %r -> %s" % (row, text, options[0][1].isoformat()))
    return options[0][1].isoformat()


def hs_code(raw):
    digits = re.sub(r"\D", "", clean(raw))
    return digits[:4] if len(digits) >= 4 else digits


def find_header(ws):
    for r in range(1, min(ws.max_row, 40) + 1):
        cells = [clean(ws.cell(r, c).value).lower() for c in range(1, ws.max_column + 1)]
        hits = sum(1 for h in HEADER_HINTS if any(h == x or x.startswith(h) for x in cells))
        if hits >= 4:
            cols = {}
            for i, text in enumerate(cells, start=1):
                if text:
                    cols.setdefault(text, i)
            return r, cols
    return None, {}


def col(cols, *names):
    for n in names:
        for key, idx in cols.items():
            if key == n or key.startswith(n):
                return idx
    return None


def find_dealer(ws, header_row):
    for r in range(1, max(header_row - 1, 1) + 1):
        for c in range(1, min(ws.max_column, 4) + 1):
            text = clean(ws.cell(r, c).value).lower()
            if text.startswith("delaer") or text.startswith("dealer"):
                nxt = clean(ws.cell(r, c + 1).value) or clean(ws.cell(r, c).value).split(":", 1)[-1]
                return clean(nxt)
    return ""


def convert(path, dealer_override=""):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    header_row, cols = find_header(ws)
    if not header_row:
        raise SystemExit("could not find the SELLER/BUYER/... header row")

    c_seller = col(cols, "seller")
    c_buyer = col(cols, "buyer")
    c_inv = col(cols, "inv no")
    c_date = col(cols, "inv date")
    c_desc = col(cols, "description")
    c_hs = col(cols, "hs code")
    c_qty = col(cols, "qty")
    c_rate = col(cols, "rate")
    c_amt = col(cols, "value st", "value", " value")
    c_strate = col(cols, "st.rate", "st rate")
    c_stamt = col(cols, "st amount")
    c_total = col(cols, "total amount")
    c_crate = col(cols, "comission rate", "commission rate")
    c_dr = col(cols, "dr.")
    c_cr = col(cols, "cr.")

    dealer = dealer_override.strip() or find_dealer(ws, header_row)

    sales, receipts, warnings = [], [], []
    last_date = None
    sellers, buyers, items = {}, {}, {}
    for r in range(header_row + 1, ws.max_row + 1):
        g = lambda c: ws.cell(r, c).value if c else None
        raw_date = g(c_date)
        date = parse_date(raw_date, warnings, r, fallback=last_date)
        if date and not clean(raw_date):
            # a blank date cell belongs to the block of deals above it
            warnings.append("row %s: blank date, used %s from the row above" % (r, date))
        if date:
            last_date = date

        qty, rate = num(g(c_qty)), num(g(c_rate))
        amount = num(g(c_amt))
        cr = num(g(c_cr)) or 0
        dr = num(g(c_dr)) or 0

        if amount and qty is not None:
            seller = seller_name(g(c_seller))
            buyer = party(g(c_buyer))
            item = clean(g(c_desc))
            if not seller or not buyer:
                warnings.append("row %s: skipped (seller=%r buyer=%r)" % (r, seller, buyer))
                continue
            st_rate = num(g(c_strate)) or 0
            st_amt = num(g(c_stamt)) or round(amount * st_rate, 2)
            c_rate_pct = num(g(c_crate))
            comm = dr or (round(st_amt * c_rate_pct, 2) if c_rate_pct else 0)
            rec = {
                "id": "zv-sale-%d" % r,
                "date": date or "",
                "invNo": clean(g(c_inv)),
                "seller": seller,
                "buyer": buyer,
                "item": item.upper(),
                "hsCode": hs_code(g(c_hs)),
                "qty": round(qty, 3),
                "rate": round(rate or 0, 2),
                "amount": round(amount, 2),
                "gstPct": round(st_rate * 100, 2),
                "gstValue": round(st_amt, 2),
                "commPct": round((c_rate_pct or 0) * 100, 2),
                "commValue": round(comm, 2),
                "total": round(num(g(c_total)) or (amount + st_amt), 2),
                "notes": "",
                "source": "xlsx-row-%d" % r,
            }
            sales.append(rec)
            sellers[seller] = True
            buyers[buyer] = True
            if item:
                key = (item.upper(), rec["hsCode"])
                items[key] = items.get(key, 0) + 1
            continue

        if cr > 0:
            note = clean(g(c_desc))
            receipts.append({
                "id": "zv-rcpt-%d" % r,
                "date": date or "",
                "amount": round(cr, 2),
                "mode": "Cash" if "cash" in note.lower() else "Bank",
                "notes": note,
                "source": "xlsx-row-%d" % r,
            })
            continue
        # anything else is an empty spacer / running-balance row

    for rec in sales + receipts:
        if not rec["date"]:
            warnings.append("%s has no date" % rec["id"])
        if rec["id"] in DATE_FIXES:
            fixed, why = DATE_FIXES[rec["id"]]
            warnings.append("%s: %s -> %s (%s)" % (rec["id"], rec["date"], fixed, why))
            rec["date"] = fixed

    sales.sort(key=lambda x: (x["date"], x["source"]))
    receipts.sort(key=lambda x: (x["date"], x["source"]))

    seed = {
        "sourceFile": path.replace("\\", "/").rsplit("/", 1)[-1],
        "dealer": dealer,
        "sellers": sorted(sellers),
        "buyers": sorted(buyers),
        "items": [{"name": n, "hsCode": h, "deals": c} for (n, h), c in sorted(items.items())],
        "sales": sales,
        "receipts": receipts,
    }
    return seed, warnings


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dealer = ""
    for a in sys.argv[1:]:
        if a.startswith("--dealer="):
            dealer = a.split("=", 1)[1]
    if len(args) != 2:
        sys.exit(__doc__)
    src, out = args
    seed, warnings = convert(src, dealer)

    total = lambda k: round(sum(r[k] for r in seed["sales"]), 2)
    recv = round(sum(r["amount"] for r in seed["receipts"]), 2)
    closing = round(total("commValue") - recv, 2)
    seed["control"] = {
        "deals": len(seed["sales"]),
        "receipts": len(seed["receipts"]),
        "qty": total("qty"),
        "amount": total("amount"),
        "gstValue": total("gstValue"),
        "commission": total("commValue"),
        "received": recv,
        "closingBalance": closing,
    }
    with open(out, "w", encoding="utf8") as fh:
        json.dump(seed, fh, ensure_ascii=False, indent=1)

    print("dealer      : %s" % seed["dealer"])
    print("sellers     : %s" % ", ".join(seed["sellers"]))
    print("buyers      : %d" % len(seed["buyers"]))
    print("items       : %d" % len(seed["items"]))
    print("deals       : %d" % len(seed["sales"]))
    print("receipts    : %d" % len(seed["receipts"]))
    print("qty         : %s" % f'{total("qty"):,.2f}')
    print("amount      : %s" % f'{total("amount"):,.2f}')
    print("gst value   : %s" % f'{total("gstValue"):,.2f}')
    print("commission  : %s" % f'{total("commValue"):,.2f}')
    print("received    : %s" % f"{recv:,.2f}")
    print("closing bal : %s" % f"{closing:,.2f}")
    print("warnings    : %d" % len(warnings))
    for w in warnings[:40]:
        print("   " + w)
    if len(warnings) > 40:
        print("   ... %d more" % (len(warnings) - 40))
    print("written     : %s" % out)


if __name__ == "__main__":
    main()
