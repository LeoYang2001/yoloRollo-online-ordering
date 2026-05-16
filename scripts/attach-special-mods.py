#!/usr/bin/env python3
"""
Attach Base / Mix-in / Topping modifier groups to every Special Roll
(`Signature Roll #1` … `#6`) so the customer-facing app slides up the
customizer sheet with pickers when one is tapped.

Mirrors the attach pattern in `fix-byo.py`:
  - Try the canonical POST /items/{id}/modifier_groups/{groupId} first
  - Fall back to the bulk endpoint with {"elements":[{item, modifierGroup}]}
    if the direct path returns 405 (some merchant accounts gate it)

Idempotent — re-running won't create duplicate joins; Clover dedupes
attaches by (itemId, modifierGroupId).

Run from repo root:

    python3 scripts/attach-special-mods.py          # dry run
    python3 scripts/attach-special-mods.py --apply  # actually mutate
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


# Modifier groups we want every Special Roll to have. Names are case-
# insensitive — we match Clover's display name exactly minus capitals.
TARGET_GROUP_NAMES = {"base", "mix-in", "topping"}


# ─── env loader (same as the other scripts) ───────────────────────
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


def attach(item_id: str, item_name: str, group_id: str, group_name: str, dry: bool) -> bool:
    """
    Attach one modifier group to one item. Tries the canonical
    per-item endpoint first; on 405, falls back to the bulk endpoint.
    """
    label = f"'{group_name}' → '{item_name}'"
    if dry:
        print(f"      [DRY] attach {label}")
        return True

    direct_path = f"/items/{item_id}/modifier_groups/{group_id}"
    try:
        post(direct_path, {})
        print(f"      [OK]  attached {label}")
        return True
    except RuntimeError as direct_err:
        # Fallback: bulk endpoint with elements wrapper.
        try:
            post(
                "/item_modifier_groups",
                {
                    "elements": [
                        {
                            "item": {"id": item_id},
                            "modifierGroup": {"id": group_id},
                        }
                    ]
                },
            )
            print(f"      [OK]  attached {label} (via bulk)")
            return True
        except RuntimeError as bulk_err:
            print(
                f"      [ERR] both attach paths failed for {label}\n"
                f"            direct: {direct_err}\n"
                f"            bulk:   {bulk_err}"
            )
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

    # ─── Locate the Special Rolls ─────────────────────────────────
    print("Locating Special Rolls + modifier groups…")
    items = get(
        "/items?expand=modifierGroups&limit=500"
    ).get("elements", [])
    special_rolls = [
        i
        for i in items
        if i.get("name", "").lower().startswith("signature roll")
    ]
    if not special_rolls:
        print("ERROR: no items starting with 'Signature Roll'. Aborting.")
        sys.exit(1)
    print(f"\n  Found {len(special_rolls)} Special Roll(s):")
    for i in special_rolls:
        attached = i.get("modifierGroups", {}).get("elements", []) or []
        print(f"    • {i['id']}  '{i['name']}'  (currently mods={len(attached)})")

    # ─── Locate the target modifier groups ────────────────────────
    groups = get("/modifier_groups?limit=200").get("elements", [])
    selected_groups = [
        g for g in groups if g["name"].lower() in TARGET_GROUP_NAMES
    ]
    if len(selected_groups) < 3:
        print(
            f"\nERROR: expected 3 modifier groups "
            f"(Base / Mix-in / Topping); found {len(selected_groups)}.\n"
            f"Make sure Build Your Own Roll has them attached first "
            f"(run scripts/fix-byo.py if not). Aborting."
        )
        sys.exit(1)
    print(f"\n  Target modifier groups:")
    for g in selected_groups:
        print(f"    • {g['id']}  '{g['name']}'")

    # ─── Attach every target group to every Special Roll ──────────
    failures: list[str] = []
    for item in special_rolls:
        already_attached = {
            ref.get("id")
            for ref in (item.get("modifierGroups", {}).get("elements", []) or [])
        }
        print(f"\n  → {item['name']}")
        for group in selected_groups:
            if group["id"] in already_attached:
                print(
                    f"      [skip] '{group['name']}' already attached"
                )
                continue
            ok = attach(item["id"], item["name"], group["id"], group["name"], dry)
            if not ok:
                failures.append(f"{item['name']}: attach {group['name']}")

    # ─── Verify (apply mode only) ─────────────────────────────────
    if not dry:
        print("\nVerifying…")
        bad = 0
        for item in special_rolls:
            fresh = get(f"/items/{item['id']}?expand=modifierGroups")
            mgs_now = fresh.get("modifierGroups", {}).get("elements", []) or []
            names_now = sorted(
                (
                    (
                        next(
                            (g["name"] for g in groups if g["id"] == m["id"]),
                            m.get("name", "?"),
                        )
                    ).lower()
                    for m in mgs_now
                )
            )
            ok = TARGET_GROUP_NAMES.issubset(set(names_now))
            tag = "✓" if ok else "✗"
            print(
                f"  {tag} {item['name']}: mods=[{', '.join(names_now)}]"
            )
            if not ok:
                bad += 1
        if bad == 0:
            print(
                f"\n  ✓ All {len(special_rolls)} Special Rolls now have "
                f"Base + Mix-in + Topping attached."
            )
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
