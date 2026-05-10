import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useCart } from "../lib/cartStore";
import type { OrderStatus } from "../types";

const STATE_LABEL: Record<OrderStatus["state"], string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid — sent to kitchen",
  preparing: "Rolling now 🥄",
  ready: "Ready for pickup!",
  completed: "Picked up — enjoy 💖",
  cancelled: "Cancelled",
};

export function Confirmation() {
  const { orderId = "" } = useParams();
  const clearCart = useCart((s) => s.clear);
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Once we land on confirmation, payment has succeeded and we can
    // safely empty the cart so they can place another order later.
    clearCart();
  }, [clearCart]);

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

  return (
    <div className="card mt-4 text-center">
      <p className="font-display text-3xl">Thanks!</p>
      <p className="mt-1 text-sm text-rollo-ink/70">
        We’ve got your order. Watch the screen in store for your number.
      </p>

      <div className="mt-5 rounded-2xl bg-rollo-pink-soft p-5">
        <p className="text-xs uppercase tracking-wide text-rollo-ink/60">
          Ticket
        </p>
        <p className="font-display text-5xl text-rollo-pink">
          {status?.ticketNumber ?? "—"}
        </p>
        <p className="mt-2 text-sm font-semibold">
          {status ? STATE_LABEL[status.state] : "Loading status…"}
        </p>
      </div>

      {error && (
        <p className="mt-3 text-xs text-rollo-pink">
          Status check failed: {error}
        </p>
      )}

      <Link to="/menu" className="btn-secondary mt-5">
        Order again
      </Link>
    </div>
  );
}
