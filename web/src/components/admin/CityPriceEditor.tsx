import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { adminCitiesApi, type AdminCity, type CityPriceRow } from "@/lib/admin-api";

/**
 * "City-wise pricing" rows for a Test/Package/Parameter admin form — one row per city that
 * should charge something other than the item's own mrp/price above. A city left out here just
 * falls back to that flat mrp/price, exactly like the single-price behavior before this existed.
 */
export function CityPriceEditor({ rows, onChange }: { rows: CityPriceRow[]; onChange: (rows: CityPriceRow[]) => void }) {
  const [cities, setCities] = useState<AdminCity[]>([]);

  useEffect(() => {
    adminCitiesApi.list().then(setCities).catch(() => {});
  }, []);

  const usedCityIds = new Set(rows.map((r) => r.cityId));
  const availableCities = cities.filter((c) => !usedCityIds.has(c.id));
  const cityName = (id: string) => cities.find((c) => c.id === id)?.name ?? id;

  function addRow() {
    const next = availableCities[0];
    if (!next) return;
    onChange([...rows, { cityId: next.id, mrp: 0, price: 0 }]);
  }

  function updateRow(index: number, patch: Partial<CityPriceRow>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="sm:col-span-2">
      <div className="flex items-center justify-between">
        <span className="block text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
          City-wise pricing (optional)
        </span>
        <button
          type="button"
          onClick={addRow}
          disabled={availableCities.length === 0}
          className="flex items-center gap-1 text-xs font-bold text-primary hover:underline disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add city
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        A city not listed here uses the MRP/selling price above.
      </p>

      {rows.length > 0 ? (
        <div className="mt-2 space-y-2">
          {rows.map((row, i) => (
            <div key={row.cityId} className="grid grid-cols-[1.2fr_1fr_1fr_auto] items-center gap-2">
              <select
                value={row.cityId}
                onChange={(e) => updateRow(i, { cityId: e.target.value })}
                className="h-10 rounded-lg border border-border bg-muted px-2.5 text-sm font-semibold focus:outline-none"
              >
                <option value={row.cityId}>{cityName(row.cityId)}</option>
                {availableCities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                value={row.mrp}
                onChange={(e) => updateRow(i, { mrp: Number(e.target.value) })}
                placeholder="MRP"
                className="h-10 rounded-lg border border-border bg-muted px-2.5 text-sm focus:outline-none"
              />
              <input
                type="number"
                min={0}
                value={row.price}
                onChange={(e) => updateRow(i, { price: Number(e.target.value) })}
                placeholder="Selling price"
                className="h-10 rounded-lg border border-border bg-muted px-2.5 text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
