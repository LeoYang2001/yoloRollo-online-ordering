import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../lib/api";
import { useCart } from "../lib/cartStore";
import { brand } from "../config/brand";
import { useQueueEstimate } from "../lib/useQueueEstimate";
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

/** UI ladder used by the Status card. The status text drives the
 *  customer's confidence that the order is moving — kept friendly
 *  but generic so it works for rolled ice cream, bubble teas, and
 *  smoothies alike. */
const STEPS = [
  { key: "paid", label: "Order received" },
  { key: "preparing", label: "Making your order" },
  { key: "ready", label: "Ready for pickup" },
] as const;

/** Compact "how long ago" formatter for the live update indicator. */
function timeAgo(ts: number): string {
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  return `${min}m ago`;
}

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
  const { orderId: paramOrderId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const clearCart = useCart((s) => s.clear);
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Two ways the orderId can arrive here:
  //   1. `/confirmation/:orderId` path param — used by the inline
  //      payment path (we pre-create the order, know its ID).
  //   2. `/confirmation?order_id=…` query param — used by Clover's
  //      Hosted Checkout success redirect (Clover assigns its own
  //      order ID on payment and appends it as a query param).
  // We accept either. Both Clover variants of the param name
  // (`order_id`, `orderId`) get checked. Values that look like an
  // un-substituted Clover placeholder (e.g. literal "{order_id}") are
  // ignored — happens when Clover's templated-redirect support is off
  // on a given merchant, in which case Clover should also auto-append
  // a real order_id alongside the literal one.
  const isReal = (v: string | null | undefined): v is string =>
    !!v && !v.startsWith("{");
  const orderId = useMemo(() => {
    const candidates = [
      paramOrderId,
      searchParams.get("order_id"),
      searchParams.get("orderId"),
    ];
    for (const c of candidates) {
      if (isReal(c)) return c;
    }
    return "";
  }, [paramOrderId, searchParams]);

  // Fallback: if Clover redirected without a real order_id (its
  // Hosted Checkout for this merchant ignores the {order_id}
  // placeholder AND doesn't auto-append), look up which order got
  // created for our checkout session id (stashed in sessionStorage
  // before we redirected).
  //
  // We also forward the Decision-C correlation id (cid) that the
  // server embedded into the Clover order's customer.firstName when
  // creating the Hosted Checkout session. The lookup endpoint's Path
  // 2 uses it to pick the exact order from the recent-orders list
  // rather than guessing by recency. If KV-via-webhook (Path 0) or
  // Clover-session-GET (Path 1) succeeds first, cid is ignored.
  useEffect(() => {
    if (orderId) return;
    const sessionId = sessionStorage.getItem("yolo-rollo-pending-order");
    if (!sessionId || sessionId.startsWith("{")) return;
    const cid = sessionStorage.getItem("yolo-rollo-correlation-id") ?? "";

    let cancelled = false;
    // Try at 0, 0.7, 1.5, 2.5, 4, 6, 9, 13s — total ~13s of patience.
    const delays = [0, 700, 1500, 2500, 4000, 6000, 9000, 13000];

    const tryFetch = async (attempt: number) => {
      if (cancelled || attempt >= delays.length) return;
      try {
        const url =
          `/api/checkout-session/${encodeURIComponent(sessionId)}` +
          (cid ? `?cid=${encodeURIComponent(cid)}` : "");
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as { orderId?: string | null };
        if (cancelled) return;
        if (data.orderId) {
          navigate(
            `/confirmation?order_id=${encodeURIComponent(data.orderId)}`,
            { replace: true },
          );
          return;
        }
        // No order yet — schedule the next retry with the configured
        // delay before this attempt.
        if (attempt + 1 < delays.length) {
          setTimeout(() => tryFetch(attempt + 1), delays[attempt + 1]);
        }
      } catch {
        if (attempt + 1 < delays.length) {
          setTimeout(() => tryFetch(attempt + 1), delays[attempt + 1]);
        }
      }
    };
    tryFetch(0);

    return () => {
      cancelled = true;
    };
  }, [orderId, navigate]);

  // Live ETA from /api/queue (computed off paid Clover orders).
  // placed=true since the order is already in the queue at this point.
  const { estimate } = useQueueEstimate({ placed: true });
  const etaMinutes = estimate?.minutes;

  // Once we land here, payment has succeeded — empty the cart so the
  // next visit starts fresh.
  useEffect(() => {
    clearCart();
  }, [clearCart]);

  // Rename the order's title to "Online: <name>" right after Clover
  // creates it via Hosted Checkout. This is the post-payment hook
  // that gives the kitchen a human-readable ticket name instead of
  // the random alphanumeric Clover assigns. Fire-and-forget.
  useEffect(() => {
    if (!orderId) return;
    const name = sessionStorage.getItem("yolo-rollo-customer-name");
    if (!name) return;
    fetch(
      `/api/orders/${encodeURIComponent(orderId)}/title`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Online: ${name}` }),
      },
    ).catch(() => {
      /* non-blocking — if it fails the kitchen still sees the order */
    });
    // Wipe so refreshing the page doesn't keep renaming the same order.
    sessionStorage.removeItem("yolo-rollo-customer-name");
  }, [orderId]);

  // Status polling — fast then slow.
  //
  // The first ~30 seconds after a customer lands here are when the
  // order moves fastest through Clover (pending_payment → paid →
  // preparing). We poll every 2s during that window so the status
  // card + ticket number snap into place near-instantly. After 30s
  // we back off to 5s — by then the order is in steady "preparing"
  // state and there's no UX benefit to chatty polling.
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  useEffect(() => {
    if (!orderId) return;
    let stop = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    const poll = async () => {
      try {
        const s = await api.getOrderStatus(orderId);
        if (!stop) {
          setStatus(s);
          setLastUpdated(Date.now());
        }
      } catch (e) {
        if (!stop) setError((e as Error).message);
      } finally {
        if (!stop) {
          // Choose next interval based on how long we've been polling.
          const elapsed = Date.now() - startedAt;
          const nextDelay = elapsed < 30_000 ? 2_000 : 5_000;
          timeoutId = setTimeout(poll, nextDelay);
        }
      }
    };
    poll();

    return () => {
      stop = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [orderId]);

  // Ticket = last 6 chars of the Clover order id, uppercased and
  // prefixed with `#` — same format the KDS prints, so staff can match
  // the customer's screen to their kitchen ticket at a glance. We
  // synthesize it from `orderId` immediately so the ticket pops in
  // before /api/orders/{id}/status returns. When the poll lands, the
  // server-provided value takes over (identical string in practice;
  // this is just a no-flicker safety net).
  const ticket = useMemo(() => {
    if (status?.ticketNumber) return `#${status.ticketNumber}`;
    if (orderId) return `#${orderId.slice(-6).toUpperCase()}`;
    return "#------";
  }, [status?.ticketNumber, orderId]);

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

        {/*
          Ticket font is responsive: clamp scales from 56px on narrow
          mobile (so "#XXXXXX" fits without overflowing the pink card)
          up to 88px on tablet+ where there's room for the hero look.
          Was a flat text-[88px] before — overflowed iPhone-width.
        */}
        <div className="relative mt-3 text-center font-display text-[clamp(56px,14vw,88px)] font-extrabold leading-[0.9] tracking-[-0.04em] text-white">
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
              {etaMinutes != null ? `~${etaMinutes} min` : "~8 min"}
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

      {/* Tiny "as of …" line under the status card so customers can tell
          the page is live and not stuck. Pulses subtly so the eye
          notices an update happened. */}
      {lastUpdated && (
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-rollo-ink-muted">
          <span
            key={lastUpdated}
            className="h-1.5 w-1.5 animate-ping rounded-full bg-rollo-pink opacity-75"
          />
          <Mono size={9} color="rgba(42,23,34,0.45)">
            UPDATED {timeAgo(lastUpdated)}
          </Mono>
        </div>
      )}

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
