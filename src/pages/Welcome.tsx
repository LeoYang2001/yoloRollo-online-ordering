import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { brand } from "../config/brand";

export function Welcome() {
  const navigate = useNavigate();
  const welcomeBackgroundSrc = "/welcome-bg.png";

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className="relative min-h-screen overflow-hidden"
    >
      <img
        src={welcomeBackgroundSrc}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        onError={(e) => {
          e.currentTarget.src = "https://picsum.photos/1200/2200?random=28";
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-rollo-ink/70 via-rollo-ink/20 to-transparent" />

      <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-md bg-rollo-green px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rollo-ink">
        ✨ New
      </div>

      <div className="absolute inset-x-0 bottom-0 rounded-t-[2rem] bg-white/95 px-6 pb-8 pt-7 text-center backdrop-blur-md">
        <h1 className="font-display text-4xl leading-none">
          <span className="text-rollo-ink">Welcome </span>
          <span className="text-rollo-pink">Back</span>
        </h1>
        <p className="mt-2 text-sm text-rollo-ink/65">
          Explore our fresh {brand.name} menu
        </p>

        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate("/menu")}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-rollo-ink px-6 text-sm font-semibold text-white shadow-lg shadow-rollo-ink/20"
        >
          <span>Start Order</span>
          <span className="grid h-8 w-8 place-items-center  text-lg leading-none">
            →
          </span>
        </motion.button>
      </div>
    </motion.section>
  );
}
