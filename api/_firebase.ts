/**
 * Server-only Firebase Admin SDK singleton. NEVER import from /src —
 * this reads service-account credentials from env vars that must
 * stay off the client bundle.
 *
 * Required env vars (set in Vercel → Settings → Environment Variables):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY    (paste the multi-line string from the
 *                            service-account JSON — Vercel preserves
 *                            the literal `\n` escapes; we decode them
 *                            below.)
 *
 * Usage:
 *   import { firestore } from "./_firebase.js";
 *   await firestore().collection("tickets").doc(orderId).set(...);
 */
import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function init(): App {
  // Re-use the existing app on warm function invocations so we don't
  // re-auth on every request — initializeApp throws on duplicate.
  if (getApps().length) return getApp();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawKey) {
    throw new Error(
      "Firebase Admin env vars missing — need FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY",
    );
  }
  // Vercel stores the private key with literal `\n` escapes; the
  // crypto layer needs real newlines.
  const privateKey = rawKey.replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

let _db: Firestore | null = null;
export function firestore(): Firestore {
  if (_db) return _db;
  _db = getFirestore(init());
  return _db;
}

/** Convenience: shape we store under tickets/{orderId}. We use
 *  `unknown` for the timestamp fields so this file compiles even if
 *  firebase-admin's types aren't loaded yet (the actual runtime
 *  values are Timestamps when read or FieldValue.serverTimestamp()
 *  when written — both pass through `set()` unchanged). */
export interface KdsTicketDoc {
  orderId: string;
  /** Last 6 chars of orderId, uppercased — matches KDS display. */
  ticketNumber: string;
  /** Customer's display name from Hosted Checkout. */
  customerName?: string;
  /** Line items, each `{n, q, m}` where n=name, q=qty, m=modifiers. */
  items: { n: string; q: number; m?: string }[];
  /** Ticket lifecycle:
   *    queued       → just paid, sitting in the kitchen line
   *    in_progress  → staff started preparing (reserved; not exposed yet)
   *    completed    → kitchen done, customer can pick up (shown on TV)
   *    picked_up    → customer received the order; archived, off all boards
   */
  status: "queued" | "in_progress" | "completed" | "picked_up";
  /** Set with FieldValue.serverTimestamp() on write; read as a
   *  Firestore Timestamp (has .toMillis()). */
  createdAt: unknown;
  /** When status flipped to completed. */
  completedAt?: unknown;
  /** When status flipped to picked_up. */
  pickedUpAt?: unknown;
  /** Total in dollars — useful for receipt diagnostics. */
  total?: number;
}
