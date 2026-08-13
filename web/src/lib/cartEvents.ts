// Zero-dependency pub/sub so the Header's cart badge updates immediately after any page adds,
// edits or removes a cart item — avoids introducing a global store just for one counter.
const CART_CHANGED = "mdpathlabs:cart-changed";

export function notifyCartChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CART_CHANGED));
}

export function onCartChanged(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CART_CHANGED, handler);
  return () => window.removeEventListener(CART_CHANGED, handler);
}
