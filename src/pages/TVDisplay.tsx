import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { brand } from "../config/brand";
import { Wordmark, Display, Mono, Sticker } from "../components/ui/Typography";
import { Button } from "../components/ui/Button";

/**
 * In-store TV display. Open in fullscreen (Chrome: F11).
 *
 *   Left column (smaller):  marketing / QR — for customers who haven't
 *                           ordered yet. "Scan. Order. Roll." with QR
 *                           and the SKIP THE LINE sticker.
 *   Right column (bigger):  live ticket board, two stacked stripes:
 *
 *     READY FOR PICKUP    — large yellow card, ticket numbers in giant
 *                           type with the customer's first name beside
 *                           each. Animates in when a new ticket lands.
 *
 *     NOW MAKING          — smaller white card below, lists the queue
 *                           in FIFO order so customers can guess their
 *                           position.
 *
 * Polls /api/tv/display every 3 seconds. Falls back silently to empty
 * lists if the endpoint is down — the QR remains visible so people can
 * still place a new order.
 */

interface TvTicket {
  ticketNumber: string;
  customerName?: string;
  agedSec: number;
}
interface TvPayload {
  preparing: TvTicket[];
  ready: TvTicket[];
  asOf: string;
}

const POLL_MS = 3_000;

/**
 * Speak a ticket-ready announcement via the Web Speech API. Cancels
 * any in-flight utterance so a burst of completes doesn't pile up
 * into a backlog. Spells the ticket number letter-by-letter (single
 * space between chars) so the TTS pronounces "CT6EQC" as
 * "C T 6 E Q C" rather than trying to read it as a word.
 */
function announceReady(ticketNumber: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const spelled = ticketNumber.split("").join(" ");
  const u = new SpeechSynthesisUtterance(
    `Order ${spelled} is ready for pickup`,
  );
  u.rate = 0.92;
  u.pitch = 1.05;
  u.volume = 1.0;
  // Prefer a local English voice if one's available — sounds more
  // natural than the default robot.
  const voices = window.speechSynthesis.getVoices();
  const en = voices.find(
    (v) => v.lang.toLowerCase().startsWith("en") && v.localService,
  );
  if (en) u.voice = en;
  window.speechSynthesis.speak(u);
}

