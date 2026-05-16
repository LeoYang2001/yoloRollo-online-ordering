import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "../lib/cartStore";
import { brand } from "../config/brand";
import { useQueueEstimate } from "../lib/useQueueEstimate";
import { Header, EmptyState } from "../components/ui/Layout";
import { Mono, Sticker } from "../components/ui/Typography";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { CartItem, ReceiptRow } from "../components/ui/CartItem";

/**
 * Cart — line items + pickup eta + totals + Continue to checkout.
 *
 *   ┌─ Header (← back · "Your bag") ──────────
 *   │  N ITEMS · WOLFCHASE · MEMPHIS
 *   │  ┌─ Cart card ─────────────────────┐
 *   │  │ photo · name · qty · price …    │
 *   │  └─────────────────────────────────┘
 *   │  ┌─ Pickup card (rose) ────────────┐
 *   │  │ PICKUP IN · ~8 min · Wolfchase  │
 *   │  └─────────────────────────────────┘
 *   │  ┌─ Totals card ───────────────────┐
 *   │  │ Subtotal / Tax / Total          │
 *   │  └─────────────────────────────────┘
 *   │  [ Continue to checkout → ]
 *   │   Add more items
 */
export function Cart() {
  const lines = useCart((s) => s.lines);
  const subtotal = useCart((s) => s.subtotal());
  const setQuantity = useCart((s) => s.setQuantity);
  const removeLine = useCart((s) => s.removeLine);
  const navigate = useNavigate();
  // Live pickup-wait estimate from /api/queue (computed off paid Clover
  // orders). placed=false because the customer hasn't paid yet — the
  // API adds 1 ticket's prep time.
  const { estimate } = useQueueEstimate({ placed: false });
  const etaMinutes = estimate?.minutes;

  // Local tax estimate using the merchant's configured rate; Clover
  // re-calculates the precise tax during Hosted Checkout.
  const taxEstimate = +(subtotal * brand.taxRate).toFixed(2);
  const total = +(subtotal + taxEstimate).toFixed(2);

  // ─── Empty state ──────────────────────────────────────────────
  if (lines.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="min-h-screen bg-rollo-paper"
      >
        <Header title="Your bag" onBack={() => navigate("/menu")} />
        <EmptyState
          title="Bag is empty"
          sub="Pick a flavor and we’ll roll it up."
          cta="Browse the menu"
          onCta={() => navigate("/menu")}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen bg-rollo-paper pb-32"
    >
      <Header title="Your bag" onBack={() => navigate("/menu")} />

      <div className="px-5">
        <Mono size={10} color="rgba(42,23,34,0.62)">
          {lines.length} {lines.length === 1 ? "ITEM" : "ITEMS"} · WOLFCHASE · MEMPHIS
        </Mono>

        {/* ─── Cart card ─── */}
        <div className="card-rollo mt-2.5 px-4">
          <AnimatePresence initial={false}>
            {lines.map((line) => (
              <motion.div
                key={line.lineId}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <CartItem
                  line={line}
                  onInc={() => setQuantity(line.lineId, line.quantity + 1)}
                  onDec={() => setQuantity(line.lineId, line.quantity - 1)}
                  onRemove={() => removeLine(line.lineId)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* ─── Pickup card (rose) ─── */}
        <div className="relative mt-4 overflow-hidden rounded-rollo-card bg-rollo-rose px-4 py-4 text-white shadow-rollo-rose">
          <div className="absolute -right-8 -top-8 h-[120px] w-[120px] rounded-full bg-white/10" />
          <div className="relative flex items-start justify-between gap-2.5">
            <div className="min-w-0">
              <Mono size={10} color="rgba(255,255,255,0.7)">
                PICKUP IN
              </Mono>
              <div className="mt-1 whitespace-nowrap font-display text-[30px] font-extrabold tracking-[-0.02em]">
                {etaMinutes != null ? `~${etaMinutes} min` : "~8 min"}
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 text-white/85">
                <Icon.pin />
                <span className="font-body text-[13px]">
                  {brand.location}
                </span>
              </div>
            </div>
            <Sticker size="md" bg="#FCD86F" fg="#2A1722">
              FAST LANE
            </Sticker>
          </div>
        </div>

        {/* ─── Totals card ─── */}
        <div className="card-rollo mt-4 px-4 py-3.5">
          <ReceiptRow label="Subtotal" value={`$${subtotal.toFixed(2)}`} />
          <ReceiptRow
            label="Tax"
            hint={`(est. ${(brand.taxRate * 100).toFixed(2)}%)`}
            value={`$${taxEstimate.toFixed(2)}`}
          />
          <div className="my-2 border-t border-dashed border-rollo-ink-line" />
          <ReceiptRow label="Total" value={`$${total.toFixed(2)}`} bold />
        </div>

        {/* ─── CTAs ─── */}
        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            full
            onClick={() => navigate("/checkout")}
          >
            Continue to checkout
            <Icon.arrow />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            full
            onClick={() => navigate("/menu")}
          >
            Add more items
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
