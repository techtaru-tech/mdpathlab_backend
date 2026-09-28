import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Plus, X } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import {
  AdminApiError,
  adminLabsApi,
  adminParametersApi,
  adminPackagesApi,
  adminTestsApi,
  adminRadiologyApi,
  type AdminLab,
  type AdminLabCatalogueItem,
  type AdminParameter,
  type AdminPackage,
  type AdminTest,
  type AdminRadiology,
  type CreateLabInput,
  type UpdateLabInput,
} from "@/lib/admin-api";

export const Route = createFileRoute("/admin/labs")({
  head: () => ({ meta: [{ title: "Labs — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminLabsPage,
});

const PAGE_SIZE = 10;

type FormState = {
  name: string;
  ownerName: string;
  email: string;
  password: string;
  phone: string;
  pincodesText: string;
  status: "ACTIVE" | "INACTIVE";
  address: string;
  accreditationNumber: string;
  pathologistName: string;
  pathologistQualification: string;
};

const emptyForm: FormState = {
  name: "",
  ownerName: "",
  email: "",
  password: "",
  phone: "",
  pincodesText: "",
  status: "ACTIVE",
  address: "",
  accreditationNumber: "",
  pathologistName: "",
  pathologistQualification: "",
};

function parsePincodes(text: string): string[] {
  return Array.from(new Set(text.split(/[\s,]+/).map((p) => p.trim()).filter((p) => /^\d{6}$/.test(p))));
}

type PickableItem = { itemType: "PARAMETER" | "PROFILE" | "PACKAGE" | "RADIOLOGY"; id: string; name: string };

function AdminLabsPage() {
  const [labs, setLabs] = useState<AdminLab[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const [catalogueLabId, setCatalogueLabId] = useState<string | null>(null);
  const [parameters, setParameters] = useState<AdminParameter[]>([]);
  const [tests, setTests] = useState<AdminTest[]>([]);
  const [packages, setPackages] = useState<AdminPackage[]>([]);
  const [radiologyTests, setRadiologyTests] = useState<AdminRadiology[]>([]);
  const [selectedItems, setSelectedItems] = useState<AdminLabCatalogueItem[]>([]);
  const [catalogueSaving, setCatalogueSaving] = useState(false);
  const [catalogueSearch, setCatalogueSearch] = useState("");

  function load() {
    setLoading(true);
    adminLabsApi.list().then(setLabs).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  }

  function startEdit(lab: AdminLab) {
    setEditingId(lab.id);
    setForm({
      name: lab.name,
      ownerName: lab.ownerName ?? "",
      email: lab.email,
      password: "",
      phone: lab.phone,
      pincodesText: lab.servicePincodes.join(", "),
      status: lab.status,
      address: lab.address ?? "",
      accreditationNumber: lab.accreditationNumber ?? "",
      pathologistName: lab.pathologistName ?? "",
      pathologistQualification: lab.pathologistQualification ?? "",
    });
    setError("");
    setShowForm(true);
  }

  async function handleSave() {
    setError("");
    const servicePincodes = parsePincodes(form.pincodesText);
    try {
      if (editingId) {
        const dto: UpdateLabInput = {
          name: form.name,
          phone: form.phone,
          servicePincodes,
          status: form.status,
          ...(form.ownerName ? { ownerName: form.ownerName } : {}),
          ...(form.password ? { password: form.password } : {}),
          ...(form.address ? { address: form.address } : {}),
          ...(form.accreditationNumber ? { accreditationNumber: form.accreditationNumber } : {}),
          ...(form.pathologistName ? { pathologistName: form.pathologistName } : {}),
          ...(form.pathologistQualification ? { pathologistQualification: form.pathologistQualification } : {}),
        };
        const updated = await adminLabsApi.update(editingId, dto);
        setLabs((prev) => prev.map((l) => (l.id === editingId ? { ...updated, catalogueItems: l.catalogueItems, phlebotomists: l.phlebotomists } : l)));
      } else {
        if (!form.password || form.password.length < 8) {
          setError("Password must be at least 8 characters");
          return;
        }
        const dto: CreateLabInput = {
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone,
          servicePincodes,
          ...(form.ownerName ? { ownerName: form.ownerName } : {}),
          ...(form.address ? { address: form.address } : {}),
          ...(form.accreditationNumber ? { accreditationNumber: form.accreditationNumber } : {}),
          ...(form.pathologistName ? { pathologistName: form.pathologistName } : {}),
          ...(form.pathologistQualification ? { pathologistQualification: form.pathologistQualification } : {}),
        };
        const created = await adminLabsApi.create(dto);
        setLabs((prev) => [{ ...created, catalogueItems: [], phlebotomists: [] }, ...prev]);
      }
      setShowForm(false);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't save lab");
    }
  }

  async function toggleStatus(lab: AdminLab) {
    setSavingId(lab.id);
    try {
      const updated = await adminLabsApi.update(lab.id, { status: lab.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      setLabs((prev) => prev.map((l) => (l.id === lab.id ? { ...l, status: updated.status } : l)));
    } finally {
      setSavingId(null);
    }
  }

  async function openCatalogue(lab: AdminLab) {
    setCatalogueLabId(lab.id);
    setSelectedItems(lab.catalogueItems);
    setCatalogueSearch("");
    if (parameters.length === 0) adminParametersApi.list().then(setParameters);
    if (tests.length === 0) adminTestsApi.list().then(setTests);
    if (packages.length === 0) adminPackagesApi.list().then(setPackages);
    if (radiologyTests.length === 0) adminRadiologyApi.list().then(setRadiologyTests);
  }

  const pickableItems = useMemo<PickableItem[]>(
    () => [
      ...tests.map((t) => ({ itemType: "PROFILE" as const, id: t.id, name: t.name })),
      ...packages.map((p) => ({ itemType: "PACKAGE" as const, id: p.id, name: p.name })),
      ...parameters.map((p) => ({ itemType: "PARAMETER" as const, id: p.id, name: p.name })),
      ...radiologyTests.map((r) => ({ itemType: "RADIOLOGY" as const, id: r.id, name: r.name })),
    ],
    [tests, packages, parameters, radiologyTests],
  );

  const filteredPickable = pickableItems.filter((i) => i.name.toLowerCase().includes(catalogueSearch.trim().toLowerCase()));

  function isItemSelected(itemType: PickableItem["itemType"], id: string) {
    return selectedItems.some((i) => i.itemType === itemType && i.itemId === id);
  }

  function toggleCatalogueItem(itemType: PickableItem["itemType"], id: string) {
    setSelectedItems((prev) => {
      const exists = prev.some((i) => i.itemType === itemType && i.itemId === id);
      return exists ? prev.filter((i) => !(i.itemType === itemType && i.itemId === id)) : [...prev, { itemType, itemId: id }];
    });
  }

  async function saveCatalogue() {
    if (!catalogueLabId) return;
    setCatalogueSaving(true);
    try {
      const saved = await adminLabsApi.setCatalogue(catalogueLabId, selectedItems);
      setLabs((prev) => prev.map((l) => (l.id === catalogueLabId ? { ...l, catalogueItems: saved } : l)));
      setCatalogueLabId(null);
    } finally {
      setCatalogueSaving(false);
    }
  }

  const { page, setPage, pageCount, paged, total } = usePagedList(labs, PAGE_SIZE);
  const catalogueLab = labs.find((l) => l.id === catalogueLabId);

  return (
    <AdminLayout activePath="/admin/labs">
      <AdminPageHeader
        title="Labs"
        description={`${labs.length} partner lab${labs.length === 1 ? "" : "s"} registered on the platform`}
        actions={
          <ActionButton type="button" onClick={startCreate} variant={showForm ? "outline" : "primary"} size="sm">
            <Plus className="h-4 w-4" /> Register lab
          </ActionButton>
        }
      />

      {showForm ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Lab name (e.g. MD Path Lab — Jaipur Mansarowar)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none sm:col-span-2"
          />
          <input
            value={form.ownerName}
            onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
            placeholder="Owner name (optional)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="Phone (10-digit mobile)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="Login email"
            disabled={Boolean(editingId)}
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none disabled:opacity-60"
          />
          <input
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            type="password"
            placeholder={editingId ? "New password (leave blank to keep current)" : "Login password (min 8 characters)"}
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <textarea
            value={form.pincodesText}
            onChange={(e) => setForm((f) => ({ ...f, pincodesText: e.target.value }))}
            placeholder="Service pincodes, comma or space separated (e.g. 302020, 302019)"
            rows={2}
            className="h-auto rounded-lg border border-border bg-muted p-3 text-sm focus:outline-none sm:col-span-2"
          />

          <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase sm:col-span-2">
            Report letterhead details (printed on auto-generated reports)
          </p>
          <textarea
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="Lab address (for report letterhead)"
            rows={2}
            className="h-auto rounded-lg border border-border bg-muted p-3 text-sm focus:outline-none sm:col-span-2"
          />
          <input
            value={form.accreditationNumber}
            onChange={(e) => setForm((f) => ({ ...f, accreditationNumber: e.target.value }))}
            placeholder="NABL/CAP accreditation number (optional)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            value={form.pathologistName}
            onChange={(e) => setForm((f) => ({ ...f, pathologistName: e.target.value }))}
            placeholder="Pathologist name (for report sign-off)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <input
            value={form.pathologistQualification}
            onChange={(e) => setForm((f) => ({ ...f, pathologistQualification: e.target.value }))}
            placeholder="Pathologist qualification (e.g. MD Pathology)"
            className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none sm:col-span-2"
          />

          {editingId ? (
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "ACTIVE" | "INACTIVE" }))}
              className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          ) : null}
          {error ? <p className="text-xs font-semibold text-destructive sm:col-span-2">{error}</p> : null}
          <div className="flex gap-2 sm:col-span-2">
            <ActionButton type="button" onClick={handleSave} variant="primary" size="sm">
              Save
            </ActionButton>
            <ActionButton type="button" onClick={() => setShowForm(false)} variant="outline" size="sm">
              Cancel
            </ActionButton>
          </div>
        </div>
      ) : null}

      {catalogueLabId && catalogueLab ? (
        <div className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">Tests/packages/radiology available at {catalogueLab.name}</p>
              <p className="text-xs text-muted-foreground">{selectedItems.length} item(s) selected</p>
            </div>
            <button onClick={() => setCatalogueLabId(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            value={catalogueSearch}
            onChange={(e) => setCatalogueSearch(e.target.value)}
            placeholder="Search tests, packages, parameters…"
            className="mt-3 h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
          />
          <div className="mt-3 grid max-h-80 gap-1.5 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
            {filteredPickable.map((i) => (
              <label key={`${i.itemType}:${i.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <input type="checkbox" checked={isItemSelected(i.itemType, i.id)} onChange={() => toggleCatalogueItem(i.itemType, i.id)} />
                {i.name}
                <span className="text-[10px] font-bold text-muted-foreground uppercase">
                  {i.itemType === "PROFILE"
                    ? "Test"
                    : i.itemType === "PACKAGE"
                      ? "Package"
                      : i.itemType === "RADIOLOGY"
                        ? "Radiology"
                        : "Parameter"}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <ActionButton type="button" onClick={saveCatalogue} variant="primary" size="sm" disabled={catalogueSaving}>
              {catalogueSaving ? "Saving…" : "Save catalogue"}
            </ActionButton>
            <ActionButton type="button" onClick={() => setSelectedItems(pickableItems.map((i) => ({ itemType: i.itemType, itemId: i.id })))} variant="outline" size="sm">
              Select all
            </ActionButton>
            <ActionButton type="button" onClick={() => setSelectedItems([])} variant="outline" size="sm">
              Clear
            </ActionButton>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th>Lab</Th>
              <Th>Contact</Th>
              <Th>Pincodes</Th>
              <Th align="right">Catalogue</Th>
              <Th align="right">Phlebotomists</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={7} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={Building2} message="No labs registered yet." colSpan={7} />
            ) : (
              paged.map((lab) => (
                <tr key={lab.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap">
                    <p className="font-semibold">{lab.name}</p>
                    {lab.ownerName ? <p className="text-xs text-muted-foreground">{lab.ownerName}</p> : null}
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">
                    <p>{lab.phone}</p>
                    <p className="text-xs">{lab.email}</p>
                  </Td>
                  <Td className="max-w-xs">
                    <div className="flex flex-wrap gap-1">
                      {lab.servicePincodes.length === 0 ? (
                        <span className="text-xs text-muted-foreground">None set</span>
                      ) : (
                        lab.servicePincodes.map((p) => (
                          <span key={p} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">
                            {p}
                          </span>
                        ))
                      )}
                    </div>
                  </Td>
                  <Td align="right">
                    <button onClick={() => openCatalogue(lab)} className="text-xs font-bold text-primary hover:underline">
                      {lab.catalogueItems.length} item(s)
                    </button>
                  </Td>
                  <Td align="right" className="text-muted-foreground">
                    {lab.phlebotomists.length}
                  </Td>
                  <Td>
                    <button onClick={() => toggleStatus(lab)} disabled={savingId === lab.id} className="disabled:opacity-60">
                      <StatusBadge tone={lab.status === "ACTIVE" ? "success" : "danger"}>{lab.status === "ACTIVE" ? "Active" : "Inactive"}</StatusBadge>
                    </button>
                  </Td>
                  <Td align="right">
                    <button onClick={() => startEdit(lab)} className="text-xs font-bold text-primary hover:underline">
                      Edit
                    </button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      </div>

      {!loading ? <AdminPagination page={page} pageCount={pageCount} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} /> : null}
    </AdminLayout>
  );
}
