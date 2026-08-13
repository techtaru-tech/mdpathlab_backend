import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { cartApi, session, ApiError } from "@/lib/api";
import { resolveCatalogueItemBySlug } from "@/lib/catalogue";
import { notifyCartChanged } from "@/lib/cartEvents";

// Shared by the test and package detail pages — resolves the real catalogue id behind a
// display slug and adds it to the server-persisted cart (src/cart/*), the same cart the new
// /cart and /checkout pages read from.
export function useAddToCart(slug: string) {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState("");

  async function addToCart() {
    if (!session.getToken()) {
      navigate({ to: "/login", search: { redirect: window.location.pathname } });
      return;
    }
    setAdding(true);
    setError("");
    try {
      const resolved = await resolveCatalogueItemBySlug(slug);
      await cartApi.add({ itemType: resolved.itemType, itemId: resolved.id });
      notifyCartChanged();
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add to cart — please try again");
    } finally {
      setAdding(false);
    }
  }

  return { addToCart, adding, added, error };
}
