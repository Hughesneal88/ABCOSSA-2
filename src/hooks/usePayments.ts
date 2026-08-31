import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import {
  createPaymentTransaction,
  updatePaymentSuccess,
  updatePaymentStatus,
  type InitiatePaymentParams,
  type PaymentRecord,
} from "@/lib/paystackClient";

export interface PaystackSettings {
  publicKey: string;
  secretKey: string;
  merchantEmail: string;
  currency: string;
}

// Backward compatibility alias
export type HubtelSettings = PaystackSettings;

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

export function usePaystackSettings() {
  return useQuery({
    queryKey: ["paystack-settings"],
    queryFn: async (): Promise<PaystackSettings> => {
      const defaultPublicKey = (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string) || "";

      if (!supabase) {
        return {
          publicKey: defaultPublicKey,
          secretKey: "",
          merchantEmail: "",
          currency: "GHS",
        };
      }

      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", [
          "paystack_public_key",
          "paystack_secret_key",
          "paystack_merchant_email",
          "paystack_currency",
        ]);

      if (error) throw error;

      const map = Object.fromEntries(
        (data as { key: string; value: string }[]).map((r) => [r.key, r.value])
      );

      return {
        publicKey: map["paystack_public_key"] || defaultPublicKey,
        secretKey: map["paystack_secret_key"] || "",
        merchantEmail: map["paystack_merchant_email"] || "",
        currency: map["paystack_currency"] || "GHS",
      };
    },
    enabled: isSupabaseConfigured,
  });
}

export function useUpdatePaystackSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: PaystackSettings) => {
      if (!supabase) throw new Error("Supabase client is not available");

      const updates = [
        { key: "paystack_public_key", value: settings.publicKey.trim() },
        { key: "paystack_secret_key", value: settings.secretKey.trim() },
        { key: "paystack_merchant_email", value: settings.merchantEmail.trim() },
        { key: "paystack_currency", value: (settings.currency || "GHS").trim() },
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
      queryClient.invalidateQueries({ queryKey: ["paystack-settings"] });
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

export function useCompletePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      paymentId,
      transactionId,
      reference,
      channel,
    }: {
      paymentId: string;
      transactionId?: string;
      reference?: string;
      channel?: string;
    }) => {
      await updatePaymentSuccess(paymentId, transactionId, reference, channel);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
    },
  });
}

export function useCancelPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      paymentId,
      status,
    }: {
      paymentId: string;
      status: "failed" | "cancelled";
    }) => {
      await updatePaymentStatus(paymentId, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
    },
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ paymentId, deductVotes = false }: { paymentId: string; deductVotes?: boolean }) => {
      if (!supabase) throw new Error("Supabase client is not available");

      if (deductVotes) {
        const { data: payment } = await supabase
          .from("payments")
          .select("*")
          .eq("id", paymentId)
          .maybeSingle();

        const nomineeId = payment?.metadata?.nominee_id;
        const votesCount = Number(payment?.metadata?.votes_count || 0);

        if (payment?.status === "paid" && nomineeId && votesCount > 0) {
          const { data: nominee } = await supabase
            .from("nominees")
            .select("id, votes_count")
            .eq("id", nomineeId)
            .maybeSingle();

          if (nominee) {
            const newVotes = Math.max(0, (nominee.votes_count || 0) - votesCount);
            await supabase.from("nominees").update({ votes_count: newVotes }).eq("id", nominee.id);
          }
        }
      }

      const { error } = await supabase.from("payments").delete().eq("id", paymentId);
      if (error) throw error;
      return paymentId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
      queryClient.invalidateQueries({ queryKey: ["nominees"] });
      queryClient.invalidateQueries({ queryKey: ["admin-nominees"] });
    },
  });
}

export function useDeleteMultiplePayments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (paymentIds: string[]) => {
      if (!supabase) throw new Error("Supabase client is not available");
      if (paymentIds.length === 0) return [];

      const { error } = await supabase.from("payments").delete().in("id", paymentIds);
      if (error) throw error;
      return paymentIds;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
      queryClient.invalidateQueries({ queryKey: ["nominees"] });
      queryClient.invalidateQueries({ queryKey: ["admin-nominees"] });
    },
  });
}

export function useClearPendingPayments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error("Supabase client is not available");

      const { data, error } = await supabase
        .from("payments")
        .delete()
        .in("status", ["pending", "failed", "cancelled"])
        .select("id");

      if (error) throw error;
      return data?.length || 0;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
    },
  });
}

// Backward compatibility wrappers
export const useHubtelSettings = usePaystackSettings;
export const useUpdateHubtelSettings = useUpdatePaystackSettings;

