/**
 * Shared types between the React client and the /api serverless functions.
 * These are intentionally simpler than the raw Clover Inventory shapes —
 * the /api/menu endpoint normalizes Clover items into these.
 */

export type Money = number; // dollars, e.g. 7.99

export interface Modifier {
  id: string;
  name: string;       // e.g. "Strawberry", "Oreo crumble", "Waffle bowl"
  priceDelta: Money;  // 0 for free toppings, positive for upgrades
  group: string;      // e.g. "Base", "Mix-in", "Topping", "Vessel"
}

export interface MenuItem {
  id: string;
  name: string;       // "Build Your Own Roll", "Strawberry Classic"
  description?: string;
  price: Money;
  imageUrl?: string;
  category: string;   // "Signature", "Build Your Own", "Drinks", etc.
  modifierGroups: ModifierGroup[];
  available: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;            // "Choose your vessel", "Pick 2 mix-ins"
  minSelections: number;
  maxSelections: number;
  modifiers: Modifier[];
}

export interface Menu {
  categories: string[];
  items: MenuItem[];
}

export interface CartLine {
  // Stable client-generated ID so the same item with different mods is
  // tracked as separate cart lines.
  lineId: string;
  itemId: string;
  itemName: string;
  unitPrice: Money;       // base + modifier deltas, in dollars
  quantity: number;
  modifiers: { id: string; name: string; priceDelta: Money }[];
  notes?: string;
}

export interface OrderRequest {
  customerName: string;
  customerPhone: string;  // SMS pickup-ready alerts
  notes?: string;
  lines: CartLine[];
  /**
   * Card token from Clover.js `clover.createToken()`. When present, the
   * server uses Clover's Ecommerce Charges API to charge the card and
   * link the payment to the created order. Omit for pay-at-pickup or
   * Hosted Checkout flows.
   */
  paymentToken?: string;
}

export interface OrderResponse {
  orderId: string;            // Clover order ID
  ticketNumber: string;       // short human-friendly number, e.g. "A-042"
  checkoutUrl: string;        // Clover Hosted Checkout URL the user is redirected to
  totals: {
    subtotal: Money;
    tax: Money;
    total: Money;
  };
}

export interface OrderStatus {
  orderId: string;
  ticketNumber: string;
  state: "pending_payment" | "paid" | "preparing" | "ready" | "completed" | "cancelled";
  updatedAt: string;
}
