import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../lib/api";
import { brand } from "../config/brand";
import type { Menu as MenuT, MenuItem } from "../types";
import { ItemModal } from "../components/ItemModal";

export function Menu() {
  const [menu, setMenu] = useState<MenuT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [open, setOpen] = useState<MenuItem | null>(null);
  const [openLayoutId, setOpenLayoutId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Featured carousel state. activeIndex is the dot indicator, driven by
  // which card is currently centered in the scroll viewport (set by an
  // IntersectionObserver below). The scrollerRef gives us the snap container.
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // The menu list below the carousel is its own scroll viewport.
  const menuScrollRef = useRef<HTMLDivElement>(null);
  const [isTopCollapsed, setIsTopCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getMenu()
      .then((m) => {
        if (cancelled) return;
        setMenu(m);
        setActiveCat(m.categories[0] ?? null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleItems = useMemo(() => {
    if (!menu) return [];
    const categoryFiltered = !activeCat
      ? menu.items
      : menu.items.filter((i) => i.category === activeCat);
    const q = query.trim().toLowerCase();
    if (!q) return categoryFiltered;
    return categoryFiltered.filter((i) => {
      const haystack =
        `${i.name} ${i.description ?? ""} ${i.category}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [menu, activeCat, query]);

  // When the Rolled Ice Cream tab is active, split items into three labeled
  // subsections to match the in-store menu board structure. Items that don't
  // match any pattern (e.g. Small Rolls if Clover still has them) land in
  // an "Other" group so nothing silently disappears.
  const rolledSections = useMemo(() => {
    if (activeCat !== "Rolled Ice Cream") return null;
    const signatures = visibleItems.filter((i) =>
      i.name.startsWith("Yolo Signature"),
    );
    const specials = visibleItems.filter((i) =>
      /^Signature Roll #\d/.test(i.name),
    );
    const byo = visibleItems.filter(
      (i) => i.name === "Customize Your Own Roll",
    );
    const assigned = new Set([...signatures, ...specials, ...byo]);
    const other = visibleItems.filter((i) => !assigned.has(i));
    return { signatures, specials, byo, other };
  }, [activeCat, visibleItems]);

  // Featured = the two Yolo Signatures + the first three Signature Rolls.
  // Name-based so it survives Clover ID changes; falls back gracefully if
  // some items aren't present (e.g. before the reorganization script runs).
  const featured = useMemo(() => {
    if (!menu) return [];
    const yoloSigs = menu.items.filter((i) =>
      i.name.startsWith("Yolo Signature"),
    );
    const sigRolls = menu.items
      .filter((i) => /^Signature Roll #\d/.test(i.name))
      .slice(0, 3);
    return [...yoloSigs, ...sigRolls];
  }, [menu]);

  // Drive the active dot indicator from which card is currently centered
  // in the scroll viewport. IntersectionObserver does the math for us so
  // we don't need scroll listeners or rAF throttling.
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || featured.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Of the cards intersecting, pick the one with the highest ratio.
        let bestIdx: number | null = null;
        let bestRatio = 0;
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > bestRatio) {
            bestRatio = e.intersectionRatio;
            bestIdx = Number((e.target as HTMLElement).dataset.idx);
          }
        }
        if (bestIdx !== null) setActiveIndex(bestIdx);
      },
      { root, threshold: [0.5, 0.75, 1] },
    );
    root
      .querySelectorAll<HTMLElement>("[data-idx]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [featured.length]);

  const scrollToIndex = (i: number) => {
    const card = scrollerRef.current?.querySelector<HTMLElement>(
      `[data-idx="${i}"]`,
    );
    card?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  };

  const handleBottomScroll = () => {
    const y = menuScrollRef.current?.scrollTop ?? 0;
    // Snap behavior: scroll only COLLAPSES; expand is tap-only to avoid
    // scroll jitter (especially after programmatic scrollToTop on tab change).
    if (!isTopCollapsed && y > 6) {
      setIsTopCollapsed(true);
    }
  };

  const handleTopTap = () => {
    // Tap top section to snap back to expanded layout.
    menuScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    setIsTopCollapsed(false);
  };

  return (
    // Outer column fills the viewport between the sticky header and the
    // bottom edge. The 92px subtracts the sticky header + main's pt-2.
    // Use 100dvh (dynamic vh) so iOS browser chrome doesn't clip us.
    <div className="flex h-[calc(100dvh-92px)] flex-col gap-3">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        onClick={handleTopTap}
        animate={{
          height: isTopCollapsed ? 74 : 380,
          opacity: 1,
          y: 0,
        }}
        transition={{
          height: { type: "spring", stiffness: 280, damping: 30 },
          opacity: { duration: 0.16 },
          y: { duration: 0.16 },
        }}
        className="flex shrink-0 flex-col overflow-hidden rounded-3xl bg-white shadow-sm"
      >
        {isTopCollapsed ? (
          <div className="flex h-full items-center px-4">
            <div className="flex w-full items-center justify-between rounded-full bg-rollo-pink-soft px-4 py-2.5">
              <p className="text-sm font-semibold text-rollo-ink">
                Tap to view today’s best sellers
              </p>
              <span className="text-lg text-rollo-pink">↑</span>
            </div>
          </div>
        ) : (
          <>
            {/* Brand greeting */}
            <motion.div
              animate={{ opacity: 1, maxHeight: 70 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="shrink-0 overflow-hidden px-4 pt-4"
            >
              <p className="font-display text-2xl leading-tight">
                <span>Fresh.</span>{" "}
                <span className="text-rollo-pink">Fun.</span>{" "}
                <span className="text-rollo-green">Rolled.</span>
              </p>
              <p className="mt-1 text-xs text-rollo-ink/65">
                {brand.subTagline} · {brand.location}
              </p>
            </motion.div>

            {featured.length > 0 && (
              <div className="mt-3 flex min-h-0 flex-1 flex-col">
                {/* Native CSS scroll-snap carousel.
                - `overflow-x-auto` + `snap-x snap-mandatory` on the scroller
                - `snap-center` + `shrink-0` on each card
                Mobile users swipe; trackpad users scroll; momentum + snap
                are handled by the browser. We bleed past the card padding
                with negative margin so peek-edges of neighbors show. */}
                <div
                  ref={scrollerRef}
                  className="min-h-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory"
                >
                  <ul className="flex h-full gap-3 px-4">
                    {featured.map((item, i) => (
                      <li
                        key={item.id}
                        data-idx={i}
                        className="snap-center shrink-0 w-[72vw] max-w-[280px] h-full"
                      >
                        <motion.button
                          onClick={() => {
                            setOpen(item);
                            setOpenLayoutId(`featured-${item.id}`);
                          }}
                          whileTap={{ scale: 0.98 }}
                          className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl bg-rollo-pink text-left text-white shadow-rollo"
                        >
                          {/* Top: title + price — always visible. At collapsed
                          state this becomes the mini-banner content; the
                          py-3 keeps it visually centered when the card
                          shrinks to its title-only strip form. */}
                          <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3">
                            <p className="font-display text-base leading-tight line-clamp-2">
                              {item.name}
                            </p>
                            <p className="font-display text-base font-bold leading-tight whitespace-nowrap">
                              ${item.price.toFixed(2)}
                            </p>
                          </div>

                          {/* Middle: product image — fades and shrinks with the
                          section height. */}
                          <motion.div
                            layoutId={`featured-${item.id}`}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.16, ease: "easeOut" }}
                            className="flex min-h-0 flex-1 items-end justify-center px-4 pb-3"
                          >
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt=""
                                className="h-full w-full object-contain drop-shadow-xl"
                              />
                            ) : (
                              <div className="grid h-full w-full place-items-center text-[5rem] leading-none">
                                🍨
                              </div>
                            )}
                          </motion.div>

                          {/* Floating bag button bottom-right — fades with billboard */}
                          <motion.span
                            aria-hidden
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.16, ease: "easeOut" }}
                            className="absolute bottom-4 right-4 grid h-10 w-10 place-items-center rounded-full bg-white text-rollo-pink shadow-md"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-5 w-5"
                            >
                              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                              <line x1="3" y1="6" x2="21" y2="6" />
                              <path d="M16 10a4 4 0 0 1-8 0" />
                            </svg>
                          </motion.span>
                        </motion.button>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Dot indicators — always visible, pinned to the section bottom. */}
                {featured.length > 1 && (
                  <div className="shrink-0 py-2 flex justify-center gap-1.5">
                    {featured.map((_, i) => (
                      <button
                        key={i}
                        aria-label={`Show featured item ${i + 1}`}
                        onClick={() => scrollToIndex(i)}
                        className={`h-2 rounded-full transition-all ${
                          i === activeIndex
                            ? "w-6 bg-rollo-pink"
                            : "w-2 bg-rollo-ink/20"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </motion.section>

      {/* Bottom panel — ALWAYS mounted so useScroll({ container: menuScrollRef })
          can attach its scroll listener on first paint. The menu content is
          conditional inside; the scrollable shell is not. */}
      <motion.section
        ref={menuScrollRef}
        onScroll={handleBottomScroll}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04, duration: 0.2, ease: "easeOut" }}
        // Padding is moved INTO inner sections so the sticky search/tabs
        // bar can extend edge-to-edge across the white panel.
        className="min-h-0 flex-1 overflow-y-auto rounded-3xl bg-white shadow-sm"
      >
        {menu && menu.categories.length > 0 && (
          <>
            {/* Sticky control bar — search + category tabs.
              `position: sticky top-0` pins it to the top of THIS scroll
              container (not the viewport), so items scroll under it while
              the controls stay in sight. The blur backdrop + bg/85 keeps
              items legible as they slide behind. */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 pt-3 pb-2 border-b border-rollo-ink/5">
              <label className="flex h-10 items-center rounded-full bg-rollo-ink/5 px-3 text-rollo-ink/50">
                <span className="text-sm">🔍</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search item"
                  aria-label="Search item"
                  className="ml-2 w-full bg-transparent text-sm text-rollo-ink placeholder:text-rollo-ink/50 focus:outline-none"
                />
              </label>

              <nav className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {menu.categories.map((c) => (
                  <motion.button
                    key={c}
                    onClick={() => {
                      setActiveCat(c);

                      // Always reset item list to top on category change.
                      // Top panel state is preserved.
                      menuScrollRef.current?.scrollTo({
                        top: 0,
                        behavior: "auto",
                      });
                    }}
                    whileTap={{ scale: 0.96 }}
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      activeCat === c
                        ? "border-rollo-pink bg-rollo-pink text-white"
                        : "border-rollo-ink/10 bg-rollo-ink/5 text-rollo-ink/80"
                    }`}
                  >
                    {c}
                  </motion.button>
                ))}
              </nav>
            </div>

            {/* Items area — padded on x and given a bottom pad so the last
              item clears the floating cart button. */}
            <div className="px-4 pt-3 pb-24">
              {/* Item card factored as a render helper so the Rolled Ice Cream
              tab can show 3 labeled subsections without duplicating markup. */}
              {(() => {
                const renderCard = (item: MenuItem) => (
                  <motion.li
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    <motion.button
                      onClick={() => {
                        setOpen(item);
                        setOpenLayoutId(`arrival-${item.id}`);
                      }}
                      disabled={!item.available}
                      whileTap={{ scale: 0.98 }}
                      className="flex h-full w-full flex-col rounded-2xl bg-rollo-ink/5 p-2.5 text-left disabled:opacity-50"
                    >
                      <motion.div
                        layoutId={`arrival-${item.id}`}
                        className="h-24 overflow-hidden rounded-xl bg-white"
                      >
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-3xl">
                            🍦
                          </div>
                        )}
                      </motion.div>
                      <p className="mt-2 line-clamp-1 text-sm font-semibold">
                        {item.name}
                      </p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-sm font-semibold text-rollo-pink">
                          ${item.price.toFixed(2)}
                        </span>
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-rollo-pink text-xs text-white">
                          +
                        </span>
                      </div>
                    </motion.button>
                  </motion.li>
                );

                const subsection = (
                  label: string,
                  sublabel: string | null,
                  items: MenuItem[],
                ) =>
                  items.length === 0 ? null : (
                    <div key={label}>
                      <div className="mb-2 flex items-baseline gap-2">
                        <h3 className="font-display text-lg">{label}</h3>
                        {sublabel && (
                          <span className="text-xs text-rollo-ink/55">
                            {sublabel}
                          </span>
                        )}
                      </div>
                      <ul className="grid grid-cols-2 gap-3">
                        {items.map(renderCard)}
                      </ul>
                    </div>
                  );

                return (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${activeCat ?? "all"}-${query.trim().toLowerCase()}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      {rolledSections ? (
                        <div className="space-y-5">
                          {subsection(
                            "Signatures",
                            "$8.99 · modify mix-in & topping",
                            rolledSections.signatures,
                          )}
                          {subsection(
                            "Specials",
                            "$6.99 · modify mix-in & topping",
                            rolledSections.specials,
                          )}
                          {subsection(
                            "Build Your Own",
                            "$6.99 · pick base → mix-in → topping",
                            rolledSections.byo,
                          )}
                          {subsection("More", null, rolledSections.other)}
                        </div>
                      ) : (
                        <ul className="grid grid-cols-2 gap-3">
                          {visibleItems.map(renderCard)}
                        </ul>
                      )}
                    </motion.div>
                  </AnimatePresence>
                );
              })()}

              {visibleItems.length === 0 && (
                <p className="text-sm text-rollo-ink/60">
                  No items found
                  {query.trim()
                    ? ` for "${query.trim()}"`
                    : " in this category"}
                  .
                </p>
              )}
            </div>
          </>
        )}
      </motion.section>

      {error && (
        <div className="mt-4 rounded-2xl bg-rollo-pink-soft p-4 text-sm text-rollo-pink">
          Couldn’t load menu — {error}
        </div>
      )}

      {!menu && !error && (
        <div className="flex h-full flex-col gap-3">
          {/* Top section skeleton */}
          <div className="h-[380px] overflow-hidden rounded-3xl bg-white p-4 shadow-sm">
            <div className="h-8 w-40 animate-pulse rounded-xl bg-rollo-ink/10" />
            <div className="mt-2 h-3 w-44 animate-pulse rounded-lg bg-rollo-ink/10" />

            <div className="mt-4 flex h-[280px] gap-3 overflow-hidden">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="w-[72vw] max-w-[280px] animate-pulse rounded-3xl bg-rollo-pink/25"
                />
              ))}
            </div>
          </div>

          {/* Bottom section skeleton */}
          <div className="min-h-0 flex-1 overflow-hidden rounded-3xl bg-white shadow-sm">
            <div className="border-b border-rollo-ink/5 px-4 pb-2 pt-3">
              <div className="h-10 animate-pulse rounded-full bg-rollo-ink/10" />
              <div className="mt-2 flex gap-2 overflow-hidden">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-8 w-24 animate-pulse rounded-full bg-rollo-ink/10"
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 px-4 pb-24 pt-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-44 animate-pulse rounded-2xl bg-rollo-ink/8"
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {open && (
        <ItemModal
          item={open}
          onClose={() => {
            setOpen(null);
            setOpenLayoutId(null);
          }}
          layoutId={openLayoutId ?? undefined}
        />
      )}
    </div>
  );
}
