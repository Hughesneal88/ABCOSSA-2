import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export type AwardCategory = {
  id: string;
  title: string;
  description: string | null;
  vote_price_ghs: number;
  is_active: boolean;
  display_order: number;
  created_at: string;
};

export type NomineeRow = {
  id: string;
  category_id: string | null;
  name: string;
  department: string | null;
  level: string | null;
  bio: string;
  image_url: string | null;
  votes_count: number;
  source_pdf_url: string | null;
  is_published: boolean;
  created_at: string;
};

export type NomineePdfUpload = {
  id: string;
  filename: string;
  file_url: string;
  title: string;
  parsed_count: number;
  created_at: string;
};

export function useAwardCategories() {
  return useQuery({
    queryKey: ["award-categories"],
    queryFn: async (): Promise<AwardCategory[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("award_categories")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data as AwardCategory[]) ?? [];
    },
    enabled: isSupabaseConfigured,
  });
}

export function useNominees(categoryId?: string) {
  return useQuery({
    queryKey: ["nominees", categoryId],
    queryFn: async (): Promise<NomineeRow[]> => {
      if (!supabase) return [];
      let query = supabase
        .from("nominees")
        .select("*")
        .eq("is_published", true);

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      const { data, error } = await query.order("votes_count", { ascending: false });
      if (error) throw error;
      return (data as NomineeRow[]) ?? [];
    },
    enabled: isSupabaseConfigured,
  });
}

export function useNomineePdfs() {
  return useQuery({
    queryKey: ["nominee-pdfs"],
    queryFn: async (): Promise<NomineePdfUpload[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("nominee_pdf_uploads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as NomineePdfUpload[]) ?? [];
    },
    enabled: isSupabaseConfigured,
  });
}

export function useVotePrice() {
  return useQuery({
    queryKey: ["vote-price-ghs"],
    queryFn: async (): Promise<number> => {
      if (!supabase) return 1.00;
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "vote_price_ghs")
        .maybeSingle();

      if (error) throw error;
      return data?.value ? parseFloat(data.value) : 1.00;
    },
    enabled: isSupabaseConfigured,
  });
}

export function useUpdateVotePrice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (price: number) => {
      if (!supabase) throw new Error("Supabase client is not available");

      const { error } = await supabase
        .from("site_settings")
        .upsert({ key: "vote_price_ghs", value: price.toFixed(2) }, { onConflict: "key" });

      if (error) throw error;
      return price;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vote-price-ghs"] });
    },
  });
}

export function useVoteNominee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ nomineeId, currentVotes, voteIncrement = 1 }: { nomineeId: string; currentVotes: number; voteIncrement?: number }) => {
      if (!supabase) throw new Error("Supabase client is not available");

      const { data, error } = await supabase
        .from("nominees")
        .update({ votes_count: currentVotes + voteIncrement })
        .eq("id", nomineeId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nominees"] });
      queryClient.invalidateQueries({ queryKey: ["admin-nominees"] });
    },
  });
}
