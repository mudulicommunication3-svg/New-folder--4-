"""Export the live Google Sheets catalog to webapp/catalog.js for the Mini App.

Usage:  python webapp/export_catalog.py

Reads every product via db.get_all_products() and writes a ``catalog.js``
file (``window.STORE_CATALOG = [...]``) next to shop.html. Only in-stock
rows with a name + EAN are exported. Re-run (or cron it) whenever the
catalog changes.

Needs the same .env as the bot (GOOGLE_SHEETS_CREDENTIALS_FILE, ...).
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import db  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent
OUT_PATH = BASE_DIR / "catalog.js"
HTML_PATH = BASE_DIR / "shop.html"


def build_catalog() -> list:
    items = []
    for prod in db.get_all_products():
        ean = str(prod.get("ean") or "").strip()
        name = str(prod.get("product_name") or "").strip()
        if not ean or not name:
            continue
        items.append(
            {
                "ean": ean,
                "product_name": name,
                "mrp": str(prod.get("mrp") or "0"),
                "selling_price": str(prod.get("selling_price") or "0"),
                "stock_qty": str(prod.get("stock_qty") or "0"),
                "image_url": str(prod.get("image_url") or ""),
                "category": str(prod.get("category") or "General") or "General",
            }
        )
    return items


def _inject_into_html(items: list, html_path: Path) -> None:
    """Embed the catalog JSON inline into shop.html at the //__CATALOG_DATA__
    marker so the Mini App is self-contained (no external catalog.js needed)."""
    marker = "window.STORE_CATALOG = []; //__CATALOG_DATA__"
    data = json.dumps(items, ensure_ascii=False)
    replacement = f"window.STORE_CATALOG = {data};"
    html = html_path.read_text(encoding="utf-8")
    if marker in html:
        html = html.replace(marker, replacement)
    else:
        # fall back: keep a standalone catalog.js for older shop.html builds
        (html_path.parent / "catalog.js").write_text(
            "window.STORE_CATALOG = " + data + ";\n", encoding="utf-8"
        )
    html_path.write_text(html, encoding="utf-8")


def main() -> int:
    try:
        items = build_catalog()
    except db.DatabaseError as exc:
        print(f"ERROR: {exc}")
        return 1
    _inject_into_html(items, HTML_PATH)
    # also refresh the standalone catalog.js for backwards compatibility
    OUT_PATH.write_text(
        "window.STORE_CATALOG = " + json.dumps(items, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"Exported {len(items)} products -> {HTML_PATH.name} (inline) + catalog.js")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
