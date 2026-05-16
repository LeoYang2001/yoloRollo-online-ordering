/**
 * Store-local time helpers. The Wolfchase storefront is in Memphis
 * (Central Time), but the Vercel function may run in any region — so
 * we can't rely on `new Date()` matching the shop's calendar day.
 *
 * `storeMidnightMs()` returns the unix-ms of midnight today *in the
 * store's timezone*, so we can pull all of today's orders from Clover
 * and reset the KDS / TV / history boards each calendar day without
 * a manual clear.
 *
 * The timezone defaults to America/Chicago (Memphis). Override with
 * the `STORE_TIMEZONE` env var if the shop moves.
 */

const STORE_TZ = process.env.STORE_TIMEZONE ?? "America/Chicago";

/**
 * Unix-ms timestamp for midnight today in the store's local timezone.
 *
 *   12:31 PM Central on May 16  → ms representing 00:00 Central, May 16
 *   12:31 AM Central on May 17  → ms representing 00:00 Central, May 17
 *   11:59 PM Central on May 16  → ms representing 00:00 Central, May 16
 *
 * Trick: format `now` in the store's TZ to extract the current local
 * hour/minute/second/ms, then subtract that from now to land on the
 * preceding local midnight. Robust across DST because the offset is
 * captured implicitly in the same instant we're measuring against.
 */
export function storeMidnightMs(now = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_TZ,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });
  let hour = 0;
  let minute = 0;
  let second = 0;
  for (const p of fmt.formatToParts(now)) {
    if (p.type === "hour") hour = Number(p.value);
    else if (p.type === "minute") minute = Number(p.value);
    else if (p.type === "second") second = Number(p.value);
  }
  // Sub-second precision isn't worth widening the typings for; the
  // resulting offset is still accurate to the second, which is way
  // finer than needed for a calendar-day boundary.
  const elapsedToday =
    hour * 3_600_000 + minute * 60_000 + second * 1_000;
  return now.getTime() - elapsedToday;
}

/** True iff the given unix-ms is within today (store-local). */
export function isStoreToday(ms: number | undefined): boolean {
  if (typeof ms !== "number" || ms <= 0) return false;
  return ms >= storeMidnightMs();
}
