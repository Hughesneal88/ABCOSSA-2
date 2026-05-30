import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { INTERNSHIPS_DATA_URL } from "@/config/site";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

const internshipSchema = z.object({
  title: z.string(),
  organization: z.string(),
  location: z.string().optional(),
  timeframe: z.string().optional(),
  deadline: z.string().optional(),
  description: z.string(),
  applyUrl: z
    .string()
    .optional()
    .transform((s) => {
      const t = s?.trim();
      if (!t) return undefined;
      try {
        new URL(t);
        return t;
      } catch {
        return undefined;
      }
    }),
  tags: z.array(z.string()).optional(),
  coverImageUrl: z.string().optional(),
  logoUrl: z.string().optional(),
});

export type Internship = z.infer<typeof internshipSchema>;

const listSchema = z.array(internshipSchema);

type DbInternshipRow = {
  title: string;
  organization: string;
  location: string | null;
  timeframe: string | null;
  deadline: string | null;
  description: string;
  apply_url: string | null;
  tags: string[] | null;
  cover_image_url: string | null;
  logo_url: string | null;
};

function mapDbRow(row: DbInternshipRow): Internship {
  return {
    title: row.title,
    organization: row.organization,
    location: row.location ?? undefined,
    timeframe: row.timeframe ?? undefined,
    deadline: row.deadline ?? undefined,
    description: row.description,
    applyUrl: row.apply_url ?? undefined,
    tags: row.tags?.length ? row.tags : undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    logoUrl: row.logo_url ?? undefined,
  };
}

export function useInternships() {
  return useQuery({
    queryKey: ["internships", isSupabaseConfigured ? "supabase" : INTERNSHIPS_DATA_URL],
    queryFn: async (): Promise<Internship[]> => {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from("internships")
          .select("*")
          .eq("is_published", true)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data as DbInternshipRow[] | null)?.map(mapDbRow) ?? [];
      }
      const res = await fetch(INTERNSHIPS_DATA_URL, { credentials: "omit" });
      if (!res.ok) {
        throw new Error(`Could not load internships (${res.status})`);
      }
      const raw: unknown = await res.json();
      return listSchema.parse(raw);
    },
    staleTime: 60_000,
  });
}
