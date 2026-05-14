#!/usr/bin/env python3
"""
Diagnose why "Customize Your Own Roll" isn't showing on the website.

Pulls the exact Clover representation of the BYO item, prints every
relevant field, lists all categories, and tells you which (if any)
/api/menu filter would drop the item.

Run from the repo root:
    python3 scripts/diag-byo.py

Reads CLOVER_REGION / CLOVER_MERCHANT_ID / CLOVER_API_TOKEN from
.env.local.
"""
import json
import os
import sys
import urllib.request
from pathlib import Path


def load_env() -> None:
    env = Path(".env.local")
    if not env.exists():
        print("ERROR: no .env.local in cwd. Run from repo root.")
        sys.exit(1)
    for line in env.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def clover_get(path: str) -> dict:
    region = os.environ.get("CLOVER_REGION", "us")
    mid = os.environ["CLOVER_MERCHANT_ID"]
    tok = os.environ["CLOVER_API_TOKEN"]
    host = (
        "https://api.clover.com"
        if region == "us"
        else "https://apisandbox.dev.clover.com"
    )
    url = f"{host}/v3/merchants/{mid}{path}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {tok}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


# ─── /api/menu filters mirrored here so we can simulate ───────────
CUSTOMER_CATEGORIES = {
    "Rolled Ice Cream",
    "Bubble Tea",
    "Smoothie",
    "Cold Drinks",
}

CATEGORY_MAP = {
    "rolled ice cream": "Rolled Ice Cream",
    "specials": "Rolled Ice Cream",
    "small roll ice cream": "Rolled Ice Cream",
    "bubble tea": "Bubble Tea",
    "smoothie": "Smoothie",
    "cold drinks": "Cold Drinks",
}


def main() -> None:
    load_env()

    print("Fetching items + categories from Clover…\n")
    items_resp = clover_get(
        "/items?expand=modifierGroups,categories&limit=200"
    )
    cats_resp = clover_get("/categories?limit=200")

    items = items_resp.get("elements", [])
    cats = cats_resp.get("elements", [])

    # ─── 1. Find every item whose name suggests BYO ───────────────
    byos = [
        i
        for i in items
        if "customize" in i["name"].lower() and "your" in i["name"].lower()
    ] + [
        i
        for i in items
        if "build" in i["name"].lower() and "your" in i["name"].lower()
    ]
    # De-dupe
    seen = set()
    byos = [b for b in byos if not (b["id"] in seen or seen.add(b["id"]))]

    print(
        f"=== Items matching customize/build your own ({len(byos)} found) ===\n"
    )
    if not byos:
        print("  (none) — the item does not exist in your Clover inventory.\n")
        print("  Fix: re-run reorganize-menu.py --apply, or create the item")
        print("       manually in Clover Dashboard.")
        return

    for i in byos:
        print(f"id:             {i['id']}")
        print(f"name:           {i['name']!r}")
        print(f"price:          {i.get('price')} cents")
        print(f"hidden:         {i.get('hidden')}")
        print(f"available:      {i.get('available')}")
        print(f"priceType:      {i.get('priceType')}")
        print(f"enabledOnline:  {i.get('enabledOnline')}")

        attached_cats = i.get("categories", {}).get("elements", []) or []
        print(f"categories:     {len(attached_cats)} attached")
        for c in attached_cats:
            full = next((x for x in cats if x["id"] == c.get("id")), None)
            cname = (full or c).get("name", "<no-name>")
            print(f"                • id={c.get('id')} name={cname!r}")

        mgs = i.get("modifierGroups", {}).get("elements", []) or []
        print(f"modifierGroups: {len(mgs)} attached")
        for mg in mgs:
            print(f"                • id={mg.get('id')}")

        # ─── Diagnose ────────────────────────────────────────────
        print("\n--- /api/menu filter simulation ---")
        verdict = []
        if i.get("hidden"):
            verdict.append("  ✗ DROPPED: i.hidden === true")
        # Look up the category names
        attached_names = []
        for c in attached_cats:
            full = next((x for x in cats if x["id"] == c.get("id")), None)
            if full:
                attached_names.append(full.get("name", ""))
            else:
                attached_names.append(c.get("name", ""))
        mapped_to = None
        for n in attached_names:
            if not n:
                continue
            mapped = CATEGORY_MAP.get(n.strip().lower())
            if mapped:
                mapped_to = mapped
                break
        if not mapped_to:
            verdict.append(
                "  ✗ DROPPED: no attached category maps to a customer bucket"
            )
            verdict.append(
                f"             attached: {attached_names!r}"
            )
            verdict.append(
                f"             expected one of (lowercased): "
                f"{sorted(CATEGORY_MAP.keys())}"
            )
        else:
            verdict.append(
                f"  ✓ category {mapped_to!r} — would pass /api/menu category check"
            )
        if mgs:
            verdict.append(
                f"  ✓ has {len(mgs)} modifier group(s) attached"
            )
        else:
            verdict.append(
                "  ✗ no modifier groups — modal would open empty"
            )

        for v in verdict:
            print(v)
        print()

    # ─── 2. List all categories so we can see exact spellings ───
    print(f"\n=== All Clover categories ({len(cats)}) ===\n")
    for c in sorted(cats, key=lambda x: x.get("name", "")):
        print(f"  id={c['id']:<24} name={c['name']!r}")
    print()

    print("=== /api/menu CATEGORY_MAP keys (lowercased Clover names) ===")
    for k, v in sorted(CATEGORY_MAP.items()):
        print(f"  {k!r:<28} → {v!r}")


if __name__ == "__main__":
    main()
