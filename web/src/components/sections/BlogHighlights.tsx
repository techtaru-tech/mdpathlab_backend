import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, Clock } from "lucide-react";
import { apiFileUrl, blogApi, type BlogPost } from "@/lib/api";
import { SectionHeading } from "@/components/ui-kit/SectionHeading";
import { RevealGroup, RevealItem } from "@/components/ui-kit/Reveal";

const HIGHLIGHT_LIMIT = 3;

export function BlogHighlights() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    blogApi
      .list()
      .then((rows) => setPosts(rows.slice(0, HIGHLIGHT_LIMIT)))
      .catch(() => setPosts([]))
      .finally(() => setLoaded(true));
  }, []);

  if (loaded && posts.length === 0) return null;

  return (
    <section className="py-10 lg:py-16">
      <div className="container-page">
        <SectionHeading
          eyebrow={
            <>
              <BookOpen className="h-3.5 w-3.5" /> From the blog
            </>
          }
          title="Health, explained simply"
          description="Doctor-reviewed explainers on lab tests, reports and preventive health."
          action={
            <Link
              to="/blog"
              className="flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
            >
              View all articles <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        />

        {!loaded ? (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-80 animate-pulse rounded-[var(--radius-lg)] bg-muted" />
            ))}
          </div>
        ) : (
          <RevealGroup className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
                      <h3 className="mt-4 text-base leading-snug font-bold">{p.title}</h3>
                      <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                        {p.excerpt}
                      </p>
                      <div className="mt-auto flex items-center gap-4 border-t border-border pt-5 text-xs font-semibold text-muted-foreground">
                        {p.publishedAt ? (
                          <span>{new Date(p.publishedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
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
  );
}
