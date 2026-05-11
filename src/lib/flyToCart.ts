/**
 * Tiny event bus for the "add to cart" animation.
 *
 * Why a window event instead of React context?
 *   - The source element (e.g. the modal image) often unmounts moments after
 *     the user clicks "Add to cart". We don't want React's render cycle to
 *     interrupt the flight. A fire-and-forget window event hands the
 *     animation off to a sibling layer that stays mounted.
 *   - Zero coupling: any component can call `flyToCart` without importing or
 *     subscribing to anything from the cart UI.
 */

export interface FlyPayload {
  /** Source DOMRect — usually the item image's bounding rect. */
  from: DOMRect;
  /** Image URL to fly. Falls back to an ice-cream emoji if missing. */
  imageSrc?: string;
}

const EVENT = "yolo-fly-to-cart";

export function flyToCart(payload: FlyPayload): void {
  window.dispatchEvent(new CustomEvent<FlyPayload>(EVENT, { detail: payload }));
}

export function onFlyToCart(handler: (payload: FlyPayload) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<FlyPayload>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** Element id assigned to the floating cart button so the fly layer can
 *  find its current rect at flight time without needing a ref handshake. */
export const CART_BUTTON_ID = "yolo-floating-cart";
