import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export type PublicEventRow = {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  register_url: string | null;
  featured: boolean;
  cover_image_url: string | null;
};

export type PublicAnnouncementRow = {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
  created_at: string;
};

export type PublicBlogRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string;
  category: string;
  cover_image_url: string | null;
  published_at: string;
};

export function usePublicEvents() {
  return useQuery({
    queryKey: ["public-events"],
    queryFn: async (): Promise<PublicEventRow[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("events")
        .select("id,title,description,event_type,location,starts_at,ends_at,register_url,featured,cover_image_url")
        .eq("is_published", true)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data as PublicEventRow[]) ?? [];
    },
    enabled: isSupabaseConfigured,
  });
}

export function useUpcomingPublicEvents(limit = 3) {
  return useQuery({
    queryKey: ["public-events-upcoming", limit],
    queryFn: async (): Promise<PublicEventRow[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("events")
        .select("id,title,description,event_type,location,starts_at,ends_at,register_url,featured,cover_image_url")
        .eq("is_published", true)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data as PublicEventRow[]) ?? [];
    },
    enabled: isSupabaseConfigured,
  });
}

export function usePublicAnnouncements() {
  return useQuery({
    queryKey: ["public-announcements"],
    queryFn: async (): Promise<PublicAnnouncementRow[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("announcements")
        .select("id,title,body,link_url,created_at")
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as PublicAnnouncementRow[]) ?? [];
    },
    enabled: isSupabaseConfigured,
  });
}

export function usePublicBlogPosts() {
  return useQuery({
    queryKey: ["public-blog"],
    queryFn: async (): Promise<PublicBlogRow[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id,title,slug,excerpt,body,category,cover_image_url,published_at")
        .eq("is_published", true)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data as PublicBlogRow[]) ?? [];
    },
    enabled: isSupabaseConfigured,
  });
}

export type PublicLeadershipMember = {
  id: string;
  name: string;
  role: string;
  bio: string;
  image_url: string | null;
  display_order: number;
};

export function useLeadershipMembers() {
  return useQuery({
    queryKey: ["leadership-members"],
    queryFn: async (): Promise<PublicLeadershipMember[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("leadership_members")
        .select("id,name,role,bio,image_url,display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data as PublicLeadershipMember[]) ?? [];
    },
    enabled: isSupabaseConfigured,
  });
}

export function useSiteSetting(key: string) {
  return useQuery({
    queryKey: ["site-setting", key],
    queryFn: async (): Promise<string | null> => {
      if (!supabase) return null;
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return (data as { value: string } | null)?.value ?? null;
    },
    enabled: isSupabaseConfigured,
  });
}

export type LecturerLink = { label: string; url: string };

export type PublicLecturer = {
  id: string;
  name: string;
  bio: string | null;
  research_interests: string[];
  email: string | null;
  image_url: string | null;
  display_order: number;
  links: LecturerLink[];
};

export function useLecturers() {
  return useQuery({
    queryKey: ["lecturers"],
    queryFn: async (): Promise<PublicLecturer[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("lecturers")
        .select("id,name,bio,research_interests,email,image_url,display_order,links")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data as PublicLecturer[]) ?? [];
    },
    enabled: isSupabaseConfigured,
  });
}

export type PublicResearchWork = {
  id: string;
  title: string;
  author_name: string;
  author_type: string;
  category: string;
  abstract: string | null;
  year: number | null;
  link_url: string | null;
  file_url: string | null;
  tags: string[];
  created_at: string;
};

export function usePublishedResearchWorks() {
  return useQuery({
    queryKey: ["research-works-public"],
    queryFn: async (): Promise<PublicResearchWork[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("research_works")
        .select("id,title,author_name,author_type,category,abstract,year,link_url,file_url,tags,created_at")
        .eq("is_published", true)
        .order("year", { ascending: false });
      if (error) throw error;
      return (data as PublicResearchWork[]) ?? [];
    },
    enabled: isSupabaseConfigured,
  });
}

export type SiteImageMap = Record<string, string>;

export function useSiteImages() {
  return useQuery({
    queryKey: ["site-images"],
    queryFn: async (): Promise<SiteImageMap> => {
      if (!supabase) return {};
      const { data, error } = await supabase
        .from("site_images")
        .select("key,url");
      if (error) throw error;
      return Object.fromEntries(
        (data as { key: string; url: string }[]).map((r) => [r.key, r.url]),
      );
    },
    enabled: isSupabaseConfigured,
  });
}

export type PublicResource = {
  id: string;
  year: string;
  semester: string;
  label: string;
  drive_url: string;
  display_order: number;
};

export function usePublicResources() {
  return useQuery({
    queryKey: ["public-resources"],
    queryFn: async (): Promise<PublicResource[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("resources")
        .select("id,year,semester,label,drive_url,display_order")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data as PublicResource[]) ?? [];
    },
    enabled: isSupabaseConfigured,
  });
}

export function useBlogPostBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ["blog-post", slug],
    queryFn: async (): Promise<PublicBlogRow | null> => {
      if (!supabase || !slug) return null;
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id,title,slug,excerpt,body,category,cover_image_url,published_at")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      return data as PublicBlogRow | null;
    },
    enabled: isSupabaseConfigured && Boolean(slug),
  });
}
