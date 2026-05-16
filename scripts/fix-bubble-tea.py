#!/usr/bin/env python3
"""
Bubble tea menu cleanup.

For every item in the BUBBLE TEA category:
  1. Set price to $5.99 (599 cents)
  2. Detach every modifier group (SIZE / Boba / SWEETNESS) — bubble teas
     come in only one size and one sweetness level, so there's nothing
     for the customer to choose.

Same env / request pattern as fix-byo.py. Run from repo root:

    python3 scripts/fix-bubble-tea.py          # dry run, prints plan
    python3 scripts/fix-bubble-tea.py --apply  # actually mutate Clover
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


NEW_PRICE_CENTS = 599  # $5.99


# ─── env loader ────────────────────────────────────────────────────
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


def delete(path: str) -> dict:
    """
    DELETE via shell curl rather than Python's urllib.

    Why: Python's urllib sets `Content-Type` and `Content-Length: 0`
    on body-less DELETEs, and Clover's edge returns 405 on those —
    even when an identical body-less DELETE via curl returns 200.
    Curl, by default, sends neither header on `-X DELETE` with no
    `-d`, which is the shape Clover accepts.
    """
    mid = os.environ["CLOVER_MERCHANT_ID"]
    tok = os.environ["CLOVER_API_TOKEN"]
    url = f"{host()}/v3/merchants/{mid}{path}"
    result = subprocess.run(
        [
            "curl",
            "-s",
            "-X",
            "DELETE",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            url,
            "-H",
            f"Authorization: Bearer {tok}",
            "-H",
            "Accept: application/json",
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    code = result.stdout.strip()
    if not code.startswith("2"):
        raise RuntimeError(f"{code} on DELETE {path}")
    return {}


# ─── modifier group detach ─────────────────────────────────────────
def detach_modifier_group(
    item_id: str, group_id: str, group_name: str, dry: bool
) -> bool:
    """
    Detach a modifier group from an item via Clover's reverse-direction
    DELETE endpoint:

        DELETE /v3/merchants/{mId}/modifier_groups/{groupId}/items/{itemId}

    Notes for posterity — on this merchant account, three other shapes
    all return 405:
      • DELETE /items/{itemId}/modifier_groups/{groupId}
      • GET    /item_modifier_groups  (with or without filter)
      • GET    /items/{itemId}/modifier_groups
    Only the reverse-direction DELETE path above works. If a future
    merchant account behaves differently, swap the URL here.
    """
    label = f"'{group_name}' ({group_id})"
    if dry:
        print(f"      [DRY] detach {label}")
        return True

    path = f"/modifier_groups/{group_id}/items/{item_id}"
    try:
        delete(path)
        print(f"      [OK]  detached {label}")
        return True
    except RuntimeError as e:
        print(f"      [ERR] detach {label}: {e}")
        return False


def main() -> None:
    dry = "--apply" not in sys.argv
    load_env()

    banner = (
        "DRY RUN — nothing will be sent."
        if dry
        else "APPLY MODE — about to mutate live Clover inventory."
    )
    print(f"\n  {banner}\n")

    # ─── Locate the BUBBLE TEA category ───────────────────────────
    print("Locating BUBBLE TEA category and items…")
    cats = get("/categories?limit=200").get("elements", [])
    bubble_cat = next(
        (c for c in cats if c["name"].strip().upper() == "BUBBLE TEA"),
        None,
    )
    if not bubble_cat:
        print("ERROR: no category named 'BUBBLE TEA'. Aborting.")
        sys.exit(1)
    print(f"  category: {bubble_cat['id']!r} '{bubble_cat['name']}'")

    # ─── Get every item attached to that category ─────────────────
    items = get(
        "/items?expand=modifierGroups,categories&limit=500"
    ).get("elements", [])
    bubble_items = [
        i
        for i in items
        if any(
            c.get("id") == bubble_cat["id"]
            for c in (i.get("categories", {}).get("elements", []) or [])
        )
    ]
    if not bubble_items:
        print("ERROR: no items in BUBBLE TEA category. Aborting.")
        sys.exit(1)

    print(f"\n  Found {len(bubble_items)} bubble-tea item(s):")
    for i in bubble_items:
        mgs = i.get("modifierGroups", {}).get("elements", []) or []
        cur_price = i.get("price", 0)
        print(
            f"    • {i['id']}  '{i['name']}'  "
            f"${cur_price/100:.2f}  mods={len(mgs)}"
        )

    # ─── For each item: set price + detach all mod groups ─────────
    failures: list[str] = []
    for item in bubble_items:
        print(f"\n  → {item['name']}")

        # 1) price
        if dry:
            print(
                f"      [DRY] POST /items/{item['id']} "
                f"{{price: {NEW_PRICE_CENTS}}}"
            )
        else:
            try:
                post(f"/items/{item['id']}", {"price": NEW_PRICE_CENTS})
                print(f"      [OK]  price → ${NEW_PRICE_CENTS/100:.2f}")
            except RuntimeError as e:
                print(f"      [ERR] price update: {e}")
                failures.append(f"{item['name']}: price")

        # 2) detach modifier groups
        mgs = item.get("modifierGroups", {}).get("elements", []) or []
        if not mgs:
            print("      (no modifier groups attached — nothing to detach)")
            continue
        for mg in mgs:
            ok = detach_modifier_group(
                item["id"], mg["id"], mg.get("name", "?"), dry
            )
            if not ok:
                failures.append(f"{item['name']}: detach {mg.get('name')}")

    # ─── Verify ────────────────────────────────────────────────────
    if not dry:
        print("\nVerifying…")
        bad = 0
        for item in bubble_items:
            fresh = get(
                f"/items/{item['id']}?expand=modifierGroups"
            )
            mgs_now = (
                fresh.get("modifierGroups", {}).get("elements", []) or []
            )
            price_now = fresh.get("price", 0)
            tag = "✓" if (price_now == NEW_PRICE_CENTS and not mgs_now) else "✗"
            print(
                f"  {tag} {item['name']}: "
                f"${price_now/100:.2f}, mods={len(mgs_now)}"
            )
            if tag == "✗":
                bad += 1
        if bad == 0:
            print(f"\n  ✓ All {len(bubble_items)} items clean.")
        else:
            print(f"\n  ⚠ {bad} item(s) didn't fully apply — see above.")

    if failures:
        print("\n  Failures:")
        for f in failures:
            print(f"    - {f}")

    if dry:
        print("\n  (dry run — re-run with --apply to make these changes)")


if __name__ == "__main__":
    main()
