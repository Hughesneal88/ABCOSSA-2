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
  nominee_code: string | null;
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

export interface UssdSettings {
  provider: string;
  shortcode: string;
  eventCode: string;
  enabled: boolean;
  instructions: string;
}

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

export function useUssdSettings() {
  return useQuery({
    queryKey: ["ussd-settings"],
    queryFn: async (): Promise<UssdSettings> => {
      if (!supabase) {
        return {
          provider: "arkesel",
          shortcode: "*920*667#",
          eventCode: "667",
          enabled: false,
          instructions:
            "1. Dial the USSD code on any network (MTN, Telecel, AT)\n2. Enter Candidate Code\n3. Enter Number of Votes\n4. Authorize Mobile Money PIN prompt",
        };
      }

      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", [
          "ussd_provider",
          "ussd_shortcode",
          "ussd_event_code",
          "ussd_enabled",
          "ussd_instructions",
        ]);

      if (error) throw error;

      const map = Object.fromEntries(
        (data as { key: string; value: string }[]).map((r) => [r.key, r.value])
      );

      return {
        provider: map["ussd_provider"] || "arkesel",
        shortcode: map["ussd_shortcode"] || "*920*667#",
        eventCode: map["ussd_event_code"] || "667",
        enabled: map["ussd_enabled"] === "true",
        instructions:
          map["ussd_instructions"] ||
          "1. Dial the USSD code on any network (MTN, Telecel, AT)\n2. Enter Candidate Code\n3. Enter Number of Votes\n4. Authorize Mobile Money PIN prompt",
      };
    },
    enabled: isSupabaseConfigured,
  });
}

export function useUpdateUssdSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: UssdSettings) => {
      if (!supabase) throw new Error("Supabase client is not available");

      const updates = [
        { key: "ussd_provider", value: settings.provider.trim() },
        { key: "ussd_shortcode", value: settings.shortcode.trim() },
        { key: "ussd_event_code", value: settings.eventCode.trim() },
        { key: "ussd_enabled", value: settings.enabled ? "true" : "false" },
        { key: "ussd_instructions", value: settings.instructions.trim() },
      ];

      for (const item of updates) {
        const { error } = await supabase
          .from("site_settings")
          .upsert(item, { onConflict: "key" });
        if (error) throw error;
      }

      return settings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ussd-settings"] });
    },
  });
}

export function useAutoGenerateNomineeCodes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error("Supabase client is not available");

      // Fetch all nominees ordered by creation date
      const { data: allNominees, error: fetchErr } = await supabase
        .from("nominees")
        .select("id, nominee_code, created_at")
        .order("created_at", { ascending: true });

      if (fetchErr) throw fetchErr;
      if (!allNominees || allNominees.length === 0) return 0;

      // Find highest existing numerical code
      let currentMax = 100;
      allNominees.forEach((n) => {
        const num = parseInt(n.nominee_code || "", 10);
        if (!isNaN(num) && num > currentMax) {
          currentMax = num;
        }
      });

      let updatedCount = 0;
      for (const nominee of allNominees) {
        if (!nominee.nominee_code || nominee.nominee_code.trim() === "") {
          currentMax += 1;
          const { error: updErr } = await supabase
            .from("nominees")
            .update({ nominee_code: currentMax.toString() })
            .eq("id", nominee.id);

          if (!updErr) updatedCount += 1;
        }
      }

      return updatedCount;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nominees"] });
      queryClient.invalidateQueries({ queryKey: ["admin-nominees"] });
    },
  });
}

const DINNER_AWARDS_SEED_KEY = "dinner_awards_2026_seed";

function normalizeNomineeName(name: string) {
  return name
    .toLowerCase()
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** One-time Dinner Awards category and nominee corrections. Safe to call repeatedly. */
export async function ensureDinnerAwardsData() {
  if (!supabase) return false;

  const { data: seedRow } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", DINNER_AWARDS_SEED_KEY)
    .maybeSingle();

  const { data: categories, error: catErr } = await supabase
    .from("award_categories")
    .select("id, title, display_order, vote_price_ghs");
  if (catErr || !categories) return false;

  const ninepence = categories.find((c) => /nine\s*pence/i.test(c.title));
  const pals = categories.find((c) => /best\s*pals?/i.test(c.title));
  let blogger = categories.find((c) => /^blogger of the year$/i.test(c.title));
  const bloggerNames = ["AGABUS Blogs", "GEN Z Blogs"];

  const { data: existing = [] } = await supabase
    .from("nominees")
    .select("id, name, nominee_code, category_id");

  const hasAllBloggers = blogger
    ? bloggerNames.every((name) =>
        (existing ?? []).some((n) => normalizeNomineeName(n.name) === normalizeNomineeName(name))
      )
    : false;

  const aegonNominees = (existing ?? []).filter((n) => /aegon\s*iii/i.test(n.name));

  if (seedRow?.value === "applied" && !ninepence && blogger && hasAllBloggers && aegonNominees.length === 0) {
    return false;
  }

  let changed = false;

  for (const n of aegonNominees) {
    const { error } = await supabase.from("nominees").delete().eq("id", n.id);
    if (!error) changed = true;
  }

  if (ninepence && pals && ninepence.id !== pals.id) {
    const { error } = await supabase
      .from("nominees")
      .update({ category_id: pals.id })
      .eq("category_id", ninepence.id);
    if (!error) {
      await supabase.from("award_categories").delete().eq("id", ninepence.id);
      changed = true;
    }
  } else if (ninepence && !pals) {
    const { error } = await supabase
      .from("award_categories")
      .update({ title: "Best Pals" })
      .eq("id", ninepence.id);
    if (!error) changed = true;
  }

  if (!blogger) {
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.display_order || 0), 0);
    const { data: created, error } = await supabase
      .from("award_categories")
      .insert({
        title: "Blogger of the Year",
        description: "Celebrating student blogs and digital storytellers in the ABCOSSA community.",
        vote_price_ghs: categories[0]?.vote_price_ghs ?? 1,
        display_order: maxOrder + 1,
        is_active: true,
      })
      .select("id, title, display_order, vote_price_ghs")
      .maybeSingle();
    if (!error && created) {
      blogger = created;
      changed = true;
    }
  }

  if (blogger) {
    let maxCode = 100;
    (existing ?? []).forEach((n) => {
      const num = parseInt(n.nominee_code || "", 10);
      if (!isNaN(num) && num > maxCode) maxCode = num;
    });

    for (const name of bloggerNames) {
      const match = (existing ?? []).find((n) => normalizeNomineeName(n.name) === normalizeNomineeName(name));
      if (match) {
        if (match.category_id !== blogger.id) {
          const { error } = await supabase
            .from("nominees")
            .update({ category_id: blogger.id, name })
            .eq("id", match.id);
          if (!error) changed = true;
        }
      } else {
        maxCode += 1;
        const { error } = await supabase.from("nominees").insert({
          name,
          category_id: blogger.id,
          bio: "",
          is_published: true,
          nominee_code: String(maxCode),
        });
        if (!error) changed = true;
      }
    }
  }

  if (seedRow?.value !== "applied") {
    await supabase
      .from("site_settings")
      .upsert({ key: DINNER_AWARDS_SEED_KEY, value: "applied" }, { onConflict: "key" });
  }

  return changed;
}

export function useVoteNominee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      nomineeId,
      currentVotes,
      voteIncrement = 1,
    }: {
      nomineeId: string;
      currentVotes: number;
      voteIncrement?: number;
    }) => {
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
