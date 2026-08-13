import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Plus, ShoppingCart, Trash2, User } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { ApiError, cartApi, patientsApi, session, type CartItem, type FamilyMember } from "@/lib/api";
import { notifyCartChanged } from "@/lib/cartEvents";
import { cn } from "@/lib/utils";

const title = "Your Cart — MD Path Lab";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title }, { name: "robots", content: "noindex" }] }),
  component: CartPage,
});

function CartPage() {
  const navigate = useNavigate();
  const isAuthed = session.getToken() !== null;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CartItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([cartApi.list(), patientsApi.listFamilyMembers()])
      .then(([cart, fam]) => {
        setItems(cart.items);
        setSubtotal(cart.subtotal);
        setFamilyMembers(fam);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your cart"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  async function handleRemove(id: string) {
    setBusyId(id);
    try {
      await cartApi.remove(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      notifyCartChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove item");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAssignPatient(item: CartItem, familyMemberId: string) {
    setBusyId(item.id);
    try {
      const updated = await cartApi.updatePatient(item.id, familyMemberId || null);
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update patient");
    } finally {
      setBusyId(null);
    }
  }

  if (!isAuthed) {
    return (
      <section className="py-16">
        <div className="container-page mx-auto max-w-md">
          <div className="surface-card p-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
              <ShoppingCart className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-xl font-extrabold">Log in to view your cart</h1>
            <Link to="/login" search={{ redirect: "/cart" }} className="mt-6 block">
              <ActionButton variant="primary" size="lg" className="w-full">
                Log in
              </ActionButton>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-10 lg:py-14">
      <div className="container-page">
        <h1 className="text-2xl font-extrabold sm:text-3xl">Your Cart</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {loading ? "Loading…" : `${items.length} item${items.length === 1 ? "" : "s"} in your cart`}
        </p>

        {error ? <p className="mt-4 rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">{error}</p> : null}

        <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-start">
          <div className="flex-1 space-y-4">
            {loading ? (
              <div className="surface-card p-10 text-center text-sm text-muted-foreground">Loading your cart…</div>
            ) : items.length === 0 ? (
              <div className="surface-card p-10 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
                  <ShoppingCart className="h-7 w-7" />
                </span>
                <h2 className="mt-5 text-lg font-extrabold">Your cart is empty</h2>
                <p className="mt-2 text-sm text-muted-foreground">Browse tests or packages to add your first item.</p>
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
            ) : (
              <>
                {items.map((item) => (
                  <div key={item.id} className="surface-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold">{item.catalogueItem?.name ?? "Item no longer available"}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {item.catalogueItem?.reportTimeHours ? (
                          <span>Reports in {item.catalogueItem.reportTimeHours <= 6 ? "same day" : `${item.catalogueItem.reportTimeHours}h`}</span>
                        ) : null}
                        <span className="rounded-full bg-muted px-2 py-0.5 font-bold text-foreground/70 uppercase">
                          {item.itemType}
                        </span>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs font-semibold">
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <select
                        value={item.familyMemberId ?? ""}
                        disabled={busyId === item.id}
                        onChange={(e) => handleAssignPatient(item, e.target.value)}
                        className="h-10 rounded-lg border border-border bg-muted px-2.5 text-xs font-semibold focus:outline-none"
                      >
                        <option value="">Choose patient</option>
                        {familyMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.relation})
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="flex items-center gap-4 sm:justify-end">
                      <p className="text-lg font-extrabold text-primary">₹{item.catalogueItem?.price ?? "—"}</p>
                      <button
                        onClick={() => handleRemove(item.id)}
                        disabled={busyId === item.id}
                        aria-label="Remove item"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-foreground/70 hover:border-destructive/40 hover:text-destructive disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex justify-center gap-3 pt-2">
                  <Link to="/tests">
                    <ActionButton variant="outline" size="md">
                      <Plus className="h-4 w-4" /> Add another test
                    </ActionButton>
                  </Link>
                  <Link to="/packages">
                    <ActionButton variant="outline" size="md">
                      <Plus className="h-4 w-4" /> Add a package
                    </ActionButton>
                  </Link>
                </div>
              </>
            )}
          </div>

          {items.length > 0 ? (
            <aside className="w-full space-y-4 lg:sticky lg:top-24 lg:w-[340px] lg:shrink-0">
              <div className="surface-card p-6">
                <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Order summary</h2>
                <div className={cn("mt-4 flex items-center justify-between border-t border-dashed border-border pt-4 text-sm")}>
                  <span className="text-muted-foreground">Subtotal ({items.length} items)</span>
                  <span className="font-bold">₹{subtotal}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Collection fee and any coupon discount are calculated at checkout.</p>
                <ActionButton
                  variant="primary"
                  size="lg"
                  className="mt-5 w-full"
                  onClick={() => navigate({ to: "/checkout" })}
                  disabled={items.some((i) => !i.catalogueItem)}
                >
                  Proceed to checkout <ArrowRight className="h-4 w-4" />
                </ActionButton>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </section>
  );
}
