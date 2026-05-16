import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../lib/api";
import type { FlavorKey, Menu as MenuT, MenuItem } from "../types";
import { inferFlavor } from "../lib/flavors";
import { useCart } from "../lib/cartStore";
import { flyToCart } from "../lib/flyToCart";
import { ItemModal } from "../components/ItemModal";
import { Mono } from "../components/ui/Typography";
import { Icon } from "../components/ui/Icon";
import { SectionHeader } from "../components/ui/Layout";
import { CategoryChip } from "../components/ui/CategoryChip";
import { ProductCard, FeaturedCard } from "../components/ui/Cards";

/**
 * Menu — browse experience.
 *
 *   1. Featured carousel (Yolo Signatures, horizontal scroll-snap)
 *   2. Category chips (synthetic filters, not Clover categories)
 *   3. Section title for the active filter + sub line
 *   4. 2-col product grid
 *
 * Bottom 140px is reserved for the floating cart FAB.
 *
 * Data is fetched from /api/menu (Clover-backed). Items in Clover don't
 * carry a `flavor` field, so we infer one from the name via inferFlavor().
 */

// ─── Item filters ─────────────────────────────────────────────────
// Centralized so the carousel + chips don't drift out of sync.
function isYoloSignature(item: MenuItem): boolean {
  return /^yolo\s+signature/i.test(item.name);
}
// Matches either the new "Special Roll #N — ..." names or the older
// "Signature Roll #N — ..." names from before the Clover rename, so a
// half-renamed merchant inventory still resolves cleanly.
function isSpecialRoll(item: MenuItem): boolean {
  return /^(special|signature)\s+roll/i.test(item.name);
}
// Back-compat alias — older code may still reference the old name.
const isSignatureSpecial = isSpecialRoll;
function isBuildYourOwn(item: MenuItem): boolean {
  return /(customize|build)\s+your\s+own/i.test(item.name);
}

// ─── Chip definitions ─────────────────────────────────────────────
// Synthetic, curated filters. They span multiple Clover categories and
// reorganize the menu the way customers actually browse it. Order here
// = display order in the scrollable chip row.
interface Chip {
  id: string;
  short: string;
  icon: keyof typeof Icon;
  sub: string;
  match: (item: MenuItem) => boolean;
}

const CHIPS: Chip[] = [
  {
    // We keep the chip id "signatures" so any persisted state / deep
    // links from earlier deploys still resolve. The customer-facing
    // label is "Special Rolls" — the carousel of unnumbered hero items
    // up top remains "Yolo Signatures" and stays visually distinct.
    id: "signatures",
    short: "Special Rolls",
    icon: "cup",
    sub: "Two ingredients. Freshly rolled. Totally you.",
    match: isSignatureSpecial,
  },
  {
    id: "byo",
    short: "Build Your Own",
    icon: "spoon",
    sub: "Pick a base, mix-in, and topping",
    match: isBuildYourOwn,
  },
  {
    id: "bubble",
    short: "Bubble Tea",
    icon: "boba",
    sub: "Fresh & fruity · 20 oz · brown sugar boba",
    match: (i) => i.category === "Bubble Tea",
  },
  {
    id: "smoothies",
    short: "Smoothies",
    icon: "cup",
    sub: "Blended & delicious · 20 oz",
    match: (i) => i.category === "Smoothie" || i.category === "Smoothies",
  },
  // Cold Drinks intentionally absent from the online menu. We don't
  // run strict inventory on bottled/canned drinks (Red Bull, bottled
  // water, Frappuccinos, etc.) so we can't honor online orders for
  // them reliably. They remain available in-store via the POS. To
  // re-enable, restore the chip below and re-add the "cold drinks"
  // mapping in api/menu.ts.
];

// ─── Tag inference ────────────────────────────────────────────────
// Until Clover carries real "BEST SELLER"/"NEW"/"FAN FAV" badges, we
// derive them from name patterns so a few products visually pop.
function inferTags(item: MenuItem): string[] {
  if (item.tags && item.tags.length > 0) return item.tags;
  const n = item.name.toLowerCase();
  if (/^yolo\s+signature/.test(n) && /strawberry|crumble/.test(n))
    return ["BEST SELLER"];
  if (/^yolo\s+signature/.test(n) && /(waffle|classic)/.test(n))
    return ["FAN FAV"];
  if (/^yolo\s+signature/.test(n)) return ["BEST SELLER"];
  if (isBuildYourOwn(item)) return ["MAKE IT YOURS"];
  return [];
}

/**
 * Pull a 1–6 signature number out of an item name. Matches:
 *
 *   "Yolo Signature #1 - Strawberry Classic"  → "1"
 *   "Yolo Signature 2"                          → "2"
 *   "Signature Roll #3"                         → "3"  (legacy name)
 *   "Special Roll #3 - Choco Oreo"              → "3"  (current name)
 *
 * Returns undefined for non-roll items or numbers outside 1–6.
 */
