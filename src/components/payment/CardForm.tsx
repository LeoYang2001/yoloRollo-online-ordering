import { useEffect, useRef, useState } from "react";
import { getClover, type CloverElement } from "../../lib/clover";

/**
 * Card form using Clover.js inline iframes.
 *
 * Each field (number, exp, CVV, ZIP) is its own iframe injected into a
 * <div id="..."> below. The data is captured by Clover's domain, never
 * by ours, which keeps us at the lowest PCI scope (SAQ-A).
 *
 * Lessons baked in from the earlier failed attempt:
 *
 *   • React 18 StrictMode mounts components twice in dev. Clover.js
 *     does not de-dup, so we end up with TWO iframes per field — the
 *     second one isn't focusable. Fix: clear the mount target with
 *     `replaceChildren()` before mounting.
 *   • The wrapper element must have a fixed height + overflow:hidden,
 *     otherwise Clover's iframe expands to ~500px on iOS Safari.
 *   • Style the iframe contents through Clover's `style` prop, not via
 *     CSS — CSS can't reach inside cross-origin iframes.
 *   • DON'T rely on `change` events to detect "form is complete." The
 *     event payload shape varies by SDK version and on some versions
 *     the events never fire at all (especially with iOS autofill).
 *     Instead, render our own Pay button and call `clover.createToken()`
 *     on click — if the card is valid, we get a token; if not, Clover
 *     returns errors we surface to the user.
 *
 * Self-contained: this component renders BOTH the fields AND the Pay
 * button. The parent supplies onPay(token) and the amount/label.
 */

interface Props {
  /** Cart total in dollars; rendered on the Pay button. */
  amount: number;
  /** Called with the Clover card token when the user successfully pays. */
  onPay: (token: string) => void | Promise<void>;
  /** Disabled while another payment method is in flight. */
  disabled?: boolean;
  /** External submitting state (e.g. Apple Pay sheet up). */
  submitting?: boolean;
}

const FIELDS: Array<{
  type: "CARD_NUMBER" | "CARD_DATE" | "CARD_CVV" | "CARD_POSTAL_CODE";
  id: string;
  label: string;
  placeholder: string;
  className: string;
}> = [
  {
    type: "CARD_NUMBER",
    id: "yolo-cc-number",
    label: "Card number",
    placeholder: "1234 1234 1234 1234",
    className: "col-span-2",
  },
  {
    type: "CARD_DATE",
    id: "yolo-cc-date",
    label: "Exp",
    placeholder: "MM / YY",
    className: "col-span-1",
  },
  {
    type: "CARD_CVV",
    id: "yolo-cc-cvv",
    label: "CVV",
    placeholder: "123",
    className: "col-span-1",
  },
  {
    type: "CARD_POSTAL_CODE",
    id: "yolo-cc-zip",
    label: "ZIP",
    placeholder: "38016",
    className: "col-span-2",
  },
];

// Style applied INSIDE the Clover iframe. Has to be plain object —
// CSS variables / Tailwind classes won't reach across the origin.
const IFRAME_STYLE = {
  body: {
    "font-family":
      '"Fredoka", -apple-system, BlinkMacSystemFont, sans-serif',
    "font-size": "16px",
    color: "#1A1A1A",
  },
  input: {
    "font-size": "16px",
    color: "#1A1A1A",
  },
  "::placeholder": {
    color: "rgba(26,26,26,0.4)",
  },
};

export function CardForm({ amount, onPay, disabled, submitting }: Props) {
  const cloverRef = useRef<Awaited<ReturnType<typeof getClover>> | null>(null);
  const elementsRef = useRef<CloverElement[]>([]);
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let mounted: CloverElement[] = [];

    (async () => {
      try {
        const clover = await getClover();
        if (cancelled) return;
        cloverRef.current = clover;
        const elements = clover.elements();

        for (const f of FIELDS) {
          const host = document.getElementById(f.id);
          if (!host) continue;
          host.replaceChildren();
          const el = elements.create(f.type, {
            placeholder: f.placeholder,
            style: IFRAME_STYLE,
          });
          el.mount(`#${f.id}`);
          mounted.push(el);
        }
        elementsRef.current = mounted;
        setReady(true);
      } catch (err) {
        setError((err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
      for (const el of mounted) {
        try {
          if (typeof el.destroy === "function") el.destroy();
          else if (typeof el.unmount === "function") el.unmount();
        } catch {
          /* noop */
        }
      }
      elementsRef.current = [];
    };
  }, []);

  const handlePay = async () => {
    if (paying || submitting || disabled) return;
    if (!cloverRef.current) {
      setError("Card form not ready yet.");
      return;
    }
    setPaying(true);
    setError(null);
    try {
      const result = await cloverRef.current.createToken();
      if (result.token) {
        await onPay(result.token);
      } else {
        // Clover returns errors keyed by field name. Show the first one.
        const firstErr = result.errors
          ? Object.values(result.errors)[0]
          : "Please check your card details.";
        setError(firstErr);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPaying(false);
    }
  };

  const busy = paying || submitting;

  return (
    <div className={disabled ? "pointer-events-none opacity-50" : ""}>
      <div className="grid grid-cols-2 gap-3" aria-busy={!ready}>
        {FIELDS.map((f) => (
          <label key={f.id} className={`block ${f.className}`}>
            <span className="text-xs font-semibold text-rollo-ink/70">
              {f.label}
            </span>
            <div
              id={f.id}
              className="mt-1 h-[48px] w-full overflow-hidden rounded-2xl border-2 border-rollo-ink/10 bg-white px-3 focus-within:border-rollo-pink [&>iframe]:h-full [&>iframe]:w-full"
            />
          </label>
        ))}
        {!ready && (
          <p className="col-span-2 text-xs text-rollo-ink/50">
            Loading secure card form…
          </p>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-2xl bg-rollo-pink-soft p-3 text-sm text-rollo-pink"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handlePay}
        disabled={!ready || busy}
        className="btn-primary mt-4 w-full"
      >
        {busy ? "Charging…" : `Pay $${amount.toFixed(2)}`}
      </button>

      <p className="mt-2 text-center text-xs text-rollo-ink/40">
        Secure payment via Clover. Card details never touch our servers.
      </p>
    </div>
  );
}
