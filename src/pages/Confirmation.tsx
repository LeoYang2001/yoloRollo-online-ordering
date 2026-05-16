import { useEffect, useMemo, useRef, useState } from "react";
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
 * Two entry shapes:
 *   - /confirmation/<orderId>  — Inline charge path; orderId is in the
 *                                URL and we go straight to polling status.
 *   - /confirmation            — Hosted Checkout path; Clover redirected
 *                                us back with no orderId. We read the
 *                                checkoutSessionId from sessionStorage
 *                                and poll /api/checkout-session/[cs]
 *                                until our webhook has populated KV.
 *
 * During the Hosted Checkout lookup window (typically 1-5s while we
 * wait for Clover's PAYMENT webhook to land), we render a
 * "Looking up your ticket…" state — ticket area blank, status steps
 * greyed out — and switch to the normal view as soon as the lookup
 * resolves.
 */

const STEPS = [
  { key: "paid", label: "Paid" },
  { key: "preparing", label: "Rolling now" },
  { key: "ready", label: "Ready for pickup" },
] as const;

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
      return -1;
  }
}

/**
 * Phases of the orderId-resolution state machine:
 *   ready   — we know the orderId; status polling drives the UI
 *   looking — we have a checkoutSessionId, polling lookup for orderId
 *   failed  — lookup timed out or errored; ask user to show the cs at counter
 *   missing — no orderId AND no checkoutSessionId; user likely hit /confirmation
 *             directly, or sessionStorage was cleared between checkout and now
 */
type Resolution =
  | { phase: "ready"; orderId: string }
  | { phase: "looking"; cs: string }
  | { phase: "failed"; cs: string; reason: string }
  | { phase: "missing" };

/** Polling cadence for the session->order lookup. */
const LOOKUP_DELAYS_MS = [
  0, 700, 1_500, 2_500, 4_000, 6_000, 8_000, 10_000, 12_000,
];

function initialResolution(paramOrderId: string): Resolution {
  if (paramOrderId) return { phase: "ready", orderId: paramOrderId };
  if (typeof window === "undefined") return { phase: "missing" };
  const cs = window.sessionStorage.getItem("yolo-rollo-checkout-session");
  if (cs) return { phase: "looking", cs };
  return { phase: "missing" };
}

export function Confirmation() {
  const { orderId: paramOrderId = "" } = useParams();
  const navigate = useNavigate();
  const clearCart = useCart((s) => s.clear);

  const [resolution, setResolution] = useState<Resolution>(() =>
    initialResolution(paramOrderId),
  );
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Payment succeeded the moment Clover redirected us here. Empty the
  // cart so a new visit starts fresh.
  useEffect(() => {
    clearCart();
  }, [clearCart]);

  // Phase: looking → poll the session->order lookup endpoint until it
  // resolves to an orderId, or we exhaust the backoff schedule.
  const attemptRef = useRef(0);
  useEffect(() => {
    if (resolution.phase !== "looking") return;
    const cs = resolution.cs;
    attemptRef.current = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      try {
        const result = await api.lookupCheckoutSession(cs);
        if (stopped) return;
        if (result?.orderId) {
          // Got it. Clear the stash so a refresh/back doesn't try to
          // re-resolve a now-known order.
          window.sessionStorage.removeItem("yolo-rollo-checkout-session");
          setResolution({ phase: "ready", orderId: result.orderId });
          return;
        }
      } catch (err) {
        if (stopped) return;
        setResolution({
          phase: "failed",
          cs,
          reason: (err as Error).message,
        });
        return;
      }

      const next = attemptRef.current + 1;
      if (next >= LOOKUP_DELAYS_MS.length) {
        setResolution({
          phase: "failed",
          cs,
          reason: "timed out",
        });
        return;
      }
      attemptRef.current = next;
      timer = setTimeout(tick, LOOKUP_DELAYS_MS[next]);
    };

    timer = setTimeout(tick, LOOKUP_DELAYS_MS[0]);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [resolution]);

  // Phase: ready → poll order status every 5s.
  useEffect(() => {
    if (resolution.phase !== "ready") return;
    const orderId = resolution.orderId;
    let stopped = false;
    const poll = async () => {
      try {
        const s = await api.getOrderStatus(orderId);
        if (!stopped) setStatus(s);
      } catch (e) {
        if (!stopped) setStatusError((e as Error).message);
      }
    };
    poll();
    const id = setInterval(poll, 5_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [resolution]);

  // Derived UI bits.
  const fallbackTicket = useMemo(() => {
    if (resolution.phase !== "ready") return null;
    return `R-${resolution.orderId.slice(-4).toUpperCase()}`;
  }, [resolution]);

  const ticket =
    resolution.phase === "ready"
      ? (status?.ticketNumber ?? fallbackTicket ?? "R-——")
      : "—";

  const activeIdx =
    resolution.phase === "ready" ? stepIndexFor(status?.state) : -1;

  const dateLine = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const stickerLabel =
    resolution.phase === "ready"
      ? "PAYMENT CAPTURED"
      : resolution.phase === "looking"
        ? "FINDING TICKET…"
        : resolution.phase === "failed"
          ? "SHOW THIS AT COUNTER"
          : "NO ORDER FOUND";

  const subtitle =
    resolution.phase === "ready"
      ? "Watch the in-store screen for this number."
      : resolution.phase === "looking"
        ? "Just a moment — finalizing your ticket…"
        : resolution.phase === "failed"
          ? `Show this code: ${resolution.cs.slice(0, 8)}…`
          : "We couldn't find your order in this browser.";

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
            {stickerLabel}
          </Sticker>
        </div>

        <div className="relative mt-3 text-center font-display text-[88px] font-extrabold leading-[0.9] tracking-[-0.04em] text-white">
          {resolution.phase === "looking" ? (
            <span className="inline-block animate-pulse text-white/60">—</span>
          ) : (
            ticket
          )}
        </div>
        <div className="relative mt-2 text-center font-body text-sm text-white/90">
          {subtitle}
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

      {resolution.phase === "failed" && (
        <p className="mt-3 text-xs text-rollo-pink">
          We couldn’t look up your order ({resolution.reason}). Your
          payment went through — show the code above to the counter
          and we’ll find your ticket.
        </p>
      )}

      {resolution.phase === "missing" && (
        <p className="mt-3 text-xs text-rollo-pink">
          Open the confirmation in the same browser you paid in, or
          show your card receipt at the counter.
        </p>
      )}

      {statusError && resolution.phase === "ready" && (
        <p className="mt-3 text-xs text-rollo-pink">
          Status check failed: {statusError}
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
