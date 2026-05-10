#!/usr/bin/env python3
"""
reorganize-menu.py — One-off Clover inventory reorganization for Yolo Rollo.

Reads CLOVER_REGION / CLOVER_MERCHANT_ID / CLOVER_API_TOKEN from the
project's .env.local. Standard library only — no pip install needed.

USAGE
    cd ~/Desktop/rolled-ice-cream-ordering
    python3 scripts/reorganize-menu.py            # dry run, no mutations
    python3 scripts/reorganize-menu.py --apply    # actually mutate Clover
    python3 scripts/reorganize-menu.py --apply --skip-backup

The script is IDEMPOTENT — re-running it after a successful run is a no-op.

PHASES
    0. Backup all items / modifier groups / categories to tmp/clover-backup-*.json
    1. Rename existing 'BUBBLE' group → 'Boba'
       Rename existing 'Topping' group → 'Old Topping' (so the new clean Topping
       group can take that name without conflicting)
       Create the 5 new modifier groups (Base, Mix-in, Topping, Sub Mix-in,
       Sub Topping) with their options
    2. Rename items per the menu plan (signatures, specials, smoothie casing,
       UPPERCASE bubble teas)
    3. Flip enabledOnline=true on the two Yolo Signatures + Starbucks Frappuccino
    4. Attach modifier groups to items (Boba → bubble teas, Sub Mix-in / Sub
       Topping → Signature Rolls)
    5. Create the new 'Customize Your Own Roll' item, assign to ROLLED ICE CREAM
       category, attach Base + Mix-in + Topping
    6. Print a manual cleanup checklist (deletes are NOT done by this script;
       you do them in the Clover Dashboard)

NOTES
    * Prices on bubble tea items are NOT changed by this script. They currently
      sit at $0 because the existing SIZE modifier supplies the price. Decide
      separately whether to flip the base to $5.99 and detach SIZE, or keep
      SIZE if you sell both Light Bulb and Regular sizes.
    * Items are not deleted by this script — the manual checklist at the end
      lists everything to remove via the Clover Dashboard.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

# ─────────────────────────────────────────────────────────────
# Desired end state (the menu plan, in code form)
# ─────────────────────────────────────────────────────────────

# Modifier group renames done BEFORE creating new groups (avoids name
# collision; current "Topping" has 24 options, the new clean one has 11).
GROUP_RENAMES = {
    "BUBBLE": "Boba",
    "Topping": "Old Topping",
}

# New modifier groups to create.
# Modifier prices are in CENTS (Clover's wire format).
NEW_MODIFIER_GROUPS = [
    {
        "name": "Base",
        "minRequired": 1, "maxAllowed": 1, "showByDefault": True,
        "modifiers": [
            ("Vanilla", 0), ("Strawberry", 0), ("Mango", 0),
            ("Chocolate", 0), ("Coconut", 0),
        ],
    },
    {
        "name": "Mix-in",
        "minRequired": 0, "maxAllowed": 3, "showByDefault": True,
        "modifiers": [
            ("Banana", 0), ("Oreo Cookie", 0), ("Brownie", 0),
            ("Strawberry", 0), ("Pineapple", 0), ("Mango", 0),
            ("Blueberry", 0), ("Cheesecake", 0), ("Peanut Butter", 0),
        ],
    },
    {
        "name": "Topping",  # the clean 11-option version
        "minRequired": 0, "maxAllowed": 3, "showByDefault": True,
        "modifiers": [
            ("Mango", 0), ("Strawberry", 0), ("Pineapple", 0),
            ("Condensed Milk", 0), ("Chocolate Syrup", 0), ("Caramel Syrup", 0),
            ("Mango Boba", 0), ("Strawberry Boba", 0),
            ("Oreo Cookie", 0), ("M&Ms", 0), ("Gummy Bears", 0),
        ],
    },
    {
        "name": "Sub Mix-in",
        "minRequired": 0, "maxAllowed": 1, "showByDefault": False,
        "modifiers": [
            ("Banana", 0), ("Oreo Cookie", 0), ("Brownie", 0),
            ("Strawberry", 0), ("Pineapple", 0), ("Mango", 0),
            ("Blueberry", 0), ("Cheesecake", 0), ("Peanut Butter", 0),
        ],
    },
    {
        "name": "Sub Topping",
        "minRequired": 0, "maxAllowed": 1, "showByDefault": False,
        "modifiers": [
            ("Mango", 0), ("Strawberry", 0), ("Pineapple", 0),
            ("Condensed Milk", 0), ("Chocolate Syrup", 0), ("Caramel Syrup", 0),
            ("Mango Boba", 0), ("Strawberry Boba", 0),
            ("Oreo Cookie", 0), ("M&Ms", 0), ("Gummy Bears", 0),
        ],
    },
]

# Item renames. Key = current Clover name (case-sensitive), value = new name.
ITEM_RENAMES = {
    "SIGNATURE_1": "Yolo Signature — Waffle Bowl Classic",
    "SIGNATURE_2": "Yolo Signature — Strawberry Crumble",
    "Special#1":   "Signature Roll #1 — Cookies & Cream",
    "Special#2":   "Signature Roll #2 — Strawberry Cheesecake",
    "Special#3":   "Signature Roll #3 — Choco Oreo",
    "Special #4":  "Signature Roll #4 — Mango Strawberry",
    "Special#5":   "Signature Roll #5 — Coconut M&M",
    "SPECIAL #6":  "Signature Roll #6 — Vanilla Cheesecake",
    "VANILLA Smoothie":      "Vanilla Smoothie",
    "STRAWBERRY BUBBLE TEA": "Strawberry Bubble Tea",
    "TARO BUBBLE TEA":       "Taro Bubble Tea",
    "THAI BUBBLE TEA":       "Thai Bubble Tea",
}

# Items to flip enabledOnline=true (matched by their FINAL name, post-rename).
ENABLE_ONLINE = [
    "Yolo Signature — Waffle Bowl Classic",
    "Yolo Signature — Strawberry Crumble",
    "Starbucks Frappuccino",
]

# Modifier group attachments. Map item name → list of modifier group names.
ATTACH = {
    # Yolo Signatures: Sub Topping only (no mix swap on these)
    "Yolo Signature — Waffle Bowl Classic":      ["Sub Topping"],
    "Yolo Signature — Strawberry Crumble":       ["Sub Topping"],
    # Signature Rolls: Sub Mix-in + Sub Topping (employees can swap)
    "Signature Roll #1 — Cookies & Cream":       ["Sub Mix-in", "Sub Topping"],
    "Signature Roll #2 — Strawberry Cheesecake": ["Sub Mix-in", "Sub Topping"],
    "Signature Roll #3 — Choco Oreo":            ["Sub Mix-in", "Sub Topping"],
    "Signature Roll #4 — Mango Strawberry":      ["Sub Mix-in", "Sub Topping"],
    "Signature Roll #5 — Coconut M&M":           ["Sub Mix-in", "Sub Topping"],
    "Signature Roll #6 — Vanilla Cheesecake":    ["Sub Mix-in", "Sub Topping"],
    # Bubble teas: Boba (renamed BUBBLE)
    "Strawberry Bubble Tea": ["Boba"],
    "Mango Bubble Tea":      ["Boba"],
    "Coconut Bubble Tea":    ["Boba"],
    "Honeydew Bubble Tea":   ["Boba"],
    "Taro Bubble Tea":       ["Boba"],
    "Bubble Milk Tea":       ["Boba"],
    "Jasmine Bubble Tea":    ["Boba"],
    "Blueberry Bubble Tea":  ["Boba"],
    "Lychee Bubble Tea":     ["Boba"],
    "Thai Bubble Tea":       ["Boba"],
    "Red Bean Bubble Tea":   ["Boba"],
    # Customize Your Own Roll: full picker
    "Customize Your Own Roll": ["Base", "Mix-in", "Topping"],
}

# New item to create at the end.
NEW_ITEM = {
    "name": "Customize Your Own Roll",
    "price": 699,           # cents
    "priceType": "FIXED",
    "category": "ROLLED ICE CREAM",
    "enabledOnline": True,
    "available": True,
    "hidden": False,
}

# Manual cleanup checklist printed at the end of every run.
MANUAL_DELETE_ITEMS = [
    "1 Extra Topping", "2  Extra Topping", "3 Extra Topping", "4 Extra Topping",
    "LIGHT BULB (the $4.99 standalone item)",
    "REGULAR (the $4.25 standalone item)",
    "Whipped Cream", "Wip Cream",
    "Cup of Water (the $0 / no-category one — keep the $1.39 entry)",
    "Strawberry Bubble Tea (lowercase duplicate, no category)",
    "Taro Bubble Tea (lowercase duplicate)",
    "Thai Bubble Tea (lowercase duplicate)",
    "STRAWBERRY ROLLED ICE CREAM",
    "CHOCOLATE ROLLED ICE CREAM",
    "MANGO ROLLED ICE CREAM",
    "COCONUT ROLLED ICE CREAM",
    "VANILLA ROLLED ICE CREAM",
    "SMALL CHOCOLATE  ROLLED ICE CREAM",
    "SMALL MANGO ROLLED ICE CREAM",
    "SMALL STRAWBERRY ROLLED ICE CREAM",
    "SMALL VANILLA ROLLED ICE CREAM",
    "SMALL ROLL ICE CREAM",
    "RED BULL", "RED BULL ENERGY DRINK",
]
MANUAL_DELETE_GROUPS = [
    "Mix  (the original 15-option group, replaced by 'Mix-in')",
    "Mix2 (10-option duplicate of Mix)",
    "Old Topping  (the legacy 24-option group, replaced by clean 'Topping')",
    "SIZE  (the $5.99/$6.99 LIGHT BULB / REGULAR group)",
    "Size  (the $0/$3 group)",
    "FLAVOR  (10-option duplicate)",
    "SWEETNESS  (we don't adjust sweetness right now)",
    "Extra Topping  (4-option group, replaced by clean 'Topping')",
    "Whipped Cream  (becomes a Topping option)",
    "Cup of Water's Size",
    "Cup of Ice's Size",
]
MANUAL_NOTES = [
    "Bubble tea prices: items currently show $0 because the existing SIZE",
    "modifier supplies the price. Either:",
    "  • Set each bubble tea base price to $5.99 and detach the SIZE modifier, OR",
    "  • Keep the SIZE modifier if you sell both Light Bulb and Regular sizes.",
    "",
    "Do this AFTER deleting the legacy modifier groups in the list above.",
]

# ─────────────────────────────────────────────────────────────
# .env.local loader (no python-dotenv dependency)
# ─────────────────────────────────────────────────────────────

def load_env_local() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env.local"
    if not env_path.exists():
        return
    for raw in env_path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


# ─────────────────────────────────────────────────────────────
# Clover REST client (stdlib only)
# ─────────────────────────────────────────────────────────────

class Clover:
    def __init__(self, region: str, merchant_id: str, token: str):
        self.base = (
            "https://api.clover.com" if region == "us"
            else "https://apisandbox.dev.clover.com"
        )
        self.merchant_id = merchant_id
        self.token = token

    def _request(self, method: str, path: str, body: dict | None = None) -> dict:
        url = f"{self.base}/v3/merchants/{self.merchant_id}{path}"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", errors="replace") if e.fp else ""
            raise RuntimeError(f"Clover {method} {path} → {e.code}: {msg}")

    def get(self, path: str) -> dict:
        return self._request("GET", path)

    def post(self, path: str, body: dict) -> dict:
        return self._request("POST", path, body)

    # High-level inventory helpers
    def list_items(self) -> list[dict]:
        out: list[dict] = []
        offset = 0
        while True:
            page = self.get(
                f"/items?expand=modifierGroups,categories&limit=200&offset={offset}"
            )
            els = page.get("elements", [])
            out.extend(els)
            if len(els) < 200:
                break
            offset += 200
        return out

    def list_modifier_groups(self) -> list[dict]:
        return self.get("/modifier_groups?expand=modifiers&limit=500").get("elements", [])

    def list_categories(self) -> list[dict]:
        return self.get("/categories?limit=500").get("elements", [])

    def update_item(self, item_id: str, body: dict) -> dict:
        return self.post(f"/items/{item_id}", body)

    def update_modifier_group(self, group_id: str, body: dict) -> dict:
        return self.post(f"/modifier_groups/{group_id}", body)

    def create_modifier_group(self, body: dict) -> dict:
        return self.post("/modifier_groups", body)

    def create_modifier(self, group_id: str, body: dict) -> dict:
        return self.post(f"/modifier_groups/{group_id}/modifiers", body)

    def attach_modifier_group(self, item_id: str, group_id: str) -> dict:
        # Canonical relationship endpoint.
        return self.post("/item_modifier_groups", {
            "item": {"id": item_id},
            "modifierGroup": {"id": group_id},
        })

    def create_item(self, body: dict) -> dict:
        return self.post("/items", body)

    def attach_item_to_category(self, item_id: str, category_id: str) -> dict:
        return self.post("/category_items", {
            "category": {"id": category_id},
            "item": {"id": item_id},
        })


# ─────────────────────────────────────────────────────────────
# Pretty logger
# ─────────────────────────────────────────────────────────────

class Log:
    def __init__(self, dry: bool):
        self.dry = dry
        self.actions = 0

    def section(self, title: str) -> None:
        print(f"\n{'═' * 60}")
        print(f"  {title}")
        print(f"{'═' * 60}")

    def ok(self, msg: str) -> None:
        prefix = "[DRY]" if self.dry else "[OK] "
        print(f"  {prefix} {msg}")
        self.actions += 1

    def skip(self, msg: str) -> None:
        print(f"  [-]  {msg}")

    def err(self, msg: str) -> None:
        print(f"  [!!] {msg}")

    def info(self, msg: str) -> None:
        print(f"  ··   {msg}")


# ─────────────────────────────────────────────────────────────
# Phase implementations
# ─────────────────────────────────────────────────────────────

def phase_backup(clover: Clover, log: Log) -> tuple[list[dict], list[dict], list[dict], Path]:
    log.section("Phase 0 — Backup")
    out_dir = Path(__file__).resolve().parent.parent / "tmp"
    out_dir.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    items = clover.list_items()
    groups = clover.list_modifier_groups()
    cats = clover.list_categories()
    backup_path = out_dir / f"clover-backup-{ts}.json"
    backup_path.write_text(json.dumps({
        "fetchedAt": datetime.now().isoformat(),
        "items": items,
        "modifier_groups": groups,
        "categories": cats,
    }, indent=2))
    log.ok(
        f"Wrote {backup_path.relative_to(Path.cwd()) if backup_path.is_relative_to(Path.cwd()) else backup_path}"
    )
    log.info(f"{len(items)} items · {len(groups)} modifier groups · {len(cats)} categories")
    return items, groups, cats, backup_path


def phase_modifier_groups(
    clover: Clover, log: Log, groups: list[dict], dry: bool
) -> dict[str, dict]:
    log.section("Phase 1 — Modifier groups")
    by_name = {g["name"]: g for g in groups}

    # 1a. Rename existing groups out of the way (BUBBLE→Boba, Topping→Old Topping)
    for old, new in GROUP_RENAMES.items():
        if old not in by_name:
            log.skip(f"No source group '{old}' to rename")
            continue
        if new in by_name and by_name[new]["id"] != by_name[old]["id"]:
            log.err(f"Cannot rename '{old}' → '{new}': '{new}' already exists. Resolve manually.")
            continue
        if by_name[old]["name"] == new:
            log.skip(f"'{old}' is already '{new}'")
            continue
        log.ok(f"Rename group '{old}' → '{new}'")
        if not dry:
            clover.update_modifier_group(by_name[old]["id"], {"name": new})
        # Mirror the rename locally even in dry mode so later phases see the
        # post-rename state instead of warning about ghost conflicts.
        by_name[new] = {**by_name[old], "name": new}
        del by_name[old]

    # 1b. Create the 5 new groups (Base, Mix-in, Topping, Sub Mix-in, Sub Topping)
    for spec in NEW_MODIFIER_GROUPS:
        name = spec["name"]
        if name in by_name:
            existing = by_name[name]
            log.skip(f"Group '{name}' already exists ({existing['id']}) — checking modifiers")
        else:
            log.ok(f"Create group '{name}' (min={spec['minRequired']}, max={spec['maxAllowed']})")
            if dry:
                existing = {
                    "id": f"<new:{name}>", "name": name,
                    "modifiers": {"elements": []},
                }
            else:
                created = clover.create_modifier_group({
                    "name": name,
                    "minRequired": spec["minRequired"],
                    "maxAllowed": spec["maxAllowed"],
                    "showByDefault": spec["showByDefault"],
                })
                existing = {**created, "modifiers": {"elements": []}}
            by_name[name] = existing

        # Ensure modifiers within the group are present
        existing_mods = {
            m["name"]: m for m in existing.get("modifiers", {}).get("elements", [])
        }
        for mod_name, mod_price in spec["modifiers"]:
            if mod_name in existing_mods:
                log.skip(f"  modifier '{name}/{mod_name}' already exists")
            else:
                log.ok(f"  add modifier '{name}/{mod_name}' (${mod_price / 100:.2f})")
                if not dry:
                    try:
                        clover.create_modifier(existing["id"], {
                            "name": mod_name,
                            "price": mod_price,
                        })
                    except RuntimeError as e:
                        log.err(f"  failed: {e}")

    return by_name


def phase_renames(
    clover: Clover, log: Log, items: list[dict], dry: bool
) -> dict[str, dict]:
    log.section("Phase 2 — Item renames")
    by_name = {i["name"]: i for i in items}
    for current, new in ITEM_RENAMES.items():
        if current == new:
            continue
        if current not in by_name:
            if new in by_name:
                log.skip(f"Already renamed: '{new}'")
            else:
                log.skip(f"Source '{current}' not found")
            continue
        # Conflict check: target name in use by a different item
        if new in by_name and by_name[new]["id"] != by_name[current]["id"]:
            log.err(
                f"CONFLICT: '{new}' already exists on a different item. "
                "Delete or rename it manually first."
            )
            continue
        log.ok(f"Rename '{current}' → '{new}'")
        if not dry:
            try:
                clover.update_item(by_name[current]["id"], {"name": new})
            except RuntimeError as e:
                log.err(f"  failed: {e}")
                continue
        item = by_name.pop(current)
        item["name"] = new
        by_name[new] = item
    return by_name


def phase_online(
    clover: Clover, log: Log, items_by_name: dict[str, dict], dry: bool
) -> None:
    log.section("Phase 3 — Flip enabledOnline=true")
    for name in ENABLE_ONLINE:
        item = items_by_name.get(name)
        if not item:
            log.skip(f"Item '{name}' not found")
            continue
        if item.get("enabledOnline") is True:
            log.skip(f"'{name}' already online")
            continue
        log.ok(f"Enable online: '{name}'")
        if not dry:
            try:
                clover.update_item(item["id"], {"enabledOnline": True})
                item["enabledOnline"] = True
            except RuntimeError as e:
                log.err(f"  failed: {e}")


def phase_attach(
    clover: Clover,
    log: Log,
    items_by_name: dict[str, dict],
    groups_by_name: dict[str, dict],
    dry: bool,
) -> None:
    log.section("Phase 4 — Attach modifier groups to items")
    for item_name, group_names in ATTACH.items():
        if item_name == NEW_ITEM["name"]:
            continue  # handled in phase 5 since the item doesn't exist yet
        item = items_by_name.get(item_name)
        if not item:
            log.skip(f"Item '{item_name}' not found (skipped)")
            continue
        existing_ids = {
            g["id"] for g in item.get("modifierGroups", {}).get("elements", [])
        }
        for group_name in group_names:
            group = groups_by_name.get(group_name)
            if not group:
                log.err(f"Group '{group_name}' not found (need to create it)")
                continue
            if group["id"] in existing_ids:
                log.skip(f"'{item_name}' already has '{group_name}'")
                continue
            log.ok(f"Attach '{group_name}' → '{item_name}'")
            if not dry:
                try:
                    clover.attach_modifier_group(item["id"], group["id"])
                except RuntimeError as e:
                    log.err(f"  attach failed: {e}")


def phase_new_item(
    clover: Clover,
    log: Log,
    items_by_name: dict[str, dict],
    groups_by_name: dict[str, dict],
    categories: list[dict],
    dry: bool,
) -> None:
    log.section("Phase 5 — Create 'Customize Your Own Roll'")
    name = NEW_ITEM["name"]
    if name in items_by_name:
        log.skip(f"'{name}' already exists, skipping create")
        new_item = items_by_name[name]
    else:
        log.ok(f"Create item '{name}' @ ${NEW_ITEM['price'] / 100:.2f}")
        if dry:
            new_item = {
                "id": f"<new:{name}>", "name": name,
                "modifierGroups": {"elements": []},
                "categories": {"elements": []},
            }
        else:
            new_item = clover.create_item({
                "name": NEW_ITEM["name"],
                "price": NEW_ITEM["price"],
                "priceType": NEW_ITEM["priceType"],
                "available": NEW_ITEM["available"],
                "hidden": NEW_ITEM["hidden"],
                "enabledOnline": NEW_ITEM["enabledOnline"],
            })
            new_item.setdefault("modifierGroups", {"elements": []})
            new_item.setdefault("categories", {"elements": []})
        items_by_name[name] = new_item

    # Attach to ROLLED ICE CREAM category
    cat = next((c for c in categories if c["name"] == NEW_ITEM["category"]), None)
    if not cat:
        log.err(f"Category '{NEW_ITEM['category']}' not found")
    else:
        already = any(
            c.get("id") == cat["id"]
            for c in new_item.get("categories", {}).get("elements", [])
        )
        if already:
            log.skip(f"'{name}' already in category '{cat['name']}'")
        else:
            log.ok(f"Add to category '{cat['name']}'")
            if not dry:
                try:
                    clover.attach_item_to_category(new_item["id"], cat["id"])
                except RuntimeError as e:
                    log.err(f"  category attach failed (may already be attached): {e}")

    # Attach Base + Mix-in + Topping
    existing_ids = {
        g["id"] for g in new_item.get("modifierGroups", {}).get("elements", [])
    }
    for group_name in ATTACH[name]:
        group = groups_by_name.get(group_name)
        if not group:
            log.err(f"Group '{group_name}' not found")
            continue
        if group["id"] in existing_ids:
            log.skip(f"'{name}' already has '{group_name}'")
            continue
        log.ok(f"Attach '{group_name}' → '{name}'")
        if not dry:
            try:
                clover.attach_modifier_group(new_item["id"], group["id"])
            except RuntimeError as e:
                log.err(f"  attach failed: {e}")


def phase_checklist(log: Log, backup_path: Path | str) -> None:
    log.section("Phase 6 — Manual cleanup checklist (do these in Clover Dashboard)")
    print("\n  Items to delete:")
    for n in MANUAL_DELETE_ITEMS:
        print(f"    [ ] {n}")
    print("\n  Modifier groups to delete:")
    for n in MANUAL_DELETE_GROUPS:
        print(f"    [ ] {n}")
    print("\n  Notes:")
    for line in MANUAL_NOTES:
        print(f"    {line}")
    print(f"\n  Backup: {backup_path}")
    print("  If anything went wrong, the backup has every item/group/category exactly as they were.\n")


# ─────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reorganize Yolo Rollo's Clover inventory.",
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Actually mutate Clover. Default is dry-run.",
    )
    parser.add_argument(
        "--skip-backup", action="store_true",
        help="Skip the backup phase. Not recommended.",
    )
    args = parser.parse_args()

    load_env_local()

    region = os.environ.get("CLOVER_REGION", "us")
    mid = os.environ.get("CLOVER_MERCHANT_ID")
    token = os.environ.get("CLOVER_API_TOKEN")
    if not mid or not token:
        print(
            "Missing CLOVER_MERCHANT_ID or CLOVER_API_TOKEN in environment.\n"
            "Make sure .env.local exists at the project root.",
            file=sys.stderr,
        )
        sys.exit(1)

    clover = Clover(region, mid, token)
    dry = not args.apply
    log = Log(dry)

    print()
    if dry:
        print("  ┌──────────────────────────────────────────────────────────┐")
        print("  │   DRY RUN — nothing will be sent to Clover.              │")
        print("  │   Re-run with  --apply  to execute the plan.             │")
        print("  └──────────────────────────────────────────────────────────┘")
    else:
        print("  ┌──────────────────────────────────────────────────────────┐")
        print("  │   APPLY MODE — about to mutate live Clover inventory.    │")
        print("  │   Press Ctrl-C in 5 seconds to abort.                    │")
        print("  └──────────────────────────────────────────────────────────┘")
        time.sleep(5)

    # Phase 0 — backup
    if args.skip_backup and not dry:
        log.section("Phase 0 — Backup (SKIPPED)")
        items = clover.list_items()
        groups = clover.list_modifier_groups()
        cats = clover.list_categories()
        backup_path: Path | str = "<skipped>"
    else:
        items, groups, cats, backup_path = phase_backup(clover, log)

    # Phases 1–5
    groups_by_name = phase_modifier_groups(clover, log, groups, dry)
    items_by_name = phase_renames(clover, log, items, dry)
    phase_online(clover, log, items_by_name, dry)
    phase_attach(clover, log, items_by_name, groups_by_name, dry)
    phase_new_item(clover, log, items_by_name, groups_by_name, cats, dry)

    # Phase 6 — checklist
    phase_checklist(log, backup_path)

    print(f"  {log.actions} action(s) {'planned' if dry else 'applied'}.\n")


if __name__ == "__main__":
    main()
