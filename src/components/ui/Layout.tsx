import type { InputHTMLAttributes, ReactNode } from "react";
import { Display, Mono } from "./Typography";
import { Icon } from "./Icon";
import { Button } from "./Button";

/**
 * Page layout primitives.
 *
 *   <Header/>         — sticky top bar with back arrow + title.
 *   <SectionHeader/>  — section title + optional "See all" action.
 *   <Field/>          — label + hint + wrapping input.
 *   <Input/>          — themed text input matching the Field style.
 *   <EmptyState/>     — centered icon + headline + CTA (empty cart, etc.)
 */

// ────────────────────────────────────────────────────────────────────
// Header — sticky back arrow + title row.
// Used on Cart, Checkout, Confirmation. Menu uses its own header.
// ────────────────────────────────────────────────────────────────────
interface HeaderProps {
  title: string;
  onBack?: () => void;
  action?: ReactNode;
}

export function Header({ title, onBack, action }: HeaderProps) {
  return (
    // Top padding uses safe-area-inset-top so the header clears the
    // iOS status bar / notch when running as a PWA, but stays compact
    // (12px) on plain web browsers where there's no notch to clear.
    <div
      className="sticky top-0 z-10 bg-rollo-paper pb-3"
      style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}
    >
      <div className="flex items-center justify-between px-5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="grid h-[42px] w-[42px] place-items-center rounded-[14px] bg-rollo-card text-rollo-ink shadow-rollo-soft transition active:scale-[0.96]"
          >
            <Icon.back />
          </button>
        ) : (
          <div className="h-[42px] w-[42px]" />
        )}
        <Display size={18} nowrap>
          {title}
        </Display>
        <div className="flex h-[42px] w-[42px] items-center justify-end">
          {action}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// SectionHeader — title + sub + action (e.g., "See all").
// ────────────────────────────────────────────────────────────────────
interface SectionHeaderProps {
  title: string;
  sub?: string;
  action?: ReactNode;
}

export function SectionHeader({ title, sub, action }: SectionHeaderProps) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <div className="min-w-0 flex-1">
        <Display size={20} nowrap>
          {title}
        </Display>
        {sub && (
          <div className="mt-0.5 text-[11px] text-rollo-ink-muted">{sub}</div>
        )}
      </div>
      {action}
    </div>
  );
}

/** "See all" link used in SectionHeader action slot. */
export function SeeAll({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-display whitespace-nowrap text-[13px] font-bold text-rollo-pink"
    >
      See all
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────
// Field — Mono label + optional Mono hint + wrapping child input.
// ────────────────────────────────────────────────────────────────────
interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <Mono size={10}>{label}</Mono>
        {hint && (
          <Mono size={9} color="rgba(42,23,34,0.40)">
            {hint}
          </Mono>
        )}
      </div>
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Input — themed text input, 50px tall, pink focus ring.
// ────────────────────────────────────────────────────────────────────
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`block h-[50px] w-full rounded-2xl border-[1.5px] border-rollo-ink-line bg-rollo-card px-4 font-body text-[15px] text-rollo-ink outline-none transition focus:border-rollo-pink ${props.className ?? ""}`}
    />
  );
}

// ────────────────────────────────────────────────────────────────────
// EmptyState — centered empty-bag illustration + CTA.
// ────────────────────────────────────────────────────────────────────
interface EmptyStateProps {
  title: string;
  sub: string;
  cta: string;
  onCta?: () => void;
}

export function EmptyState({ title, sub, cta, onCta }: EmptyStateProps) {
  return (
    <div className="px-5 py-16 text-center">
      <div
        className="mx-auto grid h-[92px] w-[92px] place-items-center rounded-full bg-rollo-pink-soft"
        style={{ boxShadow: "inset 0 -6px 14px rgba(0,0,0,0.08)" }}
      >
        <Icon.bag className="h-9 w-9 text-rollo-pink" />
      </div>
      <Display size={26} className="mt-4">
        {title}
      </Display>
      <div className="mt-1.5 text-sm text-rollo-ink-soft">{sub}</div>
      <Button variant="primary" size="md" onClick={onCta} className="mt-4">
        {cta}
      </Button>
    </div>
  );
}
