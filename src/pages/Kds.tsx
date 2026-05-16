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
  status: "queued" | "in_progress";
  createdAtMs: number;
  elapsedSec: number;
  total?: number;
}

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
  const [completing, setCompleting] = useState<Set<string>>(new Set());

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

  const complete = async (orderId: string) => {
    setCompleting((s) => new Set(s).add(orderId));
    try {
      const r = await fetch("/api/kds/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId }),
      });
      if (r.status === 401) {
        onAuthExpired();
        return;
      }
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${r.status}`);
      }
      // Optimistic: drop from local state immediately, the next poll
      // will reconcile if anything went wrong server-side.
      setTickets((prev) => prev?.filter((t) => t.orderId !== orderId) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCompleting((s) => {
        const next = new Set(s);
        next.delete(orderId);
        return next;
      });
    }
  };

  // Compute "live" elapsed seconds without re-fetching by combining
  // each ticket's server-given createdAtMs with the per-second tick
  // counter that's already incrementing in the parent component.
  const enriched = useMemo(() => {
    void tick; // dependency on the ticker
    const now = Date.now();
    return (tickets ?? []).map((t) => ({
      ...t,
      liveElapsedSec: t.createdAtMs
        ? Math.max(0, Math.floor((now - t.createdAtMs) / 1000))
        : t.elapsedSec,
    }));
  }, [tickets, tick]);

  return (
    <div className="min-h-screen bg-black p-4 text-white">
      <header className="mb-4 flex items-center justify-between px-2">
        <div className="font-display text-3xl font-extrabold">
          Kitchen Queue
        </div>
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span>{enriched.length} active</span>
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
      ) : enriched.length === 0 ? (
        <div className="px-2 py-8 text-2xl font-display text-zinc-600">
          No active tickets.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {enriched.map((t) => (
            <TicketCard
              key={t.orderId}
              ticket={t}
              completing={completing.has(t.orderId)}
              onComplete={() => complete(t.orderId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Single ticket card ─────────────────────────────────────────────
function TicketCard({
  ticket,
  completing,
  onComplete,
}: {
  ticket: Ticket & { liveElapsedSec: number };
  completing: boolean;
  onComplete: () => void;
}) {
  // Color band changes from green → yellow → red as the order ages,
  // so a busy kitchen can prioritize visually.
  const ageBand =
    ticket.liveElapsedSec < 90
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
              elapsed
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

        <button
          type="button"
          onClick={onComplete}
          disabled={completing}
          className="mt-4 w-full rounded-xl bg-emerald-600 py-3 font-display text-base font-extrabold uppercase tracking-wider text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {completing ? "Completing…" : "Complete"}
        </button>
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
