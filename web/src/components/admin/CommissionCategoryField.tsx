import { useEffect, useRef, useState } from "react";
import { adminPayoutsApi } from "@/lib/admin-payouts-api";

type ItemType = "PARAMETER" | "PROFILE" | "RADIOLOGY";
type Category = "ROUTINE" | "SPECIAL";

/**
 * "Commission category" (Routine / Special) inside a catalogue form — decides which MOU rate a doctor earns on the
 * test. begin(id) when the form opens, save(id) after the test itself is saved; the dropdown is \`field\`.
 */
export function useCommissionCategory(itemType: ItemType) {
  const special = useRef<Record<string, Category>>({});
  const [loaded, setLoaded] = useState(false);
  const [category, setCategory] = useState<Category>("ROUTINE");
  const [original, setOriginal] = useState<Category>("ROUTINE");

  useEffect(() => {
    adminPayoutsApi
      .specialItems()
      .then((m) => {
        special.current = m as Record<string, Category>;
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const begin = (id: string | null) => {
    const c: Category = id && special.current[`${itemType}:${id}`] === "SPECIAL" ? "SPECIAL" : "ROUTINE";
    setCategory(c);
    setOriginal(c);
  };

  /** Saves the category for the (just saved) test when it changed — a failure here never blocks the test's own save. */
  const save = async (id: string) => {
    if (category === original && special.current[`${itemType}:${id}`] !== undefined) return;
    if (category === "ROUTINE" && special.current[`${itemType}:${id}`] === undefined) return;
    try {
      await adminPayoutsApi.setCategories([{ itemType, itemId: id, category }]);
      if (category === "SPECIAL") special.current[`${itemType}:${id}`] = "SPECIAL";
      else delete special.current[`${itemType}:${id}`];
    } catch {
      // The test is saved; the category can be set again from Payouts → Test categories.
    }
  };

  const field = (
    <label className="block text-xs font-semibold text-muted-foreground">
      Commission category
      <select
        value={category}
        disabled={!loaded}
        onChange={(e) => setCategory(e.target.value as Category)}
        className="mt-1 h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm font-semibold text-foreground focus:outline-none"
      >
        <option value="ROUTINE">Routine — doctor gets their MOU's Routine %</option>
        <option value="SPECIAL">Special — doctor gets their MOU's Special %</option>
      </select>
    </label>
  );

  return { field, begin, save };
}
