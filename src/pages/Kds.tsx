import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * /kds — Kitchen Display System.
 *
 * Staff types a PIN to unlock the device (per-browser localStorage),
 * then sees a grid of active tickets pulled every 2s from
 * /api/kds/tickets. Tapping "Complete" calls /api/kds/complete which
 * flips the Firestore doc → the customer's confirmation page
 * advances to "Ready for pickup" on its next poll.
 *
 * The UI is intentionally chunky and high-contrast — designed for a
 * counter-height tablet glanced at across a kitchen, not for a
 * pocket phone. Black background, large white text, big tap targets.
 */

interface Ticket {
  orderId: string;
  ticketNumber: string;
  customerName?: string;
  items: { n: string; q: number; m?: string }[];
  status: "queued" | "in_progress" | "completed";
  createdAtMs: number;
  completedAtMs?: number;
  elapsedSec: number;
  total?: number;
}

type Action = "complete" | "dismiss" | "recall";

const TOKEN_KEY = "yolo-rollo-kds-token";
const POLL_MS = 2_000;

export function KdsPage() {
  const [token, setToken] = useState<string>(
    () => localStorage.getItem(TOKEN_KEY) ?? "",
  );
  // Ticker that increments every second so the "elapsed" labels on
  // each card update without us re-polling /api/kds/tickets.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!token) {
    return <PinGate onAuthed={(t) => { localStorage.setItem(TOKEN_KEY, t); setToken(t); }} />;
  }

  return (
    <Board
      token={token}
      tick={tick}
      onAuthExpired={() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken("");
      }}
    />
  );
}

