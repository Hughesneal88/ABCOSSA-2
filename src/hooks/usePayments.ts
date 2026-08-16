import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { createPaymentTransaction, type InitiatePaymentParams, type PaymentRecord } from "@/lib/hubtelClient";

export interface HubtelSettings {
  merchantAccountNumber: string;
  clientId: string;
  clientSecret: string;
}

export function usePayments() {
  return useQuery({
    queryKey: ["admin-payments"],
    queryFn: async (): Promise<PaymentRecord[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as PaymentRecord[]) ?? [];
    },
    enabled: isSupabaseConfigured,
  });
}

export function useHubtelSettings() {
  return useQuery({
    queryKey: ["hubtel-settings"],
    queryFn: async (): Promise<HubtelSettings> => {
      if (!supabase) {
        return {
          merchantAccountNumber: "2019842",
          clientId: "",
          clientSecret: "",
        };
      }
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", ["hubtel_merchant_account_number", "hubtel_client_id", "hubtel_client_secret"]);

      if (error) throw error;

      const map = Object.fromEntries((data as { key: string; value: string }[]).map((r) => [r.key, r.value]));

      return {
        merchantAccountNumber: map["hubtel_merchant_account_number"] || "2019842",
        clientId: map["hubtel_client_id"] || "",
        clientSecret: map["hubtel_client_secret"] || "",
      };
    },
    enabled: isSupabaseConfigured,
  });
}

export function useUpdateHubtelSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: HubtelSettings) => {
      if (!supabase) throw new Error("Supabase client is not available");

      const updates = [
        { key: "hubtel_merchant_account_number", value: settings.merchantAccountNumber.trim() },
        { key: "hubtel_client_id", value: settings.clientId.trim() },
        { key: "hubtel_client_secret", value: settings.clientSecret.trim() },
      ];

      for (const item of updates) {
        const { error } = await supabase.from("site_settings").upsert(item, { onConflict: "key" });
        if (error) throw error;
      }

      return settings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hubtel-settings"] });
    },
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: InitiatePaymentParams) => {
      return await createPaymentTransaction(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
    },
  });
}
