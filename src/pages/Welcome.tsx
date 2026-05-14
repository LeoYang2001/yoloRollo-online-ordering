import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Mono, Wordmark } from "../components/ui/Typography";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";

/**
 * Welcome — minimal splash. Storefront video fills the entire viewport;
 * the only UI on top is the wordmark + map-pin shortcut at the top and
 * a low-opacity frosted bottom sheet holding the Get started CTA + EST
 * meta line.
 *
 * The section uses `fixed inset-0 overflow-hidden` so the page is
 * inherently non-scrollable without having to touch `body.style`.
 * (Previous versions locked body scroll via useEffect — that approach
 * leaked the `overflow: hidden` across route changes and broke scroll
 * on the rest of the app. Don't do that; let the fixed section do its
 * own job.)
 */
export function Welcome() {
  const navigate = useNavigate();

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 overflow-hidden bg-rollo-ink text-rollo-ink"
    >
      {/* ─── Storefront video — full-bleed, the only visual ───
        autoPlay + muted + playsInline are the iOS Safari trifecta.
        Loop + preload="auto" keep the cycle seamless. No poster image
        — we don't want any static wallpaper, just the video. While the
        first frame buffers, the section's bg-rollo-ink shows through. */}
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src="video/storefront.mp4" type="video/mp4" />
      </video>

      {/* ─── Wordmark — floats over the video, centered top ──────── */}
      <div className="absolute inset-x-0 top-[58px] z-10 flex justify-center">
        <Wordmark size={32} withSub />
      </div>

      {/* ─── Map-pin button — top-right, navigates to /location ─── */}
      <button
        type="button"
        onClick={() => navigate("/location")}
        aria-label="Find us"
        className="absolute right-4 top-14 z-10 grid h-[42px] w-[42px] place-items-center rounded-full bg-white/30 text-white shadow-rollo-soft backdrop-blur-md transition active:scale-[0.95]"
      >
        <Icon.pin className="h-5 w-5" />
      </button>

      {/* ─── Translucent frosted bottom sheet — minimal contents ───
          ~25% opacity + heavy blur lets the video show through clearly
          while keeping the CTA + meta legible. Wordmark, headline, and
          sub-copy were all removed per design. */}
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-[32px] px-6 pb-10 pt-7"
        style={{
          background: "rgba(255,255,255,0.25)",
          boxShadow: "0 -16px 40px -10px rgba(0,0,0,0.20)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          backdropFilter: "blur(24px) saturate(160%)",
        }}
      >
        <Button
          variant="primary"
          size="lg"
          full
          onClick={() => navigate("/menu")}
        >
          Get started
          <Icon.arrow />
        </Button>

        <div className="mt-3.5 text-center">
          <Mono size={10} color="rgba(255,255,255,0.85)" weight={600}>
            EST. 2019 · WOLFCHASE · MEMPHIS
          </Mono>
        </div>
      </div>
    </motion.section>
  );
}
