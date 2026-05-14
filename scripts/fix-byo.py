#!/usr/bin/env python3
"""
Fix the 'Customize Your Own Roll' item in Clover:
  1. Attach to category ROLLED ICE CREAM
  2. Attach modifier groups Base + Mix-in + Topping
  3. Flip enabledOnline = true

Uses the per-item / per-category relationship endpoints rather than the
bulk /category_items + /item_modifier_groups bulk endpoints — the bulk
ones silently no-op when called from reorganize-menu.py, so we go
direct.

Run from repo root:
    python3 scripts/fix-byo.py          # dry run
    python3 scripts/fix-byo.py --apply  # actually mutate Clover
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


# ─── env loader (same as diag-byo.py) ─────────────────────────────
def load_env() -> None:
    env = Path(".env.local")
    if not env.exists():
        print("ERROR: no .env.local in cwd. Run from repo root.")
        sys.exit(1)
    for line in env.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def host() -> str:
    region = os.environ.get("CLOVER_REGION", "us")
    return (
        "https://api.clover.com"
        if region == "us"
        else "https://apisandbox.dev.clover.com"
    )


def request(method: str, path: str, body: dict | None = None) -> dict:
    mid = os.environ["CLOVER_MERCHANT_ID"]
    tok = os.environ["CLOVER_API_TOKEN"]
    url = f"{host()}/v3/merchants/{mid}{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {tok}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"{e.code} {e.reason} on {method} {path}\n{body}")


def get(path: str) -> dict:
    return request("GET", path)


def post(path: str, body: dict) -> dict:
    return request("POST", path, body)


def put(path: str, body: dict | None = None) -> dict:
    return request("PUT", path, body or {})


def main() -> None:
    dry = "--apply" not in sys.argv
    load_env()

    banner = (
        "DRY RUN — nothing will be sent." if dry
        else "APPLY MODE — about to mutate live Clover inventory."
    )
    print(f"\n  {banner}\n")

    # ─── Locate the BYO + ROLLED ICE CREAM + modifier groups ─────
    print("Locating BYO item, category, and modifier groups…")
    items = get(
        "/items?expand=modifierGroups,categories&limit=200"
    ).get("elements", [])
    cats = get("/categories?limit=200").get("elements", [])
    groups = get("/modifier_groups?limit=200").get("elements", [])

    byo = next(
        (
            i
            for i in items
            if i["name"].lower() == "customize your own roll"
        ),
        None,
    )
    if not byo:
        print("ERROR: no item named 'Customize Your Own Roll'. Aborting.")
        sys.exit(1)
    print(f"  byo:    {byo['id']!r} '{byo['name']}'")

    cat_rolled = next(
        (c for c in cats if c["name"].strip().upper() == "ROLLED ICE CREAM"),
        None,
    )
    if not cat_rolled:
        print("ERROR: no ROLLED ICE CREAM category. Aborting.")
        sys.exit(1)
    print(f"  cat:    {cat_rolled['id']!r} '{cat_rolled['name']}'")

    target_groups = {"Base", "Mix-in", "Topping"}
    selected_groups = [g for g in groups if g["name"] in target_groups]
    if len(selected_groups) != 3:
        print(
            f"ERROR: expected 3 modifier groups (Base/Mix-in/Topping); "
            f"found {len(selected_groups)}. Aborting."
        )
        sys.exit(1)
    for g in selected_groups:
        print(f"  group:  {g['id']!r} '{g['name']}'")

    # ─── Step 1: enabledOnline = true ────────────────────────────
    print("\n[1/3] Flip enabledOnline = true")
    if dry:
        print("      [DRY] would POST /items/{byo_id} {enabledOnline: true}")
    else:
        post(f"/items/{byo['id']}", {"enabledOnline": True})
        print("      [OK]")

    # ─── Step 2: Attach to ROLLED ICE CREAM ──────────────────────
    # Clover's canonical "attach an item to a category" endpoint is:
    #   POST /v3/merchants/{mId}/categories/{catId}/items/{itemId}
    # (NOT PUT — that returns 405.) No body needed.
    #
    # Fallback: bulk endpoint with elements wrapper.
    print("\n[2/3] Attach to category 'ROLLED ICE CREAM'")
    cat_path = f"/categories/{cat_rolled['id']}/items/{byo['id']}"
    if dry:
        print(f"      [DRY] would POST {cat_path}")
    else:
        try:
            post(cat_path, {})
            print(f"      [OK]  via {cat_path}")
        except RuntimeError as e:
            print(f"      [WARN] {e}")
            print("      Falling back to /category_items bulk endpoint…")
            try:
                post(
                    "/category_items",
                    {
                        "elements": [
                            {
                                "category": {"id": cat_rolled["id"]},
                                "item": {"id": byo["id"]},
                            }
                        ]
                    },
                )
                print("      [OK]  via /category_items bulk")
            except RuntimeError as e2:
                print(f"      [ERR] both attach methods failed:\n      direct: {e}\n      bulk:   {e2}")

    # ─── Step 3: Attach each modifier group ──────────────────────
    # Clover's canonical attach is:
    #   POST /v3/merchants/{mId}/items/{itemId}/modifier_groups/{groupId}
    # — path includes BOTH IDs, no body needed.
    #
    # Fallback: bulk endpoint with elements wrapper.
    print("\n[3/3] Attach modifier groups")
    for g in selected_groups:
        label = f"group '{g['name']}' ({g['id']})"
        if dry:
            print(f"      [DRY] {label}")
            continue
        path = f"/items/{byo['id']}/modifier_groups/{g['id']}"
        try:
            post(path, {})
            print(f"      [OK]  {label}")
        except RuntimeError as e:
            try:
                post(
                    "/item_modifier_groups",
                    {
                        "elements": [
                            {
                                "item": {"id": byo["id"]},
                                "modifierGroup": {"id": g["id"]},
                            }
                        ]
                    },
                )
                print(f"      [OK]  {label} (via bulk)")
            except RuntimeError as e2:
                print(f"      [ERR] {label}\n      direct: {e}\n      bulk:   {e2}")

    # ─── Verify ────────────────────────────────────────────────────
    print("\nVerifying…")
    fresh = get(
        f"/items/{byo['id']}?expand=modifierGroups,categories"
    )
    cats_now = fresh.get("categories", {}).get("elements", []) or []
    mgs_now = fresh.get("modifierGroups", {}).get("elements", []) or []
    print(f"  enabledOnline: {fresh.get('enabledOnline')}")
    print(f"  categories:    {len(cats_now)} attached")
    for c in cats_now:
        full = next((x for x in cats if x["id"] == c.get("id")), None)
        cname = (full or c).get("name", "<?>")
        print(f"                 • {c.get('id')} '{cname}'")
    print(f"  modifierGroups: {len(mgs_now)} attached")
    for mg in mgs_now:
        full = next((x for x in groups if x["id"] == mg.get("id")), None)
        gname = (full or mg).get("name", "<?>")
        print(f"                 • {mg.get('id')} '{gname}'")

    if dry:
        print("\n  (dry run — re-run with --apply to make these changes)")
    elif (
        len(cats_now) >= 1
        and len(mgs_now) >= 3
        and fresh.get("enabledOnline")
    ):
        print("\n  ✓ All three fixes applied — refresh the iPhone tab.")
    else:
        print(
            "\n  ⚠ At least one attach didn't take. Paste this output for diagnosis."
        )


if __name__ == "__main__":
    main()
