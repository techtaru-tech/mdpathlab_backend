import { createFileRoute } from "@tanstack/react-router";
import { LabLayout } from "@/components/lab/LabLayout";
import { CareersManager } from "@/components/careers/CareersManager";
import { labCareersApi } from "@/lib/lab-api";

export const Route = createFileRoute("/lab/careers")({
  head: () => ({ meta: [{ title: "Careers — Lab Dashboard" }, { name: "robots", content: "noindex" }] }),
  component: LabCareersPage,
});

function LabCareersPage() {
  return (
    <LabLayout activePath="/lab/careers">
      <CareersManager api={labCareersApi} showPostedBy={false} />
    </LabLayout>
  );
}
