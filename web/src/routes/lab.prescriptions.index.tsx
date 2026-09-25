import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { LabLayout } from "@/components/lab/LabLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { labPrescriptionsApi, type LabPrescription } from "@/lib/lab-api";

export const Route = createFileRoute("/lab/prescriptions/")({
  head: () => ({ meta: [{ title: "Prescriptions — Lab Dashboard" }, { name: "robots", content: "noindex" }] }),
  component: LabPrescriptionsPage,
});

const stageMeta: Record<string, { label: string; tone: "warning" | "success" | "primary" | "secondary" | "danger" }> = {
  UPLOADED: { label: "New", tone: "warning" },
  UNDER_REVIEW: { label: "Under review", tone: "primary" },
  ACTION_REQUIRED: { label: "Action required", tone: "danger" },
  REVIEWED: { label: "Tests recommended", tone: "success" },
  READY_FOR_BOOKING: { label: "Ready for booking", tone: "success" },
  BOOKING_CONFIRMED: { label: "Booking confirmed", tone: "success" },
};

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
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={5} />
            ) : prescriptions.length === 0 ? (
              <TableEmptyState icon={FileText} message="No prescriptions routed to your lab yet." colSpan={5} />
            ) : (
              prescriptions.map((p) => {
                const stage = stageMeta[p.labStage ?? "UPLOADED"] ?? stageMeta['UPLOADED']!;
                return (
                  <tr key={p.id} className="transition-colors hover:bg-muted/40">
                    <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(p.createdAt)}</Td>
                    <Td className="whitespace-nowrap">
                      <Link to="/lab/prescriptions/$id" params={{ id: p.id }} className="font-semibold text-primary hover:underline">
                        {p.user.name ?? p.user.phone}
                      </Link>
                      <p className="text-xs text-muted-foreground">{p.user.phone}</p>
                    </Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{p.pincode ?? "—"}</Td>
                    <Td className="max-w-56 truncate text-muted-foreground">{p.note ?? "—"}</Td>
                    <Td>
                      <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableShell>
      </div>
    </LabLayout>
  );
}