export function TVDisplay() {
  const navigate = useNavigate();
  const url = `${brand.publicUrl}/?src=tv`;
  const [data, setData] = useState<TvPayload>({
    preparing: [],
    ready: [],
    asOf: new Date().toISOString(),
  });
  // True once the browser's autoplay block has been lifted by some
  // user gesture on the page. We auto-prime via a one-shot document
  // listener (see effect below) so the staff doesn't need to find a
  // button — opening the URL in any way + a single click anywhere
  // unlocks it for the rest of the session.
  const [audioPrimed, setAudioPrimed] = useState(false);
  // Track which ticket numbers we've already spoken so we don't
  // re-announce on every poll. Populated on first data arrival with
  // whatever's currently ready (so we don't shout out a backlog).
  const announcedRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/tv/display");
        if (!r.ok) return;
        const json = (await r.json()) as TvPayload;
        if (!cancelled) setData(json);
      } catch {
        /* ignore — keep previous state */
      }
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Watch the ready list — speak any newly arrived ticket. Always
  // attempts the announcement; if the browser hasn't been primed yet
  // the first call is silently dropped and the prime effect below
  // takes care of the next one once any user gesture lands.
  useEffect(() => {
    if (!seededRef.current) {
      // First payload: seed the "already announced" set with whatever's
      // already on the board so we don't shout out historical tickets
      // the staff already knows about.
      for (const t of data.ready) announcedRef.current.add(t.ticketNumber);
      seededRef.current = true;
      return;
    }
    for (const t of data.ready) {
      if (!announcedRef.current.has(t.ticketNumber)) {
        announcedRef.current.add(t.ticketNumber);
        announceReady(t.ticketNumber);
      }
    }
  }, [data.ready]);

  // Some browsers don't populate getVoices() synchronously; pre-warm
  // so the en-US voice is ready by the time the first announcement
  // fires.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.getVoices();
    const onVoices = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener("voiceschanged", onVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
    };
  }, []);

  // Auto-prime audio on the first user gesture anywhere on the page.
  // Browsers (every modern one) block speechSynthesis until SOME
  // user interaction happens, so we listen once for any click /
  // keypress / touch / pointer event and fire a silent utterance to
  // unlock the audio context. Listener removes itself after firing
  // so it costs nothing for the rest of the session.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (audioPrimed) return;
    const prime = () => {
      try {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        window.speechSynthesis.speak(u);
      } catch {
        /* ignore — best effort */
      }
      setAudioPrimed(true);
    };
    // pointerdown beats click on touch; listen to a couple just in
    // case the TV is operated by remote/keyboard.
    const events: (keyof DocumentEventMap)[] = [
      "pointerdown",
      "click",
      "keydown",
      "touchstart",
    ];
    for (const e of events) {
      document.addEventListener(e, prime, { once: true, passive: true });
    }
    return () => {
      for (const e of events) document.removeEventListener(e, prime);
    };
  }, [audioPrimed]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-rollo-pink text-white">
      {/* Decorative corner blobs */}
      <div className="absolute -right-20 -top-16 h-[260px] w-[260px] rounded-full bg-rollo-rose" />
      <div className="absolute -bottom-24 -left-20 h-[300px] w-[300px] rounded-full bg-rollo-butter opacity-90" />
      <div className="absolute right-[-40px] top-32 h-16 w-16 rounded-full bg-rollo-green" />

      <div className="relative z-10 flex h-full flex-col px-8 pb-8 pt-10">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <Wordmark
            size={28}
            colors={{ yolo: "#A6CE39", rollo: "#FFFFFF", sub: "#FCD86F" }}
          />
          <Mono size={11} color="#fff">
            IN-STORE DISPLAY · {new Date(data.asOf).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Mono>
        </div>

        {/* Two-column main body */}
        <div className="mt-6 flex flex-1 gap-8">
          {/* ── Left: scan-to-order marketing ─────────────────────── */}
          <div className="flex w-[420px] flex-shrink-0 flex-col justify-center">
            <div className="self-start">
              <Sticker size="md" bg="#FCD86F" fg="#2A1722">
                ✦ SKIP THE LINE
              </Sticker>
            </div>

            <Display
              size={56}
              className="mt-4 text-white"
              style={{ lineHeight: 0.98 }}
            >
              Scan.
              <br />
              Order.
              <br />
              <span style={{ color: "#FCD86F" }}>Roll.</span>
            </Display>

            <div
              className="mt-6 self-start rounded-rollo-card bg-white p-3.5"
              style={{
                transform: "rotate(-2deg)",
                boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
              }}
            >
              {/* Pre-rendered QR — public/qr-order.png. Swapped from
                  the runtime QRCodeSVG so the brand version with the
                  logo overlay can be used without re-generating per
                  render. Update the file if the destination URL ever
                  changes. */}
              <img
                src="/qr-order.png"
                alt="Scan to order at yolorollo online"
                width={200}
                height={200}
                draggable={false}
                className="h-[200px] w-[200px] object-contain"
              />
              <div className="mt-1.5 text-center">
                <Mono size={10} color="rgba(42,23,34,0.40)">
                  {url.replace(/^https?:\/\//, "").toUpperCase()}
                </Mono>
              </div>
            </div>
          </div>

          {/* ── Right: live ticket board ──────────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            {/* Ready for pickup — the high-attention stripe. Yellow
                background, giant ticket numbers, animated entrance so
                the eye catches a new arrival. */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-rollo-card bg-rollo-butter p-6 text-rollo-ink shadow-rollo-rose">
              <div className="flex items-baseline justify-between">
                <Display size={32} className="text-rollo-ink">
                  Ready for pickup
                </Display>
                <Mono size={11} color="rgba(42,23,34,0.55)">
                  COME GRAB IT
                </Mono>
              </div>

              <div className="mt-4 flex flex-1 flex-wrap content-start gap-3.5 overflow-hidden">
                <AnimatePresence initial={false}>
                  {data.ready.length === 0 ? (
                    <motion.div
                      key="ready-empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="self-center px-2 text-[16px] text-rollo-ink-soft"
                    >
                      No orders ready right now.
                    </motion.div>
                  ) : (
                    data.ready.map((t) => (
                      <motion.div
                        key={t.ticketNumber}
                        layout
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 320,
                          damping: 22,
                        }}
                        className="flex min-w-[200px] flex-col items-start rounded-rollo-card bg-rollo-card px-4 py-3 shadow-rollo-card"
                      >
                        <div className="font-display text-[44px] font-extrabold leading-none tracking-[-0.02em] text-rollo-pink">
                          #{t.ticketNumber}
                        </div>
                        {t.customerName && (
                          <div className="mt-1 text-[16px] font-bold text-rollo-ink">
                            {t.customerName}
                          </div>
                        )}
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Now making — lower-attention secondary stripe. White
                cards with smaller ticket numbers, just so customers
                can see they're in line. */}
            <div className="overflow-hidden rounded-rollo-card bg-white/15 p-5 text-white">
              <div className="flex items-baseline justify-between">
                <Display size={22} className="text-white">
                  Now making
                </Display>
                <Mono size={10} color="rgba(255,255,255,0.75)">
                  {data.preparing.length}{" "}
                  {data.preparing.length === 1 ? "TICKET" : "TICKETS"}
                </Mono>
              </div>

              <div className="mt-3 flex flex-wrap gap-2.5">
                <AnimatePresence initial={false}>
                  {data.preparing.length === 0 ? (
                    <motion.div
                      key="prep-empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-[14px] text-white/75"
                    >
                      Kitchen's clear. Roll on in!
                    </motion.div>
                  ) : (
                    data.preparing.map((t) => (
                      <motion.div
                        key={t.ticketNumber}
                        layout
                        initial={{ y: 6, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -6, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-baseline gap-2 rounded-full bg-white/20 px-3.5 py-1.5 font-display text-[18px] font-extrabold tabular-nums backdrop-blur-sm"
                      >
                        <span>#{t.ticketNumber}</span>
                        {t.customerName && (
                          <span className="text-[12px] font-bold text-white/85">
                            {t.customerName}
                          </span>
                        )}
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: passive audio status indicator + exit affordance.
            Announcements are ALWAYS on (no toggle). The indicator
            shows whether the browser's autoplay block is still in
            effect so staff knows to tap the screen once if they
            haven't already. After any user gesture anywhere on the
            page the indicator flips to "Announcing" and stays there
            for the rest of the session. */}
        <div className="mt-4 flex items-center justify-end gap-2">
          <div
            className={`rounded-full px-4 py-2 font-display text-xs font-bold uppercase tracking-wider transition ${
              audioPrimed
                ? "bg-rollo-butter text-rollo-ink shadow-md"
                : "bg-white/20 text-white/90"
            }`}
            aria-live="polite"
          >
            {audioPrimed ? "🔊 Announcing" : "🔇 Tap screen to enable sound"}
          </div>
          <Button variant="dark" size="sm" onClick={() => navigate("/")}>
            ← Exit
          </Button>
        </div>
      </div>
    </div>
  );
}
