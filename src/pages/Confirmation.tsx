import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../lib/api";
import { useCart } from "../lib/cartStore";
import { brand } from "../config/brand";
import type { OrderStatus } from "../types";
import { Display, Mono, Sticker } from "../components/ui/Typography";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";

/**
 * Confirmation — post-payment ticket screen.
 *
 *   ORDER CONFIRMED · TUE, MAY 12
 *   Thanks!
 *   It's rolling.            ← second line in pink
 *
 *   ┌─ Hot-pink ticket card ─────────────────┐
 *   │  YOUR TICKET     [PAYMENT CAPTURED]    │
 *   │                                        │
 *   │            A-247                       │
 *   │   Watch the in-store screen…           │
 *   │ — — — — — — — — — — — — — — —         │  ← perforation
 *   │  PICKUP                  ETA           │
 *   │  Wolfchase Galleria      ~8 min        │
 *   └────────────────────────────────────────┘
 *
 *   ┌─ STATUS ────────────────────────────────┐
 *   │  ✓ Paid                                 │
 *   │  ✓ Rolling now      (active)            │
 *   │  ○ Ready for pickup                     │
 *   └─────────────────────────────────────────┘
 *
 *   [ Order again ]
 *    Back to start
 *
 * Polls /api/orders/:orderId/status every 5s while mounted.
 * On mount, clears the cart so the next visit starts fresh.
 */

/** UI ladder used by the Status card. */
const STEPS = [
  { key: "paid", label: "Paid" },
  { key: "preparing", label: "Rolling now" },
  { key: "ready", label: "Ready for pickup" },
] as const;

/** Map server state → which step index is "active". */
function stepIndexFor(state: OrderStatus["state"] | undefined): number {
  switch (state) {
    case "paid":
      return 0;
    case "preparing":
      return 1;
    case "ready":
    case "completed":
      return 2;
    default:
      // pending_payment / cancelled / undefined → nothing checked yet
      return -1;
  }
}

export function Confirmation() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const clearCart = useCart((s) => s.clear);
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Once we land here, payment has succeeded — empty the cart so the
  // next visit starts fresh.
  useEffect(() => {
    clearCart();
  }, [clearCart]);

  // Poll status every 5s.
  useEffect(() => {
    if (!orderId) return;
    let stop = false;
    const poll = async () => {
      try {
        const s = await api.getOrderStatus(orderId);
        if (!stop) setStatus(s);
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
    };
    poll();
    const id = setInterval(poll, 5_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [orderId]);

  const ticket = status?.ticketNumber ?? "A-——";
  const activeIdx = stepIndexFor(status?.state);

  const dateLine = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen bg-rollo-paper px-5 pb-32 pt-14"
    >
      <Mono size={10}>
        ORDER CONFIRMED · {dateLine.toUpperCase()}
      </Mono>
      <Display size={32} className="mt-2">
        Thanks!
        <br />
        <span className="text-rollo-pink">It’s rolling.</span>
      </Display>

      {/* ─── Ticket card ─── */}
      <div className="relative mt-5 overflow-hidden rounded-rollo-ticket bg-rollo-pink px-5 py-6 text-white">
        {/* sprinkle dots */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-15"
          style={{
            background:
              "radial-gradient(circle at 20% 30%, #fff 2px, transparent 3px), radial-gradient(circle at 70% 60%, #fff 2px, transparent 3px), radial-gradient(circle at 40% 80%, #fff 1.5px, transparent 2.5px), radial-gradient(circle at 85% 25%, #fff 1.5px, transparent 2.5px)",
          }}
        />
        {/* perforation at 70% height */}
        <div
          aria-hidden
          className="absolute left-3.5 right-3.5 top-[70%] h-px"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(255,255,255,0.4) 50%, transparent 50%)",
            backgroundSize: "8px 1px",
          }}
        />

        <div className="relative flex items-start justify-between">
          <Mono size={10} color="rgba(255,255,255,0.85)">
            YOUR TICKET
          </Mono>
          <Sticker size="sm" bg="rgba(255,255,255,0.22)" fg="#fff">
            PAYMENT CAPTURED
          </Sticker>
        </div>

        <div className="relative mt-3 text-center font-display text-[88px] font-extrabold leading-[0.9] tracking-[-0.04em] text-white">
          {ticket}
        </div>
        <div className="relative mt-2 text-center font-body text-sm text-white/90">
          Watch the in-store screen for this number.
        </div>

        <div className="relative mt-6 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Mono size={9} color="rgba(255,255,255,0.7)">
              PICKUP
            </Mono>
            <div className="mt-0.5 truncate font-display text-sm font-bold">
              {brand.location}
            </div>
          </div>
          <div className="text-right">
            <Mono size={9} color="rgba(255,255,255,0.7)">
              ETA
            </Mono>
            <div className="mt-0.5 whitespace-nowrap font-display text-[18px] font-extrabold">
              ~8 min
            </div>
          </div>
        </div>
      </div>

      {/* ─── Status track ─── */}
      <div className="card-rollo mt-4 px-4 py-3.5">
        <Mono size={10}>STATUS</Mono>
        <div className="mt-2.5 flex flex-col gap-1">
          {STEPS.map((s, i) => {
            const done = i < activeIdx;
            const active = i === activeIdx;
            return (
              <div key={s.key} className="flex items-center gap-3 py-1.5">
                <div
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-white ${
                    done
                      ? "bg-rollo-green"
                      : active
                        ? "bg-rollo-pink"
                        : "bg-rollo-paper-soft"
                  }`}
                >
                  {(done || active) && <Icon.check className="h-3 w-3" />}
                </div>
                <div
                  className={`whitespace-nowrap font-display text-sm ${
                    active
                      ? "font-bold text-rollo-ink"
                      : done
                        ? "text-rollo-ink"
                        : "text-rollo-ink-muted"
                  }`}
                >
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-rollo-pink">
          Status check failed: {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <Button variant="primary" size="md" full onClick={() => navigate("/menu")}>
          Order again
        </Button>
        <Button variant="ghost" size="sm" full onClick={() => navigate("/")}>
          Back to start
        </Button>
      </div>
    </motion.div>
  );
}
