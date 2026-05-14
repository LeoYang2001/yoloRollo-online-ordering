import type { CartLine } from "../../types";
import { ProductPhoto } from "./ProductPhoto";
import { Icon } from "./Icon";

/**
 *   <CartItem/>    — one row in the cart card (photo + name + qty stepper)
 *   <QtyStepper/>  — small pink/white plus-minus pill (used in CartItem)
 *   <ReceiptRow/>  — label-on-left / value-on-right row for totals
 */

// ────────────────────────────────────────────────────────────────────
// QtyStepper — paper-soft outer, white minus, qty, pink plus.
// ────────────────────────────────────────────────────────────────────
interface QtyStepperProps {
  qty: number;
  onInc: () => void;
  onDec: () => void;
  disabled?: boolean;
}

export function QtyStepper({ qty, onInc, onDec, disabled }: QtyStepperProps) {
  return (
    <div
      className={`inline-flex items-center rounded-full bg-rollo-paper-soft p-0.5 ${disabled ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        onClick={onDec}
        disabled={disabled}
        aria-label="Decrease quantity"
        className="grid h-[26px] w-[26px] place-items-center rounded-full bg-rollo-card text-rollo-pink shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition active:scale-[0.95]"
      >
        <Icon.minus />
      </button>
      <div className="w-7 text-center font-display text-[13px] font-bold">
        {qty}
      </div>
      <button
        type="button"
        onClick={onInc}
        disabled={disabled}
        aria-label="Increase quantity"
        className="grid h-[26px] w-[26px] place-items-center rounded-full bg-rollo-pink text-white transition active:scale-[0.95]"
      >
        <Icon.plus />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// CartItem — one cart row with photo, name, modifiers, stepper, price.
// ────────────────────────────────────────────────────────────────────
interface CartItemProps {
  line: CartLine;
  onInc: () => void;
  onDec: () => void;
  onRemove: () => void;
  compact?: boolean;
}

export function CartItem({
  line,
  onInc,
  onDec,
  onRemove,
  compact,
}: CartItemProps) {
  return (
    <div
      className={`flex items-center gap-3 border-b border-dashed border-rollo-ink-line last:border-b-0 ${compact ? "py-2.5" : "py-3.5"}`}
    >
      <ProductPhoto flavor={line.flavor} size={compact ? 44 : 60} />

      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-sm font-bold text-rollo-ink">
          {line.itemName}
        </div>
        {line.modifiers.length > 0 && (
          <div className="mt-0.5 truncate text-[11px] text-rollo-ink-soft">
            {line.modifiers.map((m) => m.name).join(" · ")}
          </div>
        )}
        {!compact && (
          <div className="mt-2">
            <QtyStepper qty={line.quantity} onInc={onInc} onDec={onDec} />
          </div>
        )}
      </div>

      {/* Right column — price stacked on top, Remove text-link below it.
          Aligned to the top of the row so it lines up with the item
          name, mirroring the qty stepper on the left side. */}
      <div className="flex shrink-0 flex-col items-end gap-1 self-start">
        <div className="whitespace-nowrap font-display text-base font-extrabold tracking-[-0.02em] text-rollo-pink">
          ${(line.unitPrice * line.quantity).toFixed(2)}
        </div>
        {!compact && (
          <button
            type="button"
            onClick={onRemove}
            className="font-display text-xs text-rollo-ink-muted transition active:scale-[0.96]"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// ReceiptRow — Subtotal / Tax / Total line.
// `bold` styles it as the Total row (bigger, pink price).
// ────────────────────────────────────────────────────────────────────
interface ReceiptRowProps {
  label: string;
  value: string;
  bold?: boolean;
  hint?: string;
}

export function ReceiptRow({ label, value, bold, hint }: ReceiptRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <div
        className={`font-display ${
          bold
            ? "text-[15px] font-bold text-rollo-ink"
            : "text-[13px] font-medium text-rollo-ink-soft"
        }`}
      >
        {label}
        {hint && (
          <span className="ml-1.5 text-[11px] text-rollo-ink-muted">
            {hint}
          </span>
        )}
      </div>
      <div
        className={`font-display tracking-[-0.02em] ${
          bold
            ? "text-[20px] font-extrabold text-rollo-pink"
            : "text-sm font-bold text-rollo-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
