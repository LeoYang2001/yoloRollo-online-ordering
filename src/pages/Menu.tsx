import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../lib/api";
import type { Menu as MenuT, MenuItem } from "../types";
import { inferFlavor } from "../lib/flavors";
import { useCart } from "../lib/cartStore";
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
function isSignatureSpecial(item: MenuItem): boolean {
  return /^signature\s+roll/i.test(item.name);
}
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
    id: "signatures",
    short: "Signature Rolls",
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
  {
    id: "drinks",
    short: "Drinks",
    icon: "cup",
    sub: "Cold & refreshing",
    match: (i) => i.category === "Cold Drinks" || i.category === "Drinks",
  },
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

// Helper: enrich a raw Clover MenuItem with the design-specific fields
// (flavor key, tags). Returns a new object so downstream components can
// rely on them being present.
function enrich(item: MenuItem): MenuItem {
  return {
    ...item,
    flavor: item.flavor ?? inferFlavor(item.name),
    tags: inferTags(item),
    tagline: item.tagline ?? item.description,
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
  // on ProductCard for a "×N in cart" indicator.
  const cartLines = useCart((s) => s.lines);
  const cartCountByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of cartLines) {
      map.set(l.itemId, (map.get(l.itemId) ?? 0) + l.quantity);
    }
    return map;
  }, [cartLines]);

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
                  // Grid tap → bottom sheet customizer.
                  onClick={() => setOpenItem({ item, mode: "sheet" })}
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
