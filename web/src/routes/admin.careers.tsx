import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { CareersManager } from "@/components/careers/CareersManager";
import { adminCareersApi } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/careers")({
  head: () => ({ meta: [{ title: "Careers — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminCareersPage,
});

function AdminCareersPage() {
  return (
    <AdminLayout activePath="/admin/careers">
      <CareersManager api={adminCareersApi} showPostedBy />
    </AdminLayout>
  );
}
