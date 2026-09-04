import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronRight, Clock } from "lucide-react";
import { apiFileUrl, blogApi } from "@/lib/api";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const post = await blogApi.get(params.slug).catch(() => null);
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Article not found — MD Path Lab" }, { name: "robots", content: "noindex" }] };
    }
    const p = loaderData;
    return {
      meta: [
        { title: `${p.title} — MD Path Lab Blog` },
        { name: "description", content: p.excerpt },
        { property: "og:title", content: p.title },
        { property: "og:description", content: p.excerpt },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: BlogDetailPage,
});

function BlogDetailPage() {
  const post = Route.useLoaderData();
  const paragraphs = post.content.split(/\n\s*\n/).filter((p) => p.trim());

  return (
    <article className="py-12 lg:py-16">
      <div className="container-page mx-auto max-w-3xl">
        <nav className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link to="/blog" className="hover:text-primary">
            Blog
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="truncate text-primary">{post.title}</span>
        </nav>

        <span className="mt-6 inline-flex w-fit rounded-full bg-secondary-soft px-3 py-1 text-[11px] font-bold tracking-wide text-secondary uppercase">
          {post.category}
        </span>
        <h1 className="text-balance-tight mt-4 text-3xl leading-[1.1] sm:text-4xl">{post.title}</h1>

        <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-muted-foreground">
          {post.publishedAt ? (
            <span>
              {new Date(post.publishedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          ) : null}
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> {post.readTimeMinutes} min read
          </span>
        </div>

        <img
          src={apiFileUrl(post.coverImageUrl)}
          alt={post.title}
          className="mt-8 h-64 w-full rounded-[var(--radius-lg)] object-cover sm:h-96"
        />

        <div className="mt-8 space-y-5 text-base leading-relaxed text-foreground/90">
          {paragraphs.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>

        <div className="mt-10 border-t border-border pt-8">
          <Link to="/blog" className="text-sm font-bold text-primary hover:underline">
            ← Back to all articles
          </Link>
        </div>
      </div>
    </article>
  );
}
