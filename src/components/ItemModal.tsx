import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MenuItem, Modifier, ModifierGroup } from "../types";
import { useCart } from "../lib/cartStore";
import { flyToCart } from "../lib/flyToCart";

interface Props {
  item: MenuItem;
  onClose: () => void;
  layoutId?: string;
}

/**
 * Customizer modal — enforces min/max selections per modifier group
 * and live-recalculates the line price as the user picks.
 */
export function ItemModal({ item, onClose, layoutId }: Props) {
  const addItem = useCart((s) => s.addItem);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [notes, setNotes] = useState("");
  const heroRef = useRef<HTMLDivElement | null>(null);

  const toggle = (group: ModifierGroup, mod: Modifier) => {
    setSelected((prev) => {
      const cur = new Set(prev[group.id] ?? []);
      if (cur.has(mod.id)) {
        cur.delete(mod.id);
      } else {
        if (group.maxSelections === 1) cur.clear();
        if (cur.size >= group.maxSelections) return prev;
        cur.add(mod.id);
      }
      return { ...prev, [group.id]: cur };
    });
  };

  const chosenMods: Modifier[] = useMemo(() => {
    const out: Modifier[] = [];
    for (const g of item.modifierGroups) {
      const ids = selected[g.id] ?? new Set<string>();
      for (const m of g.modifiers) if (ids.has(m.id)) out.push(m);
    }
    return out;
  }, [selected, item.modifierGroups]);

  const linePrice =
    item.price + chosenMods.reduce((s, m) => s + m.priceDelta, 0);

  const allGroupsValid = item.modifierGroups.every((g) => {
    const n = selected[g.id]?.size ?? 0;
    return n >= g.minSelections && n <= g.maxSelections;
  });

  const handleAdd = () => {
    const from = heroRef.current?.getBoundingClientRect();
    if (from) {
      flyToCart({
        from,
        imageSrc: item.imageUrl,
      });
    }
    addItem(item, chosenMods, notes.trim() || undefined);
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <div />
            <button
              aria-label="Close"
              onClick={onClose}
              className="rounded-full p-2 text-rollo-ink/60 hover:bg-rollo-pink-soft"
            >
              ✕
            </button>
          </div>

          <motion.div
            ref={heroRef}
            layoutId={layoutId || `arrival-${item.id}`}
            className="mb-4 h-40 overflow-hidden rounded-2xl bg-rollo-pink-soft"
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-6xl">
                🍨
              </div>
            )}
          </motion.div>

          <div>
            <h2 className="font-display text-2xl">{item.name}</h2>
            {item.description && (
              <p className="mt-1 text-sm text-rollo-ink/70">
                {item.description}
              </p>
            )}
          </div>

          {item.modifierGroups.map((group) => (
            <section key={group.id} className="mt-5">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">{group.name}</h3>
                <span className="text-xs text-rollo-ink/60">
                  {group.minSelections === group.maxSelections
                    ? `Choose ${group.maxSelections}`
                    : `Choose ${group.minSelections}–${group.maxSelections}`}
                </span>
              </div>
              <div className="mt-2 grid gap-2">
                {group.modifiers.map((m) => {
                  const isSelected = selected[group.id]?.has(m.id) ?? false;
                  return (
                    <label
                      key={m.id}
                      className={`flex cursor-pointer items-center justify-between rounded-2xl border-2 px-4 py-2.5 transition ${
                        isSelected
                          ? "border-rollo-pink bg-rollo-pink-soft"
                          : "border-rollo-ink/10 bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type={
                            group.maxSelections === 1 ? "radio" : "checkbox"
                          }
                          name={group.id}
                          checked={isSelected}
                          onChange={() => toggle(group, m)}
                          className="h-4 w-4 accent-rollo-pink"
                        />
                        <span>{m.name}</span>
                      </div>
                      <span className="text-sm text-rollo-ink/70">
                        {m.priceDelta > 0
                          ? `+$${m.priceDelta.toFixed(2)}`
                          : m.priceDelta < 0
                            ? `-$${Math.abs(m.priceDelta).toFixed(2)}`
                            : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="mt-5">
            <h3 className="font-semibold">Special instructions</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Allergies, less sweet, extra strawberries…"
              className="mt-2 w-full rounded-2xl border-2 border-rollo-ink/10 bg-white p-3 text-sm focus:border-rollo-pink focus:outline-none"
            />
          </section>

          <div className="sticky bottom-0 mt-6 -mx-5 -mb-5 rounded-b-3xl bg-white p-4 pt-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.1)]">
            <button
              disabled={!allGroupsValid}
              onClick={handleAdd}
              className="btn-primary w-full"
            >
              Add to cart · ${linePrice.toFixed(2)}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
