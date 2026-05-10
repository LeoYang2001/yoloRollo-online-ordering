/**
 * Cart state — Zustand with localStorage persistence so a customer can
 * scroll the menu, navigate around, and not lose their order.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine, MenuItem, Modifier } from "../types";

interface CartState {
  lines: CartLine[];
  addItem: (
    item: MenuItem,
    selectedModifiers: Modifier[],
    notes?: string,
  ) => void;
  removeLine: (lineId: string) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  clear: () => void;
  subtotal: () => number;
  totalQuantity: () => number;
}

const newLineId = () =>
  // Stable enough for cart line dedupe; not crypto-strength.
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],

      addItem: (item, selectedModifiers, notes) => {
        const unitPrice =
          item.price +
          selectedModifiers.reduce((sum, m) => sum + m.priceDelta, 0);
        const line: CartLine = {
          lineId: newLineId(),
          itemId: item.id,
          itemName: item.name,
          unitPrice,
          quantity: 1,
          modifiers: selectedModifiers.map((m) => ({
            id: m.id,
            name: m.name,
            priceDelta: m.priceDelta,
          })),
          notes,
        };
        set({ lines: [...get().lines, line] });
      },

      removeLine: (lineId) =>
        set({ lines: get().lines.filter((l) => l.lineId !== lineId) }),

      setQuantity: (lineId, quantity) =>
        set({
          lines: get().lines.map((l) =>
            l.lineId === lineId
              ? { ...l, quantity: Math.max(1, Math.min(20, quantity)) }
              : l,
          ),
        }),

      clear: () => set({ lines: [] }),

      subtotal: () =>
        get().lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),

      totalQuantity: () => get().lines.reduce((sum, l) => sum + l.quantity, 0),
    }),
    { name: "yolo-rollo-cart" },
  ),
);
