import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export interface BulkVotingPackage {
  amount_ghs: number;
  votes: number;
  label?: string; // e.g. "10 Cedis = 12 Votes"
}

export interface BulkVotingConfig {
  enabled: boolean;
  packages: BulkVotingPackage[];
  start_time: string | null; // ISO timestamp
  end_time: string | null; // ISO timestamp
}

const BULK_PACKAGES_KEY = "bulk_voting_packages";
const BULK_ENABLED_KEY = "bulk_voting_enabled";
const BULK_START_KEY = "bulk_voting_start";
const BULK_END_KEY = "bulk_voting_end";

/** Returns the active bulk voting config (packages + schedule + whether currently active) */
export function useBulkVoting() {
  return useQuery({
    queryKey: ["bulk-voting"],
    queryFn: async (): Promise<
      BulkVotingConfig & { isCurrentlyActive: boolean }
    > => {
      if (!supabase) {
        return {
          enabled: false,
          packages: [],
          start_time: null,
          end_time: null,
          isCurrentlyActive: false,
        };
      }

      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", [
          BULK_PACKAGES_KEY,
          BULK_ENABLED_KEY,
          BULK_START_KEY,
          BULK_END_KEY,
        ]);

      if (error) throw error;

      const map = Object.fromEntries(
        (data as { key: string; value: string }[]).map((r) => [r.key, r.value])
      );

      const enabled = map[BULK_ENABLED_KEY] === "true";
      let packages: BulkVotingPackage[] = [];
      try {
        packages = map[BULK_PACKAGES_KEY] ? JSON.parse(map[BULK_PACKAGES_KEY]) : [];
      } catch {
        packages = [];
      }

      const start_time = map[BULK_START_KEY] || null;
      const end_time = map[BULK_END_KEY] || null;

      const now = new Date();
      const isCurrentlyActive =
        enabled &&
        packages.length > 0 &&
        (!start_time || now >= new Date(start_time)) &&
        (!end_time || now <= new Date(end_time));

      return {
        enabled,
        packages,
        start_time,
        end_time,
        isCurrentlyActive,
      };
    },
    enabled: isSupabaseConfigured,
  });
}

/** Admin mutation to save bulk voting config */
export function useUpdateBulkVoting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: BulkVotingConfig) => {
      if (!supabase) throw new Error("Supabase client is not available");

      const updates = [
        { key: BULK_ENABLED_KEY, value: config.enabled ? "true" : "false" },
        { key: BULK_PACKAGES_KEY, value: JSON.stringify(config.packages) },
        { key: BULK_START_KEY, value: config.start_time || "" },
        { key: BULK_END_KEY, value: config.end_time || "" },
      ];

      for (const item of updates) {
        const { error } = await supabase
          .from("site_settings")
          .upsert(item, { onConflict: "key" });
        if (error) throw error;
      }

      return config;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bulk-voting"] });
    },
  });
}

/** Get the best bulk package for a given amount (the one with most votes, or closest match) */
export function getBestBulkPackage(
  packages: BulkVotingPackage[],
  amount: number
): BulkVotingPackage | null {
  if (!packages.length) return null;

  // Find packages the user can afford
  const affordable = packages
    .filter((p) => p.amount_ghs <= amount)
    .sort((a, b) => b.votes - a.votes || b.amount_ghs - a.amount_ghs);

  return affordable[0] || null;
}

/** Get all bulk packages sorted by amount (ascending) */
export function getSortedBulkPackages(
  packages: BulkVotingPackage[]
): BulkVotingPackage[] {
  return [...packages].sort((a, b) => a.amount_ghs - b.amount_ghs);
}
