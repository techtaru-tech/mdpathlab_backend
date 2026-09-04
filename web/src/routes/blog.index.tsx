import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Clock } from "lucide-react";
import { apiFileUrl, blogApi } from "@/lib/api";
import { PageHero } from "@/components/ui-kit/PageHero";
import { RevealGroup, RevealItem } from "@/components/ui-kit/Reveal";

const title = "Health Blog — MD Path Lab";
const description =
  "Simple, doctor-reviewed explainers on lab tests, preventive health and how to read your reports — from the MD Path Lab medical team.";

export const Route = createFileRoute("/blog/")({
  loader: () => blogApi.list().catch(() => []),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BlogPage,
});

function BlogPage() {
  const posts = Route.useLoaderData();

  return (
    <>
      <PageHero
        crumb="Blog"
        eyebrow="Health, explained simply"
        title="The MD Path Lab health blog"
        description="Doctor-reviewed explainers on lab tests, reports and preventive health — written in plain language, not medical jargon."
      />

      <section className="py-12 lg:py-16">
        <div className="container-page">
          {posts.length === 0 ? (
            <div className="surface-card flex flex-col items-center gap-3 p-14 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">
                <BookOpen className="h-5.5 w-5.5" />
              </span>
              <p className="text-lg font-extrabold">More articles coming soon</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Our medical board publishes new explainers regularly. Check back soon.
              </p>
            </div>
          ) : (
            <RevealGroup className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((p) => (
                <RevealItem key={p.id} className="h-full">
                  <Link to="/blog/$slug" params={{ slug: p.slug }} className="group block h-full">
                    <article className="surface-card lift-on-hover flex h-full flex-col overflow-hidden">
                      <img
                        src={apiFileUrl(p.coverImageUrl)}
                        alt={p.title}
                        className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="flex flex-1 flex-col p-6">
                        <span className="w-fit rounded-full bg-secondary-soft px-2.5 py-1 text-[10px] font-bold tracking-wide text-secondary uppercase">
                          {p.category}
                        </span>
                        <h2 className="mt-4 text-base leading-snug font-bold">{p.title}</h2>
                        <p className="mt-2.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                          {p.excerpt}
                        </p>
                        <div className="mt-auto flex items-center gap-4 border-t border-border pt-5 text-xs font-semibold text-muted-foreground">
                          {p.publishedAt ? (
                            <span>
                              {new Date(p.publishedAt).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          ) : null}
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" /> {p.readTimeMinutes} min read
                          </span>
                        </div>
                      </div>
                    </article>
                  </Link>
                </RevealItem>
              ))}
            </RevealGroup>
          )}
        </div>
      </section>
    </>
  );
}
