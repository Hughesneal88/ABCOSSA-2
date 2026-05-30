import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar, Tag, Megaphone, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { usePublicAnnouncements, usePublicBlogPosts } from "@/hooks/useSupabasePublic";

const staticArticles = [
  {
    date: "January 8, 2026",
    category: "Research",
    title: "New Study Reveals Critical Wildlife Corridors in East Africa",
    excerpt:
      "Our latest research identifies key migration routes essential for elephant and wildebeest populations, providing crucial data for regional conservation planning.",
    featured: true,
  },
  {
    date: "January 5, 2026",
    category: "Events",
    title: "Annual Conservation Conference 2026 Announced",
    excerpt:
      "Join us this March for our flagship conference bringing together leading conservationists from across the continent.",
    featured: false,
  },
  {
    date: "December 28, 2025",
    category: "Achievement",
    title: "ABCOSSA Receives Excellence in Conservation Award",
    excerpt: "Recognition for our outstanding contributions to community-based conservation across East Africa.",
    featured: false,
  },
  {
    date: "December 15, 2025",
    category: "Partnership",
    title: "New Partnership with Global Conservation Fund",
    excerpt: "A strategic collaboration that will expand our research capacity and community outreach programs.",
    featured: false,
  },
  {
    date: "December 10, 2025",
    category: "Research",
    title: "Breakthrough in Ecosystem Restoration Techniques",
    excerpt: "Our researchers develop innovative methods for rehabilitating degraded forest ecosystems.",
    featured: false,
  },
];

const staticCategories = ["All", "Research", "Events", "Achievement", "Partnership", "Announcement"];

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function NewsPage() {
  const useLive = isSupabaseConfigured;
  const { data: announcements = [], isLoading: annLoading } = usePublicAnnouncements();
  const { data: blogPosts = [], isLoading: blogLoading } = usePublicBlogPosts();
  const loading = useLive && (annLoading || blogLoading);

  const liveCategories = useMemo(() => {
    const s = new Set(blogPosts.map((p) => p.category));
    return ["All", ...Array.from(s).sort()];
  }, [blogPosts]);

  const categories = useLive ? liveCategories : staticCategories;
  const [filter, setFilter] = useState("All");

  const filteredStatic = useMemo(() => {
    if (filter === "All") return staticArticles;
    return staticArticles.filter((a) => a.category === filter);
  }, [filter]);

  const filteredBlog = useMemo(() => {
    if (filter === "All") return blogPosts;
    return blogPosts.filter((p) => p.category === filter);
  }, [blogPosts, filter]);

  return (
    <div className="overflow-hidden">
      <section className="relative py-20 md:py-28 bg-gradient-nature">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-foreground mb-6 animate-fade-up">
              Blog & Articles
            </h1>
            <p className="text-xl text-primary-foreground/90 animate-fade-up delay-100">
              Stay informed about our latest research, events, achievements, and conservation updates.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2">
              {useLive && announcements.length > 0 && (
                <div className="mb-12 space-y-4">
                  <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-primary" />
                    Announcements
                  </h2>
                  <ul className="space-y-3">
                    {announcements.map((a) => (
                      <li
                        key={a.id}
                        className="card-nature p-4 rounded-xl border-l-4 border-accent text-sm"
                      >
                        <p className="font-semibold text-foreground mb-1">{a.title}</p>
                        <p className="text-muted-foreground whitespace-pre-wrap mb-2">{a.body}</p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(a.created_at)}
                          </span>
                          {a.link_url && (
                            <a
                              href={a.link_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary font-medium hover:underline"
                            >
                              Link <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mb-8">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setFilter(category)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      category === filter
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="space-y-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="card-nature rounded-2xl p-6 animate-pulse">
                      <div className="h-4 w-24 bg-muted rounded mb-3" />
                      <div className="h-6 w-3/4 bg-muted rounded mb-3" />
                      <div className="h-4 w-full bg-muted rounded" />
                    </div>
                  ))}
                </div>
              ) : useLive ? (
                <div className="space-y-6">
                  {filteredBlog.length === 0 ? (
                    <p className="text-muted-foreground py-8">
                      No stories in this category yet. Check back soon or visit the staff portal to add one.
                    </p>
                  ) : (
                    filteredBlog.map((article, index) => (
                      <article
                        key={article.id}
                        className="card-nature rounded-2xl overflow-hidden hover:shadow-elevated transition-all duration-300 animate-fade-up"
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        {article.cover_image_url && (
                          <Link to={`/news/${article.slug}`} className="block aspect-[21/9] overflow-hidden bg-muted">
                            <img
                              src={article.cover_image_url}
                              alt=""
                              className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-300"
                            />
                          </Link>
                        )}
                        <div className="p-6">
                          <div className="flex items-center gap-3 mb-3">
                            <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                              <Tag className="w-3 h-3 mr-1" />
                              {article.category}
                            </span>
                            <span className="text-muted-foreground text-sm flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(article.published_at)}
                            </span>
                          </div>
                          <h3 className="font-display text-xl font-semibold text-foreground mb-3">
                            <Link
                              to={`/news/${article.slug}`}
                              className="hover:text-primary transition-colors"
                            >
                              {article.title}
                            </Link>
                          </h3>
                          {article.excerpt && (
                            <p className="text-muted-foreground mb-4">{article.excerpt}</p>
                          )}
                          <Link
                            to={`/news/${article.slug}`}
                            className="inline-flex items-center gap-2 text-primary font-medium hover:gap-3 transition-all"
                          >
                            Read more <ArrowRight className="w-4 h-4" />
                          </Link>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredStatic.map((article, index) => (
                    <article
                      key={article.title}
                      className={`card-nature rounded-2xl overflow-hidden hover:shadow-elevated transition-all duration-300 animate-fade-up ${
                        article.featured ? "border-l-4 border-accent" : ""
                      }`}
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <div className="p-6">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                            <Tag className="w-3 h-3 mr-1" />
                            {article.category}
                          </span>
                          <span className="text-muted-foreground text-sm flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {article.date}
                          </span>
                          {article.featured && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full bg-accent/20 text-accent text-xs font-medium">
                              Featured
                            </span>
                          )}
                        </div>
                        <h3 className="font-display text-xl font-semibold text-foreground mb-3">{article.title}</h3>
                        <p className="text-muted-foreground mb-4">{article.excerpt}</p>
                        <span className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                          Connect Supabase to enable full story pages from the staff portal.
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}

            </div>

            <div className="space-y-8">
              <div className="card-nature p-6 rounded-2xl">
                <h3 className="font-display text-lg font-semibold text-foreground mb-4">Media inquiries</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  For press releases, interviews, or media coverage, please contact our communications team.
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/contact">Contact press office</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
