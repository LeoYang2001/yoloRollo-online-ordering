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

/**
 * Flavor key — selects the radial-gradient swatch used as a stand-in
 * for a product photo (see `flavorGradient()` in src/lib/flavors.ts).
 * When real photos exist, this can be ignored in favor of imageUrl.
 */
export type FlavorKey =
  | "oreo" | "strawberry" | "chocolate" | "mango" | "M&M" | "condensed"
  | "taro" | "matcha" | "coconut" | "thai" | "milk" | "jasmine"
  | "blueberry" | "lychee" | "honeydew" | "vanilla";

export interface MenuItem {
  id: string;
  name: string;       // "Build Your Own Roll", "Strawberry Classic"
  description?: string;
  tagline?: string;   // short marketing line, e.g. "Vanilla base + Oreo mix-in"
  price: Money;
  imageUrl?: string;
  flavor?: FlavorKey; // gradient swatch key when no imageUrl is set
  number?: string;    // signature roll number, e.g. "#1"
  tags?: string[];    // ["BEST SELLER"], ["NEW"], ["FAN FAV"]
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
  /** Selected from MenuItem.flavor at add-time, kept so the cart line
   *  can render the same gradient swatch without re-fetching the menu. */
  flavor?: FlavorKey;
}

export interface OrderRequest {
  customerName: string;
  customerPhone: string;  // SMS pickup-ready alerts
  customerEmail?: string; // Helps Apple/Google Pay skip the contact-info prompt
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
