import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBlogPostBySlug } from "@/hooks/useSupabasePublic";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "long",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: post, isLoading, isError } = useBlogPostBySlug(slug);

  if (!isSupabaseConfigured) {
    return (
      <div className="container mx-auto px-4 lg:px-8 py-24 max-w-2xl">
        <p className="text-muted-foreground mb-6">Stories from the team are not connected yet.</p>
        <Button variant="outline" asChild>
          <Link to="/news">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to News
          </Link>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 lg:px-8 py-24 max-w-3xl">
        <div className="h-8 w-2/3 bg-muted animate-pulse rounded mb-4" />
        <div className="h-4 w-1/3 bg-muted animate-pulse rounded mb-8" />
        <div className="space-y-3">
          <div className="h-4 bg-muted animate-pulse rounded" />
          <div className="h-4 bg-muted animate-pulse rounded" />
          <div className="h-4 w-5/6 bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (isError || !post) {
    return (
      <div className="container mx-auto px-4 lg:px-8 py-24 max-w-2xl text-center">
        <h1 className="font-display text-2xl font-semibold mb-2">Story not found</h1>
        <p className="text-muted-foreground mb-8">It may have been removed or the link is incorrect.</p>
        <Button asChild>
          <Link to="/news">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to News
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <article className="overflow-hidden pb-20">
      {post.cover_image_url && (
        <div className="w-full max-h-[min(420px,50vh)] overflow-hidden bg-muted">
          <img
            src={post.cover_image_url}
            alt=""
            className="w-full h-full max-h-[min(420px,50vh)] object-cover"
          />
        </div>
      )}
      <div className="container mx-auto px-4 lg:px-8 pt-12 max-w-3xl">
        <Button variant="ghost" className="mb-8 -ml-2 text-muted-foreground" asChild>
          <Link to="/news">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Blog &amp; Articles
          </Link>
        </Button>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            <Tag className="w-3 h-3 mr-1" />
            {post.category}
          </span>
          <span className="text-muted-foreground text-sm flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDate(post.published_at)}
          </span>
        </div>

        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-6">{post.title}</h1>
        {post.excerpt && <p className="text-lg text-muted-foreground mb-8 leading-relaxed">{post.excerpt}</p>}

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <div className="whitespace-pre-wrap text-foreground leading-relaxed">{post.body}</div>
        </div>
      </div>
    </article>
  );
}
