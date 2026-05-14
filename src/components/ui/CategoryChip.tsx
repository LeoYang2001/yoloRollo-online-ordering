import { Icon } from "./Icon";

/**
 * Horizontal-scroll category chip used on the menu page.
 * White pill with a mini icon when inactive, hot pink when active.
 *
 *   <CategoryChip
 *     label="Bubble"
 *     icon="boba"
 *     active={activeCat === "bubble"}
 *     onClick={() => setActiveCat("bubble")}
 *   />
 */

interface Props {
  label: string;
  /** Key into the Icon set — defaults to "cup". */
  icon?: keyof typeof Icon;
  active?: boolean;
  onClick?: () => void;
}

export function CategoryChip({ label, icon = "cup", active, onClick }: Props) {
  const Ico = Icon[icon] ?? Icon.cup;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border py-2 pl-2.5 pr-3.5 font-display text-[13px] font-bold transition active:scale-[0.97] ${
        active
          ? "border-rollo-pink bg-rollo-pink text-white shadow-[0_6px_14px_-4px_rgba(236,30,121,0.4)]"
          : "border-rollo-ink-line bg-rollo-card text-rollo-ink shadow-[0_1px_2px_rgba(42,23,34,0.04)]"
      }`}
    >
      <span
        className={`grid h-[26px] w-[26px] place-items-center rounded-full ${
          active
            ? "bg-white/[0.22] text-white"
            : "bg-rollo-paper-soft text-rollo-pink"
        }`}
      >
        <Ico className="h-3.5 w-3.5" />
      </span>
      {label}
    </button>
  );
}
