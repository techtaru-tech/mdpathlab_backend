import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { User } from "lucide-react";
import { ApiError, cartApi, session } from "@/lib/api";
import { notifyCartChanged } from "@/lib/cartEvents";
import { resolveCatalogueItemBySlug } from "@/lib/catalogue";
import { ActionButton } from "@/components/ui-kit/ActionButton";

const title = "Book a Home Sample Collection — MD Path Lab";
const description =
  "Pick your test or full body package, choose a slot and our certified phlebotomist collects your sample at home — free of charge.";

// Every "Book Now" / "Add" link across the site points here with ?item=<slug> — kept as a thin
// entry point (rather than rewriting every one of those links) that adds the item to the real
// cart and continues straight to the full multi-item checkout flow.
export const Route = createFileRoute("/book")({
  validateSearch: z.object({ item: z.string().optional() }),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: BookPage,
});

function BookPage() {
  const { item } = Route.useSearch();
  const isAuthed = session.getToken() !== null;
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthed || !item) return;
    (async () => {
      try {
        const resolved = await resolveCatalogueItemBySlug(item);
        await cartApi.add({ itemType: resolved.itemType, itemId: resolved.id });
        notifyCartChanged();
        window.location.href = "/checkout";
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't add this item — please try again");
      }
    })();
  }, [isAuthed, item]);

  if (!isAuthed) {
    return (
      <section className="py-16">
        <div className="container-page mx-auto max-w-md">
          <div className="surface-card p-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
              <User className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-xl font-extrabold">Log in to continue booking</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We use your mobile number to confirm your booking and send report updates.
            </p>
            <Link
              to="/login"
              search={{ redirect: `/book${item ? `?item=${encodeURIComponent(item)}` : ""}` }}
              className="mt-6 block"
            >
              <ActionButton variant="primary" size="lg" className="w-full">
                Log in
              </ActionButton>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (!item) {
    return (
      <section className="py-16">
        <div className="container-page mx-auto max-w-md text-center">
          <div className="surface-card p-10">
            <h1 className="text-xl font-extrabold">Nothing selected yet</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick a test or health package first, then come back here to book it.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/tests">
                <ActionButton variant="outline" size="md">
                  Browse tests
                </ActionButton>
              </Link>
              <Link to="/packages">
                <ActionButton variant="primary" size="md">
                  Browse packages
                </ActionButton>
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16">
      <div className="container-page mx-auto max-w-md text-center">
        {error ? (
          <div className="surface-card p-10">
            <p className="text-sm font-semibold text-destructive">{error}</p>
            <Link to="/tests" className="mt-6 block">
              <ActionButton variant="outline" size="md">
                Browse tests
              </ActionButton>
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Adding your item to cart…</p>
        )}
      </div>
    </section>
  );
}
