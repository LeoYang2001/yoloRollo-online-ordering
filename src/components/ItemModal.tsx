import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MenuItem, Modifier, ModifierGroup } from "../types";
import { useCart } from "../lib/cartStore";
import { flyToCart } from "../lib/flyToCart";
import { Display, Mono, Sticker } from "./ui/Typography";
import { ProductVisual, photoLayoutId } from "./ui/ProductVisual";
import { Icon } from "./ui/Icon";
import { Button } from "./ui/Button";
import { QtyStepper } from "./ui/CartItem";
import { flavorCardBg, inferFlavor } from "../lib/flavors";
import { RollPreview } from "./RollPreview";

/**
 * Item customizer — works in two presentations:
 *
 *   mode="sheet"  bottom-up modal (slides up, max 90vh, backdrop fade).
 *                 Used for regular menu items in the 2-col grid.
 *   mode="page"   full-screen takeover (slides up from below, no backdrop).
 *                 Used for Yolo Signatures in the carousel.
 *
 * For non-BYO items the hero photo shares a `layoutId` with the source
 * card so framer-motion morphs it from card position into the hero band.
 *
 * For BYO ("Customize Your Own Roll") the hero is replaced with the
 * live SVG <RollPreview>, AND we split the hero into a sticky band so
 * the preview stays visible while the customer scrolls through Base /
 * Mix-in / Topping pills.
 *
 * Pricing rule (applies to every roll — BYO and signatures alike):
 *   - Each modifier group's FIRST selection is included in the item's
 *     base price. For signature rolls the default mix-in / topping
 *     comes pre-selected, so the "included" ingredient counts toward
 *     this freebie automatically.
 *   - Additional selections in Mix-in / Topping groups add $1 each.
 *   - (Base groups can only ever have 1 selection, so the rule is moot.)
 */

interface Props {
  item: MenuItem | null;
  open: boolean;
  onClose: () => void;
  mode?: "sheet" | "page";
}

/** Returns true if this group charges $1 per extra selection beyond the
 *  first. Currently triggers on groups named "Mix-in" or "Topping". */
function isExtrasGroup(group: ModifierGroup): boolean {
  return /\b(mix-?in|topping)s?\b/i.test(group.name);
}

/**
 * Walks the selected modifier IDs and applies the freebie pricing rule
 * for Mix-in / Topping groups.
 *
 * Two flavors of the rule, depending on item type:
 *
 *   - BYO ("Customize Your Own Roll"): the customer is building from
 *     scratch, so the FIRST selection in each Mix-in / Topping group
 *     is included in the base price. Selections 2+ cost $1.
 *
 *   - Special / Yolo Signature rolls (predefined recipes): the
 *     recipe's mix-in/topping is already baked into the base price
 *     and is presented as a read-only "What's included" section the
 *     customer can't toggle. ANY mix-in or topping the customer adds
 *     on top is an EXTRA → $1 each from the first selection on, no
 *     freebie.
 *
 * The Set iteration preserves insertion (pick) order, so "first" =
 * the earliest-inserted modifier in the group.
 */
function adjustedModifiers(
  item: MenuItem,
  selected: Record<string, Set<string>>,
  byoItem: boolean,
): Modifier[] {
  const freebieAllowed = byoItem ? 1 : 0;
  const out: Modifier[] = [];
  for (const g of item.modifierGroups) {
    const ids = selected[g.id] ?? new Set<string>();
    const extras = isExtrasGroup(g);
    let count = 0;
    // Iterate the Set in insertion order so pricing follows pick order.
    for (const id of ids) {
      const m = g.modifiers.find((mod) => mod.id === id);
      if (!m) continue;
      count++;
      const priceDelta = extras && count > freebieAllowed ? 1.0 : 0;
      out.push({ ...m, priceDelta });
    }
  }
  return out;
}

/** True for the Base modifier group (which only the BYO modal exposes
 *  — predefined rolls hide it because the base is dictated by the recipe). */
function isBaseGroup(group: ModifierGroup): boolean {
  return /^base\b/i.test(group.name);
}

