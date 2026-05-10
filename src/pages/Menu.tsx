import { useEffect, useMemo, useState } from "react";
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
  const [carouselIndex, setCarouselIndex] = useState(0);

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

  const arrivals = visibleItems.slice(0, 6);
  const carouselItems = menu?.items.slice(0, 6) ?? [];
  const currentCarouselItem = carouselItems[carouselIndex] ?? null;

  return (
    <div>
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="rounded-3xl bg-white p-4 shadow-sm"
      >
        <p className="font-display text-2xl leading-tight">
          <span>Fresh.</span> <span className="text-rollo-pink">Fun.</span>{" "}
          <span className="text-rollo-green">Rolled.</span>
        </p>
        <p className="mt-1 text-xs text-rollo-ink/65">
          {brand.subTagline} · {brand.location}
        </p>

        {currentCarouselItem && (
          <div className="mt-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={`carousel-container-${carouselIndex}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                drag="x"
                dragElastic={0.3}
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={(_, { offset, velocity }) => {
                  const swipe = offset.x * velocity.x;
                  if (swipe < -50 || (swipe < 0 && velocity.x < -100)) {
                    // Swipe left → next
                    setCarouselIndex(
                      (carouselIndex + 1) % carouselItems.length,
                    );
                  } else if (swipe > 50 || (swipe > 0 && velocity.x > 100)) {
                    // Swipe right → previous
                    setCarouselIndex(
                      (carouselIndex - 1 + carouselItems.length) %
                        carouselItems.length,
                    );
                  }
                }}
                className="group flex w-full cursor-grab flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-rollo-pink/20 to-rollo-green/20 active:cursor-grabbing"
              >
                <motion.button
                  onClick={() => {
                    setOpen(currentCarouselItem);
                    setOpenLayoutId(`carousel-${currentCarouselItem.id}`);
                  }}
                  whileTap={{ scale: 0.98 }}
                  className="flex w-full flex-col overflow-hidden"
                >
                  <div className="h-48 overflow-hidden bg-rollo-pink-soft">
                    <motion.div
                      layoutId={`carousel-${currentCarouselItem.id}`}
                      className="h-full w-full"
                    >
                      {currentCarouselItem.imageUrl ? (
                        <img
                          src={currentCarouselItem.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-6xl">
                          🍨
                        </div>
                      )}
                    </motion.div>
                  </div>
                  <div className="p-4 text-left">
                    <p className="font-semibold">{currentCarouselItem.name}</p>
                    {currentCarouselItem.description && (
                      <p className="mt-1 line-clamp-1 text-xs text-rollo-ink/60">
                        {currentCarouselItem.description}
                      </p>
                    )}
                    <p className="mt-2 font-semibold text-rollo-pink">
                      ${currentCarouselItem.price.toFixed(2)}
                    </p>
                  </div>
                </motion.button>
              </motion.div>
            </AnimatePresence>

            {carouselItems.length > 1 && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  onClick={() =>
                    setCarouselIndex(
                      (carouselIndex - 1 + carouselItems.length) %
                        carouselItems.length,
                    )
                  }
                  className="grid h-8 w-8 place-items-center rounded-full bg-white text-rollo-pink shadow-sm"
                >
                  ←
                </button>
                <div className="flex gap-1">
                  {carouselItems.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCarouselIndex(i)}
                      className={`h-2 rounded-full transition ${
                        i === carouselIndex
                          ? "w-6 bg-rollo-pink"
                          : "w-2 bg-rollo-ink/20"
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={() =>
                    setCarouselIndex((carouselIndex + 1) % carouselItems.length)
                  }
                  className="grid h-8 w-8 place-items-center rounded-full bg-white text-rollo-pink shadow-sm"
                >
                  →
                </button>
              </div>
            )}
          </div>
        )}
      </motion.section>

      {menu && menu.categories.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.2, ease: "easeOut" }}
          className="mt-4 rounded-3xl bg-white p-4 shadow-sm"
        >
          <h2 className="font-display text-xl mb-3">All</h2>

          <div className="mb-4">
            <label className="flex h-11 items-center rounded-2xl bg-rollo-ink/5 px-3 text-rollo-ink/50">
              <span className="text-sm">🔍</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search item"
                aria-label="Search item"
                className="ml-2 w-full bg-transparent text-sm text-rollo-ink placeholder:text-rollo-ink/50 focus:outline-none"
              />
            </label>
          </div>

          <nav className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {menu.categories.map((c) => (
              <motion.button
                key={c}
                onClick={() => setActiveCat(c)}
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

          <AnimatePresence mode="wait">
            <motion.ul
              key={`${activeCat ?? "all"}-${query.trim().toLowerCase()}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="grid grid-cols-2 gap-3"
            >
              {arrivals.map((item) => (
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
              ))}
            </motion.ul>
          </AnimatePresence>

          {arrivals.length === 0 && (
            <p className="text-sm text-rollo-ink/60">
              No items found
              {query.trim() ? ` for "${query.trim()}"` : " in this category"}.
            </p>
          )}
        </motion.section>
      )}

      {error && (
        <div className="mt-4 rounded-2xl bg-rollo-pink-soft p-4 text-sm text-rollo-pink">
          Couldn’t load menu — {error}
        </div>
      )}

      {!menu && !error && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-2xl bg-white/70"
            />
          ))}
        </div>
      )}

      {/* {menu && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.2, ease: "easeOut" }}
          className="mt-4 rounded-3xl bg-white p-4 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl">All</h2>
            <span className="text-xs font-semibold text-rollo-pink">
              See more
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.ul
              key={`${activeCat ?? "all"}-${query.trim().toLowerCase()}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="grid grid-cols-2 gap-3"
            >
              {arrivals.map((item) => (
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
              ))}
            </motion.ul>
          </AnimatePresence>

          {arrivals.length === 0 && (
            <p className="text-sm text-rollo-ink/60">
              No items found
              {query.trim() ? ` for "${query.trim()}"` : " in this category"}.
            </p>
          )}
        </motion.section>
      )} */}

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
