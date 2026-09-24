import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { LabLayout } from "@/components/lab/LabLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { labPrescriptionsApi, type LabPrescription } from "@/lib/lab-api";
import { apiFileUrl } from "@/lib/api";

export const Route = createFileRoute("/lab/prescriptions")({
  head: () => ({ meta: [{ title: "Prescriptions — Lab Dashboard" }, { name: "robots", content: "noindex" }] }),
  component: LabPrescriptionsPage,
});

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function LabPrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState<LabPrescription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    labPrescriptionsApi.list().then(setPrescriptions).finally(() => setLoading(false));
  }, []);

  return (
    <LabLayout activePath="/lab/prescriptions">
      <AdminPageHeader
        title="Prescriptions"
        description={`${prescriptions.length} prescription${prescriptions.length === 1 ? "" : "s"} routed to your lab by pincode`}
      />

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th>Uploaded</Th>
              <Th>Patient</Th>
              <Th>Pincode</Th>
              <Th>Note</Th>
              <Th>File</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={6} />
            ) : prescriptions.length === 0 ? (
              <TableEmptyState icon={FileText} message="No prescriptions routed to your lab yet." colSpan={6} />
            ) : (
              prescriptions.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(p.createdAt)}</Td>
                  <Td className="whitespace-nowrap">
                    <p className="font-semibold">{p.user.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{p.user.phone}</p>
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{p.pincode ?? "—"}</Td>
                  <Td className="max-w-56 truncate text-muted-foreground">{p.note ?? "—"}</Td>
                  <Td>
                    <a href={apiFileUrl(p.fileUrl)} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                      View
                    </a>
                  </Td>
                  <Td>
                    <StatusBadge tone={p.status === "PENDING" ? "warning" : "success"}>{p.status === "PENDING" ? "Pending" : "Reviewed"}</StatusBadge>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      </div>
    </LabLayout>
  );
}