function inferSignatureNumber(name: string): string | undefined {
  const n = name.toLowerCase();
  if (!/(yolo\s+signature|signature\s+roll|special\s+roll)/.test(n))
    return undefined;
  const match = name.match(/#\s*([1-6])\b/) ?? name.match(/\b([1-6])\b/);
  return match?.[1];
}

/**
 * Map a Yolo Signature item (no number — the unnumbered carousel
 * heroes) to its hero photograph. Right now we have two:
 *
 *   "Yolo Signature — Strawberry Crumble"   → /signatures/yolo_1.png
 *   "Yolo Signature — Waffle Bowl Classic"  → /signatures/yolo_2.png
 *
 * To add a third hero in the future, drop the photo in
 * public/signatures/ and append the pattern + filename here.
 */
function yoloSignatureImage(name: string): string | undefined {
  const n = name.toLowerCase();
  if (!/yolo\s+signature/.test(n)) return undefined;
  if (/strawberry\s+crumble/.test(n)) return "/signatures/yolo_1.png";
  if (/waffle\s+bowl/.test(n)) return "/signatures/yolo_2.png";
  return undefined;
}

/**
 * Hand-tuned base-flavor key per signature roll. The auto `inferFlavor`
 * regex picks the first matching pattern in the item name, which gets
 * the wrong color for compound names ("Choco Oreo" matches `oreo`
 * before `chocolate`; "Coconut M&M" matches `m&m` before `coconut`).
 * This override map ensures each signature's card background reads
 * like its actual base ice cream.
 */
const SIGNATURE_FLAVOR_OVERRIDES: Record<string, FlavorKey> = {
  "1": "oreo", //       Cookies & Cream
  "2": "strawberry", // Strawberry Cheesecake
  "3": "chocolate", //  Choco Oreo
  "4": "mango", //      Mango Strawberry
  "5": "coconut", //    Coconut M&M
  "6": "vanilla", //    Vanilla Cheesecake
};

// Helper: enrich a raw Clover MenuItem with the design-specific fields
// (flavor key, tags, signature number, photo URL). Returns a new object
// so downstream components can rely on them being present.
function enrich(item: MenuItem): MenuItem {
  const sigNumber = item.number ?? inferSignatureNumber(item.name);
  // Photo precedence: explicit imageUrl from Clover (none today) →
  // numbered Signature Roll photo → unnumbered Yolo Signature photo.
  const imageUrl =
    item.imageUrl ??
    (sigNumber ? `/signatures/signature_${sigNumber}.png` : undefined) ??
    yoloSignatureImage(item.name);
  // Flavor precedence: explicit flavor → numbered-signature override →
  // name-based heuristic.
  const flavor =
    item.flavor ??
    (sigNumber ? SIGNATURE_FLAVOR_OVERRIDES[sigNumber] : undefined) ??
    inferFlavor(item.name);
  return {
    ...item,
    flavor,
    tags: inferTags(item),
    tagline: item.tagline ?? item.description,
    number: sigNumber,
    imageUrl,
  };
}

export function MenuPage() {
  const [menu, setMenu] = useState<MenuT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeChipId, setActiveChipId] = useState<string>("signatures");
  // Track the open item AND how it was opened. Carousel taps → "page"
  // (full-screen with shared photo morph); grid taps → "sheet" (bottom
  // sheet with shared photo morph). Both share the same ItemModal which
  // branches on the mode prop.
  const [openItem, setOpenItem] = useState<
    { item: MenuItem; mode: "sheet" | "page" } | null
  >(null);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [query, setQuery] = useState("");
  const carouselRef = useRef<HTMLDivElement>(null);

  // Live cart line counts, keyed by itemId — used to swap the + button
  // on ProductCard for a stepper. We also track the *most recent line
  // id* per itemId so the stepper knows which line to mutate when the
  // customer increments / decrements from the menu grid (an item can
  // appear as multiple cart lines if added with different modifier
  // combinations; the stepper operates on the latest configuration).
  const cartLines = useCart((s) => s.lines);
  const addItem = useCart((s) => s.addItem);
  const setQuantity = useCart((s) => s.setQuantity);
  const cartCountByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of cartLines) {
      map.set(l.itemId, (map.get(l.itemId) ?? 0) + l.quantity);
    }
    return map;
  }, [cartLines]);
  const latestLineByItemId = useMemo(() => {
    const map = new Map<string, (typeof cartLines)[number]>();
    // Iterate in order — later entries overwrite earlier, leaving the
    // map keyed to the most recently added line per itemId.
    for (const l of cartLines) map.set(l.itemId, l);
    return map;
  }, [cartLines]);

  /**
   * Step the cart count for the given menu item. delta=+1 adds one;
   * delta=-1 removes one (and removes the line entirely at zero).
   * Operates on the most recently added line for this itemId so the
   * stepper preserves whatever modifier combo was last configured.
   *
   * For brand-new items (count = 0) called with delta=+1, we go
   * through the regular add path: items with no modifier groups
   * quick-add; items with options open the customizer.
   */
  const stepCart = (item: MenuItem, delta: 1 | -1) => {
    const latest = latestLineByItemId.get(item.id);
    if (latest) {
      setQuantity(latest.lineId, latest.quantity + delta);
      return;
    }
    // No existing line — only meaningful for +1.
    if (delta === 1) {
      if (item.modifierGroups.length === 0) {
        addItem(item, []);
      } else {
        setOpenItem({ item, mode: "sheet" });
      }
    }
  };

  /**
   * Grid-tap handler. Items with at least one modifier group open the
   * customizer sheet (size / mix-in / topping pickers, etc.). Items with
   * no modifier groups — like bubble teas, which come in one fixed
   * size + sweetness — are quick-adds: tap goes straight to the cart.
   * We still fire the fly-to-cart animation from the card's bounding
   * rect so the customer gets the same feedback they'd see if they'd
   * gone through the sheet.
   */
  const handleGridTap = (
    item: MenuItem,
    e: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (item.modifierGroups.length === 0) {
      const from = e.currentTarget.getBoundingClientRect();
      flyToCart({ from });
      addItem(item, []);
      return;
    }
    setOpenItem({ item, mode: "sheet" });
  };

  // ─── Fetch menu ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    api
      .getMenu()
      .then((m) => !cancelled && setMenu(m))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Featured carousel — only the Yolo Signatures ──────────────
  const featured = useMemo(() => {
    if (!menu) return [];
    return menu.items.filter(isYoloSignature).map(enrich);
  }, [menu]);

  // ─── Grid logic ────────────────────────────────────────────────
  // Two distinct modes:
  //   1. Browsing — show items matching the active chip in one section
  //      (no per-section header; the chip's section header sits above).
  //   2. Searching — split results into per-chip groups so customers can
  //      see which category each result belongs to. Hides the carousel
  //      and the chip row entirely.
  const activeChip = CHIPS.find((c) => c.id === activeChipId) ?? CHIPS[0];
  const isSearching = query.trim().length > 0;

  const sections = useMemo(() => {
    if (!menu) return [];

    if (!isSearching) {
      // Browse mode: one section, items matching the active chip.
      return [
        {
          id: activeChip.id,
          label: activeChip.short,
          items: menu.items.filter(activeChip.match).map(enrich),
        },
      ];
    }

    // Search mode: walk every chip, filter by query, keep only chips
    // that have at least one match. Order by the chip array so search
    // results stay in a predictable layout.
    const q = query.trim().toLowerCase();
    return CHIPS.map((chip) => ({
      id: chip.id,
      label: chip.short,
      items: menu.items
        .filter(chip.match)
        .filter((i) =>
          `${i.name} ${i.description ?? ""} ${i.tagline ?? ""}`
            .toLowerCase()
            .includes(q),
        )
        .map(enrich),
    })).filter((s) => s.items.length > 0);
  }, [menu, activeChip, query, isSearching]);

  // ─── Carousel scroll → active dot ──────────────────────────────
  useEffect(() => {
    const root = carouselRef.current;
    if (!root || featured.length === 0) return;
    const onScroll = () => {
      const slideW = root.firstElementChild?.clientWidth ?? root.clientWidth;
      const idx = Math.round(root.scrollLeft / (slideW + 12)); // +gap
      setCarouselIdx(Math.min(idx, featured.length - 1));
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [featured.length]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="relative min-h-screen bg-rollo-paper text-rollo-ink"
    >
      {/* ─── Sticky search bar ─── */}
      {/*
        pt-14 clears the iOS status bar. We keep the search bar always
        visible (sticky inside the page scroller) so customers can pop
        in/out of search at any time without scrolling back to the top.
      */}
      <div className="sticky top-0 z-20 bg-rollo-paper px-5 pb-3 pt-14">
        <div className="flex items-center gap-2.5 rounded-2xl bg-rollo-card px-4 py-3 shadow-rollo-soft">
          <Icon.search className="text-rollo-ink-soft" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search flavors, rolls, drinks…"
            className="flex-1 border-none bg-transparent font-body text-sm text-rollo-ink outline-none placeholder:text-rollo-ink-muted"
          />
          {isSearching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="grid h-6 w-6 place-items-center rounded-full bg-rollo-paper-soft text-rollo-ink-soft transition active:scale-[0.92]"
            >
              <Icon.close className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Featured carousel (browse mode only) ─── */}
      {!isSearching && featured.length > 0 && (
        <div className="pb-4">
          <div
            ref={carouselRef}
            className="scroll-hide flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
            style={{
              scrollSnapType: "x mandatory",
              scrollPaddingLeft: "1.25rem",
              paddingLeft: "1.25rem",
              paddingRight: "1.25rem",
            }}
          >
            {featured.map((item, idx) => (
              <div
                key={item.id}
                className="shrink-0 snap-start"
                style={{ flex: "0 0 92%" }}
              >
                <FeaturedCard
                  item={item}
                  variant={
                    idx % 3 === 0 ? "rose" : idx % 3 === 1 ? "pink" : "deep"
                  }
                  inCartCount={cartCountByItemId.get(item.id) ?? 0}
                  // Carousel = Yolo Signatures → full-page detail.
                  onClick={() => setOpenItem({ item, mode: "page" })}
                />
              </div>
            ))}
          </div>
          {featured.length > 1 && (
            <div className="mt-2.5 flex justify-center gap-1.5">
              {featured.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-200 ${i === carouselIdx ? "w-[18px] bg-rollo-pink" : "w-1.5 bg-rollo-pink-soft"}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Category chips (browse mode only) ─── */}
      {!isSearching && (
        <div
          className="scroll-hide flex gap-2 overflow-x-auto pb-1 pt-1"
          style={{ paddingLeft: "1.25rem", paddingRight: "1.25rem" }}
        >
          {CHIPS.map((chip) => (
            <CategoryChip
              key={chip.id}
              label={chip.short}
              icon={chip.icon}
              active={chip.id === activeChipId}
              onClick={() => setActiveChipId(chip.id)}
            />
          ))}
        </div>
      )}

      {/* ─── Active chip section header (browse mode only) ─── */}
      {!isSearching && (
        <div className="px-5 pb-2 pt-4">
          <SectionHeader title={activeChip.short} sub={activeChip.sub} />
        </div>
      )}

      {/* ─── Search results header ─── */}
      {isSearching && (
        <div className="px-5 pb-2 pt-2">
          <Mono size={10}>
            {sections.reduce((sum, s) => sum + s.items.length, 0)} RESULT
            {sections.reduce((sum, s) => sum + s.items.length, 0) === 1
              ? ""
              : "S"}{" "}
            FOR “{query.trim()}”
          </Mono>
        </div>
      )}

      {/* ─── Sections — one per group when searching, single in browse mode ─── */}
      <div className="px-5 pb-[140px]">
        {error && (
          <div className="rounded-rollo-card bg-rollo-pink-soft p-4 text-sm text-rollo-pink">
            Couldn't load menu — {error}
          </div>
        )}

        {!menu && !error && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="min-h-[210px] animate-pulse rounded-rollo-card bg-rollo-card opacity-50"
              />
            ))}
          </div>
        )}

        {sections.map((section, idx) => (
          <div key={section.id} className={idx > 0 ? "mt-6" : ""}>
            {/* Per-section category label (search mode only) — gives
                customers context on which category each result is in. */}
            {isSearching && (
              <div className="mb-2.5">
                <SectionHeader title={section.label} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {section.items.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  inCartCount={cartCountByItemId.get(item.id) ?? 0}
                  // Items with options → sheet customizer.
                  // Items with no options → quick-add to cart.
                  onClick={(e) => handleGridTap(item, e)}
                  // Stepper edits the most recent cart line for this
                  // item — preserves whatever modifier config the
                  // customer last configured.
                  onIncrement={() => stepCart(item, 1)}
                  onDecrement={() => stepCart(item, -1)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Empty states */}
        {menu &&
          sections.length === 0 &&
          (isSearching ? (
            <div className="py-10 text-center">
              <Mono size={11} color="rgba(42,23,34,0.40)">
                NO MATCHES FOR “{query.trim()}”
              </Mono>
            </div>
          ) : (
            <div className="py-10 text-center">
              <Mono size={11} color="rgba(42,23,34,0.40)">
                NOTHING HERE YET
              </Mono>
            </div>
          ))}
      </div>

      {/* ─── Item customizer — sheet OR full-page based on source ─── */}
      <ItemModal
        open={Boolean(openItem)}
        item={openItem?.item ?? null}
        mode={openItem?.mode ?? "sheet"}
        onClose={() => setOpenItem(null)}
      />
    </motion.div>
  );
}

// Keep the existing default-export name for the router. Files that import
// `Menu` (capital M, from "../pages/Menu") still work.
export { MenuPage as Menu };