export function ItemModal({ item, open, onClose, mode = "sheet" }: Props) {
  const addItem = useCart((s) => s.addItem);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [qty, setQty] = useState(1);
  const heroRef = useRef<HTMLDivElement | null>(null);

  // Initialize a fresh selection when a new item opens. For groups with
  // min > 0 we pre-select the first option so the form is "valid by
  // default" — saves the user a tap on rolls (base is required).
  useEffect(() => {
    if (!open || !item) return;
    const init: Record<string, Set<string>> = {};
    for (const g of item.modifierGroups) {
      if (g.minSelections > 0 && g.modifiers.length > 0) {
        init[g.id] = new Set([g.modifiers[0].id]);
      } else {
        init[g.id] = new Set();
      }
    }
    setSelected(init);
    setQty(1);
  }, [open, item]);

  // Body-scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // BYO detection — used by both the pricing rule (first free) and the
  // RollPreview wiring. (Computed before chosenMods so the useMemo dep
  // is stable across renders.)
  // (Hook calls must run BEFORE any conditional early return — see hooks rules.)
  const isBYO = item
    ? /(customize|build)\s+your\s+own/i.test(item.name)
    : false;

  // Compute chosen modifiers each render so the Add button + total
  // reflect the latest selection. Pricing rule:
  //   - BYO: first mix-in / topping free, extras +$1
  //   - Special / Yolo signature rolls: the recipe's ingredients are
  //     already in the base price (and hidden from the customizer), so
  //     ANY mix-in or topping the customer picks is an extra → $1 each.
  const chosenMods: Modifier[] = useMemo(() => {
    if (!item) return [];
    return adjustedModifiers(item, selected, isBYO);
  }, [selected, item, isBYO]);
  const byoSelections = useMemo(() => {
    const result: { base?: string; mixIns: string[]; toppings: string[] } = {
      mixIns: [],
      toppings: [],
    };
    if (!isBYO || !item) return result;
    for (const g of item.modifierGroups) {
      const ids = selected[g.id] ?? new Set<string>();
      const gname = g.name.toLowerCase();
      for (const m of g.modifiers) {
        if (!ids.has(m.id)) continue;
        if (gname.includes("base")) result.base = m.name;
        else if (gname.includes("mix")) result.mixIns.push(m.name);
        else if (gname.includes("topping")) result.toppings.push(m.name);
      }
    }
    return result;
  }, [isBYO, selected, item]);

  if (!item) return null;

  const unitPrice =
    item.price + chosenMods.reduce((s, m) => s + m.priceDelta, 0);
  const totalPrice = unitPrice * qty;

  const valid = item.modifierGroups.every((g) => {
    const n = selected[g.id]?.size ?? 0;
    return n >= g.minSelections && n <= g.maxSelections;
  });

  const toggle = (group: ModifierGroup, mod: Modifier) => {
    setSelected((prev) => {
      const cur = new Set(prev[group.id] ?? []);
      if (cur.has(mod.id)) {
        if (cur.size > group.minSelections) cur.delete(mod.id);
      } else {
        if (group.maxSelections === 1) cur.clear();
        if (cur.size >= group.maxSelections) return prev;
        cur.add(mod.id);
      }
      return { ...prev, [group.id]: cur };
    });
  };

  const handleAdd = () => {
    const from = heroRef.current?.getBoundingClientRect();
    if (from) flyToCart({ from, imageSrc: item.imageUrl });
    for (let i = 0; i < qty; i++) {
      // Pass the adjusted modifiers so the cart line's unitPrice matches
      // the customizer's displayed total.
      addItem(item, chosenMods);
    }
    onClose();
  };

  const flavor = item.flavor ?? inferFlavor(item.name);

  // ─── Shared body ────────────────────────────────────────────────
  // Two layouts:
  //   - BYO  : sticky compact preview + scrollable title/copy + pills.
  //   - Other: classic hero band (photo + stickers + title + tagline)
  //            followed by pills.
  const body: ReactNode = (
    <>
      {isBYO ? (
        // ─── BYO sticky hero — single block ────────────────────────
        // Image + title + pricing pill all live in ONE sticky div so
        // there's no boundary between them where the modal's white card
        // can leak through. Also means the title stays visible while
        // scrolling, which is a small UX bonus — customer always sees
        // what they're customizing.
        //
        // We keep the sizes a touch tighter (160 → 140 photo, 26 → 22
        // title) so the sticky block doesn't eat too much vertical
        // real estate when modifier pills are scrolling below.
        <div
          ref={heroRef}
          className="sticky top-0 z-10 bg-rollo-paper-soft px-5 pb-4 pt-5 text-center"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={mode === "page" ? "Back" : "Close"}
            className="absolute right-4 top-3 grid h-9 w-9 place-items-center rounded-full bg-rollo-card text-rollo-ink shadow-rollo-soft transition active:scale-[0.95]"
          >
            {mode === "page" ? <Icon.back /> : <Icon.close />}
          </button>
          <div className="flex justify-center">
            <RollPreview selections={byoSelections} size={140} />
          </div>
          <Display size={22} className="mt-2">
            {item.name}
          </Display>
          <div className="mt-2 flex justify-center">
            <div className="inline-flex items-center gap-1 rounded-full bg-rollo-pink-soft px-3 py-1.5">
              <Icon.check className="h-3 w-3 text-rollo-pink-deep" />
              <Mono size={10} color="#B81560" weight={700}>
                1 FREE MIX-IN + 1 FREE TOPPING · EXTRAS $1 EACH
              </Mono>
            </div>
          </div>
        </div>
      ) : (
        // ─── Non-BYO: classic hero band ──────────────────────────────
        // Hero background is the same soft flavor tint we use on the
        // grid cards so the modal feels like a continuation of the
        // card the customer tapped (and the photo's transparent
        // cutout sits on a consistent surface). When there's no
        // imageUrl (gradient swatch fallback) the boxShadow style
        // makes the swatch look 3D; when there IS an imageUrl,
        // ProductPhoto ignores boxShadow and uses its own drop-shadow.
        <div
          ref={heroRef}
          className="relative px-5 pb-7 pt-6"
          style={{ background: flavorCardBg(flavor) }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={mode === "page" ? "Back" : "Close"}
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-rollo-card text-rollo-ink shadow-rollo-soft transition active:scale-[0.95]"
          >
            {mode === "page" ? <Icon.back /> : <Icon.close />}
          </button>

          <div className="mt-2 flex justify-center">
            <ProductVisual
              item={item}
              size={item.category === "Bubble Tea" || item.category === "Smoothie" ? 170 : 150}
              layoutId={photoLayoutId(item.id)}
              style={
                item.imageUrl
                  ? undefined
                  : {
                      boxShadow:
                        "0 16px 30px -8px rgba(184,21,96,0.30), inset 0 -6px 16px rgba(0,0,0,0.12)",
                    }
              }
            />
          </div>

          <div className="mt-4 flex items-center justify-center gap-2">
            {item.tags && item.tags[0] && (
              <Sticker size="md">{item.tags[0]}</Sticker>
            )}
            {item.number && (
              <Sticker size="md" bg="#2A1722" fg="#FFFFFF">
                ROLL {item.number}
              </Sticker>
            )}
          </div>

          <Display size={28} className="mt-3 text-center">
            {item.name}
          </Display>
          {(item.tagline ?? item.description) && (
            <p className="mx-auto mt-1.5 max-w-[320px] text-center text-[13px] leading-snug text-rollo-ink-soft">
              {item.tagline ?? item.description}
            </p>
          )}
          {/* Subtle "add extras" hint — only render when the item
              actually has Mix-in / Topping groups. Bubble teas,
              smoothies, etc. don't have those, so the hint would be a
              lie. */}
          {item.modifierGroups.some(isExtrasGroup) && (
            <p className="mx-auto mt-3 max-w-[320px] text-center text-[11px] text-rollo-ink-muted">
              Add extra mix-ins or toppings · <span className="font-bold text-rollo-pink">$1 each</span>
            </p>
          )}
        </div>
      )}

      {/* Modifier groups.
       *
       *  For predefined rolls (non-BYO that have Mix-in / Topping groups
       *  attached — i.e. Special Rolls and Yolo Signatures), the Base
       *  group is dictated by the recipe and hidden from the customizer.
       *  The internal selection still pre-selects the first Base
       *  modifier (so any min=1 validation passes), but the customer
       *  doesn't see a Base picker. They see a read-only "What's
       *  included" banner above the Mix-in / Topping "Add extras"
       *  pickers. */}
      <div className="bg-rollo-card px-5 pt-3">
        {!isBYO && item.tagline && item.modifierGroups.some(isExtrasGroup) && (
          <div className="mb-4 rounded-rollo-card border border-rollo-ink-line bg-rollo-paper-soft px-3.5 py-3">
            <Mono size={10} color="rgba(42,23,34,0.55)">
              WHAT’S INCLUDED
            </Mono>
            <p className="mt-1 font-body text-[13px] leading-snug text-rollo-ink">
              {item.tagline}
            </p>
          </div>
        )}
        {item.modifierGroups
          .filter((g) => isBYO || !isBaseGroup(g))
          .map((group) => (
            <ModifierGroupPills
              key={group.id}
              group={group}
              selected={selected[group.id] ?? new Set()}
              onToggle={(mod) => toggle(group, mod)}
              isByoItem={isBYO}
            />
          ))}
      </div>

      {/* Sticky CTA row */}
      <div className="sticky bottom-0 flex items-center gap-2.5 border-t border-rollo-ink-line bg-rollo-card px-5 pb-6 pt-3.5">
        <div className="h-[52px]">
          <QtyStepper
            qty={qty}
            onInc={() => setQty(qty + 1)}
            onDec={() => setQty(Math.max(1, qty - 1))}
          />
        </div>
        <Button
          variant="primary"
          size="lg"
          full
          disabled={!valid}
          onClick={handleAdd}
          className="flex-1"
        >
          Add · ${totalPrice.toFixed(2)}
        </Button>
      </div>
    </>
  );

  // ─── Sheet mode — backdrop + bottom slide-up + 90vh max ─────────
  if (mode === "sheet") {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            onClick={onClose}
            className="fixed inset-0 z-[100] flex items-end"
            style={{ background: "rgba(42,23,34,0.42)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90%] w-full overflow-auto rounded-t-rollo-ticket bg-rollo-card shadow-rollo-modal"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {body}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // ─── Page mode — full-screen takeover, no backdrop ──────────────
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] overflow-auto bg-rollo-card"
          initial={{ y: 28, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 28, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
        >
          {body}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ────────────────────────────────────────────────────────────────────
// Single modifier group rendered as a wrap of pill buttons.
//
// Pricing rules driven by `isByoItem`:
//   - true  (BYO): first selection in a Mix-in / Topping group is free,
//                  selections 2+ cost $1 each.
//   - false (Special / Yolo signature rolls): the recipe's mix-in /
//                  topping is already baked into the base price and
//                  hidden from this picker. Anything the customer
//                  selects here is an EXTRA → $1 each from the first
//                  selection on, no freebie.
//
// Selection order tracking uses the Set's insertion order (Sets preserve
// it in JS), so "first" means "the pill the customer tapped first".
// ────────────────────────────────────────────────────────────────────
interface PillsProps {
  group: ModifierGroup;
  selected: Set<string>;
  onToggle: (mod: Modifier) => void;
  isByoItem?: boolean;
}

function ModifierGroupPills({
  group,
  selected,
  onToggle,
  isByoItem = false,
}: PillsProps) {
  const extrasGroup = isExtrasGroup(group);
  const freebieAllowed = isByoItem ? 1 : 0;

  // Pick-order list of selected IDs — matches what adjustedModifiers
  // iterates so the UI's "free vs paid" labels line up with the
  // actual line-item pricing.
  const orderedSelectedIds = Array.from(selected);
  const paidCount = extrasGroup
    ? Math.max(0, orderedSelectedIds.length - freebieAllowed)
    : 0;

  // For predefined rolls the picker is purely an "add extras"
  // affordance — rename the group label to make that obvious.
  const displayName =
    !isByoItem && extrasGroup ? `Add extra ${group.name.toLowerCase()}s` : group.name;

  const hint = (() => {
    if (group.maxSelections === 1) return "Choose 1";
    if (extrasGroup && isByoItem) return "1 free · extras $1.00 each";
    if (extrasGroup) return "$1.00 each";
    return `Up to ${group.maxSelections}`;
  })();

  return (
    <div className="mb-5">
      <div className="mb-2.5 flex items-baseline justify-between">
        <Display size={16} as="h3">
          {displayName}
        </Display>
        <span className="text-[11px] text-rollo-ink-muted">{hint}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {group.modifiers.map((m) => {
          const isSel = selected.has(m.id);
          // Position in the customer's pick order. selectionIdx 0 =
          // first selected; higher = picked later.
          const selectionIdx = isSel
            ? orderedSelectedIds.indexOf(m.id)
            : -1;
          // Show +$1.00 only on pills past the freebie threshold:
          //   BYO  → selectionIdx >= 1 (1st free, 2nd/3rd paid)
          //   else → selectionIdx >= 0 (every selected pill is paid)
          const showSurcharge =
            isSel && extrasGroup && selectionIdx >= freebieAllowed;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onToggle(m)}
              className={`inline-flex items-center gap-2 rounded-full border-[1.5px] px-3.5 py-2.5 font-body text-[13px] font-semibold transition ${
                isSel
                  ? "border-rollo-pink bg-rollo-pink text-white"
                  : "border-rollo-ink-line bg-rollo-paper-soft text-rollo-ink"
              }`}
            >
              {/* No check icon — the hot-pink fill is the "selected"
                  signal; an extra ✓ inside reads as redundant. */}
              <span>{m.name}</span>
              {showSurcharge && (
                <span className="font-bold opacity-80">+$1.00</span>
              )}
            </button>
          );
        })}
      </div>
      {/* Inline summary for extras groups — reinforces the math as the
          customer picks. Wording differs per pricing rule. */}
      {extrasGroup && paidCount > 0 && (
        <div className="mt-2 text-[11px] text-rollo-ink-soft">
          {isByoItem ? (
            <>
              1 free · {paidCount} extra × $1.00 ={" "}
              <span className="font-bold text-rollo-pink">
                +${paidCount.toFixed(2)}
              </span>
            </>
          ) : (
            <>
              {paidCount} extra × $1.00 ={" "}
              <span className="font-bold text-rollo-pink">
                +${paidCount.toFixed(2)}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
