import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { settingsApi } from "@/lib/api";
import { PageHero } from "@/components/ui-kit/PageHero";
import { BackToLogin } from "@/components/ui-kit/BackToLogin";

const title = "Privacy Policy — MD Path Lab";

export const Route = createFileRoute("/privacy-policy")({
  // ?from=login: opened from the login page's checkbox, so offer a way straight back to it.
  validateSearch: z.object({ from: z.literal("login").optional(), redirect: z.string().optional() }),
  loader: () => settingsApi.get().catch(() => null),
  head: () => ({ meta: [{ title }, { name: "robots", content: "noindex" }] }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  const settings = Route.useLoaderData();
  const { from, redirect } = Route.useSearch();
  const content = settings?.privacyPolicyContent?.trim();
  const paragraphs = content ? content.split(/\n\s*\n/).filter((p) => p.trim()) : [];

  return (
    <>
      <PageHero
        crumb="Privacy Policy"
        eyebrow="Legal"
        title="Privacy Policy"
        description="How MD Path Lab collects, uses and protects your personal and health information."
      />
      <section className="py-12 lg:py-16">
        <div className="container-page mx-auto max-w-3xl">
          {from === "login" ? <BackToLogin redirect={redirect} className="mb-8" /> : null}
          {paragraphs.length === 0 ? (
            <p className="text-sm text-muted-foreground">This page hasn't been published yet.</p>
          ) : (
            <div className="space-y-5 text-base leading-relaxed text-foreground/90">
              {paragraphs.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          )}
          {from === "login" ? <BackToLogin redirect={redirect} className="mt-10" /> : null}
        </div>
      </section>
    </>
  );
}