// ─── PIN gate ────────────────────────────────────────────────────────
function PinGate({ onAuthed }: { onAuthed: (token: string) => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/kds/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = (await r.json()) as { token?: string; error?: string };
      if (!r.ok || !data.token) {
        setError(data.error ?? "Invalid PIN");
        setPin("");
      } else {
        onAuthed(data.token);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl bg-zinc-900 p-8 shadow-2xl"
      >
        <div className="mb-1 text-center font-display text-2xl font-extrabold tracking-tight">
          KDS
        </div>
        <div className="mb-6 text-center text-sm text-zinc-400">
          Enter staff PIN
        </div>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full rounded-2xl bg-zinc-800 px-5 py-4 text-center font-display text-3xl tracking-[0.4em] text-white outline-none focus:ring-2 focus:ring-rollo-pink"
          maxLength={12}
          placeholder="••••"
        />
        {error && (
          <div className="mt-3 text-center text-sm text-rose-400">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={!pin || submitting}
          className="mt-6 w-full rounded-2xl bg-rollo-pink py-3 font-display text-lg font-extrabold transition active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? "Verifying…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

// ─── Active ticket board ─────────────────────────────────────────────
function Board({
  token,
  tick,
  onAuthExpired,
}: {
  token: string;
  tick: number;
  onAuthExpired: () => void;
}) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Tracks which orderIds have an in-flight transition request, so we
  // can disable their buttons until the server responds. Keyed by
  // orderId — same set for all action types since only one button on
  // a card is pressable at a time.
  const [pending, setPending] = useState<Set<string>>(new Set());

  const fetchTickets = useCallback(async () => {
    try {
      const r = await fetch("/api/kds/tickets", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) {
        onAuthExpired();
        return;
      }
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${r.status}`);
      }
      const data = (await r.json()) as { tickets: Ticket[] };
      setTickets(data.tickets);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token, onAuthExpired]);

  useEffect(() => {
    fetchTickets();
    const id = setInterval(fetchTickets, POLL_MS);
    return () => clearInterval(id);
  }, [fetchTickets]);

  /**
   * Issue a state-machine transition for a ticket.
   *   complete  any        → completed (kitchen done, awaiting pickup)
   *   dismiss   completed  → picked_up (customer received; ticket gone)
   *   recall    completed  → queued    (back to the line)
   *   recall    picked_up  → completed (un-archive)
   * Updates local state optimistically; the next poll reconciles.
   */
  const transition = async (orderId: string, action: Action) => {
    setPending((s) => new Set(s).add(orderId));
    try {
      const r = await fetch("/api/kds/transition", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId, action }),
      });
      if (r.status === 401) {
        onAuthExpired();
        return;
      }
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${r.status}`);
      }
      const data = (await r.json()) as {
        status: "queued" | "in_progress" | "completed" | "picked_up";
      };
      // Optimistic local update so the card moves panels instantly.
      setTickets((prev) => {
        if (!prev) return prev;
        if (data.status === "picked_up") {
          // Disappears off the board entirely (KDS doesn't show picked_up).
          return prev.filter((t) => t.orderId !== orderId);
        }
        return prev.map((t) =>
          t.orderId === orderId
            ? {
                ...t,
                status: data.status as Ticket["status"],
                ...(data.status === "completed"
                  ? { completedAtMs: Date.now() }
                  : {}),
                ...(action === "recall" && data.status === "queued"
                  ? { completedAtMs: undefined }
                  : {}),
              }
            : t,
        );
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending((s) => {
        const next = new Set(s);
        next.delete(orderId);
        return next;
      });
    }
  };

  // Compute "live" elapsed seconds + split into Queue vs Ready panels.
  // Done in one memo so the per-second ticker only triggers one
  // recompute, not separate ones per derived array.
  const { queue, ready } = useMemo(() => {
    void tick; // dependency on the ticker
    const now = Date.now();
    const enriched = (tickets ?? []).map((t) => ({
      ...t,
      liveElapsedSec: t.createdAtMs
        ? Math.max(0, Math.floor((now - t.createdAtMs) / 1000))
        : t.elapsedSec,
    }));
    // Queue panel — oldest first (FIFO prep order)
    const queue = enriched
      .filter((t) => t.status === "queued" || t.status === "in_progress")
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
    // Ready panel — newest first (most recently completed at the top
    // so staff sees fresh-out-the-kitchen tickets immediately)
    const ready = enriched
      .filter((t) => t.status === "completed")
      .sort((a, b) => (b.completedAtMs ?? 0) - (a.completedAtMs ?? 0));
    return { queue, ready };
  }, [tickets, tick]);

  return (
    <div className="min-h-screen bg-black p-4 text-white">
      <header className="mb-4 flex items-center justify-between px-2">
        <div className="font-display text-3xl font-extrabold">
          Kitchen Queue
        </div>
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span>
            {queue.length} active · {ready.length} ready
          </span>
          <button
            type="button"
            onClick={onAuthExpired}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 transition hover:bg-zinc-700"
          >
            Lock
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-2 mb-3 rounded-xl bg-rose-900/40 px-4 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      {tickets === null && !error ? (
        <div className="px-2 py-8 text-zinc-500">Loading…</div>
      ) : (
        <>
          {/* ── In Queue ─────────────────────────────────────── */}
          <SectionHeader
            label="In queue"
            count={queue.length}
            empty="No active tickets."
          />
          {queue.length > 0 && (
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {queue.map((t) => (
                <TicketCard
                  key={t.orderId}
                  ticket={t}
                  pending={pending.has(t.orderId)}
                  onAction={(a) => transition(t.orderId, a)}
                />
              ))}
            </div>
          )}

          {/* ── Ready for Pickup ─────────────────────────────── */}
          <SectionHeader
            label="Ready for pickup"
            count={ready.length}
            empty="No orders waiting on pickup."
          />
          {ready.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {ready.map((t) => (
                <TicketCard
                  key={t.orderId}
                  ticket={t}
                  pending={pending.has(t.orderId)}
                  onAction={(a) => transition(t.orderId, a)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────
function SectionHeader({
  label,
  count,
  empty,
}: {
  label: string;
  count: number;
  empty: string;
}) {
  return (
    <div className="mb-2 mt-1 flex items-baseline justify-between px-2">
      <div className="font-display text-xl font-bold uppercase tracking-wider text-zinc-300">
        {label}
        <span className="ml-2 text-sm font-normal tracking-normal text-zinc-500">
          {count > 0 ? `(${count})` : ""}
        </span>
      </div>
      {count === 0 && (
        <div className="text-sm italic text-zinc-600">{empty}</div>
      )}
    </div>
  );
}

// ─── Single ticket card ─────────────────────────────────────────────
function TicketCard({
  ticket,
  pending,
  onAction,
}: {
  ticket: Ticket & { liveElapsedSec: number };
  pending: boolean;
  onAction: (action: Action) => void;
}) {
  const isReady = ticket.status === "completed";

  // Color band changes from green → yellow → red as the order ages,
  // so a busy kitchen can prioritize visually. Ready-state cards use
  // a flat pink band so they're visually distinct from the queue.
  const ageBand = isReady
    ? "bg-rollo-pink"
    : ticket.liveElapsedSec < 90
      ? "bg-emerald-500"
      : ticket.liveElapsedSec < 180
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <div className="overflow-hidden rounded-2xl bg-zinc-900 shadow-lg">
      <div className={`${ageBand} h-1.5 w-full`} aria-hidden />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-3xl font-extrabold tracking-tight">
              #{ticket.ticketNumber}
            </div>
            {ticket.customerName && (
              <div className="mt-0.5 truncate text-sm text-zinc-300">
                {ticket.customerName}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="font-display text-xl font-bold tabular-nums">
              {formatElapsed(ticket.liveElapsedSec)}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              {isReady ? "ready" : "elapsed"}
            </div>
          </div>
        </div>

        <div className="mt-3 divide-y divide-zinc-800">
          {ticket.items.map((it, i) => (
            <div key={i} className="flex items-start gap-2 py-2">
              <span className="min-w-[26px] rounded-md bg-zinc-800 px-1.5 py-0.5 text-center text-xs font-bold text-zinc-300">
                ×{it.q}
              </span>
              <div className="flex-1">
                <div className="font-display font-bold leading-tight">
                  {it.n}
                </div>
                {it.m && (
                  <div className="mt-0.5 text-xs text-zinc-400">{it.m}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Action buttons depend on the ticket's lifecycle stage.
            Queued/in-progress → single Complete button.
            Completed (Ready for Pickup) → Dismiss (customer received)
            + Recall (move back to the kitchen queue if completed too
            early). Both lifecycle stages share the same `pending` lock
            so double-taps can't fire two transitions in flight. */}
        {isReady ? (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => onAction("recall")}
              disabled={pending}
              className="flex-1 rounded-xl bg-zinc-800 py-3 font-display text-sm font-extrabold uppercase tracking-wider text-zinc-200 transition active:scale-[0.98] disabled:opacity-50"
            >
              ↺ Recall
            </button>
            <button
              type="button"
              onClick={() => onAction("dismiss")}
              disabled={pending}
              className="flex-[2] rounded-xl bg-rollo-pink py-3 font-display text-base font-extrabold uppercase tracking-wider text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {pending ? "Working…" : "Picked up"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onAction("complete")}
            disabled={pending}
            className="mt-4 w-full rounded-xl bg-emerald-600 py-3 font-display text-base font-extrabold uppercase tracking-wider text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {pending ? "Completing…" : "Complete"}
          </button>
        )}
      </div>
    </div>
  );
}

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
