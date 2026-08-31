import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import {
  createPaymentTransaction,
  updatePaymentSuccess,
  updatePaymentStatus,
  syncPaystackTransactionsDirectly,
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

export function useUpdatePaymentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      paymentId,
      newStatus,
      syncVotes = true,
    }: {
      paymentId: string;
      newStatus: "paid" | "pending" | "failed" | "cancelled";
      syncVotes?: boolean;
    }) => {
      if (!supabase) throw new Error("Supabase client is not available");

      // 1. Fetch current payment details
      const { data: currentPayment, error: fetchErr } = await supabase
        .from("payments")
        .select("*")
        .eq("id", paymentId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!currentPayment) throw new Error("Payment record not found");

      const oldStatus = currentPayment.status;
      const nomineeId = currentPayment.metadata?.nominee_id;
      const votesCount = Number(currentPayment.metadata?.votes_count || 0);

      // 2. If status is changing and voting metadata exists:
      if (syncVotes && nomineeId && votesCount > 0 && oldStatus !== newStatus) {
        // Case A: Changing TO "paid" from non-paid -> Credit votes
        if (newStatus === "paid" && oldStatus !== "paid") {
          const { data: nominee } = await supabase
            .from("nominees")
            .select("id, votes_count")
            .eq("id", nomineeId)
            .maybeSingle();

          if (nominee) {
            const newVotes = (nominee.votes_count || 0) + votesCount;
            await supabase.from("nominees").update({ votes_count: newVotes }).eq("id", nomineeId);
          }
        }
        // Case B: Changing FROM "paid" to non-paid -> Deduct votes
        else if (oldStatus === "paid" && newStatus !== "paid") {
          const { data: nominee } = await supabase
            .from("nominees")
            .select("id, votes_count")
            .eq("id", nomineeId)
            .maybeSingle();

          if (nominee) {
            const newVotes = Math.max(0, (nominee.votes_count || 0) - votesCount);
            await supabase.from("nominees").update({ votes_count: newVotes }).eq("id", nomineeId);
          }
        }
      }

      // 3. Update payment record in Supabase
      const { error: updateErr } = await supabase
        .from("payments")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentId);

      if (updateErr) throw updateErr;

      return { paymentId, oldStatus, newStatus, nomineeId, votesCount };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
      queryClient.invalidateQueries({ queryKey: ["nominees"] });
      queryClient.invalidateQueries({ queryKey: ["admin-nominees"] });
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

export interface VerificationResult {
  reference: string;
  success: boolean;
  status: string;
  message: string;
  votesCredited?: boolean;
  votesCount?: number;
}

export function useVerifyPaystackPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reference: string): Promise<VerificationResult> => {
      if (!supabase) throw new Error("Supabase client is not available");

      const { data, error } = await supabase.functions.invoke("paystack-verify", {
        body: { reference: reference.trim() },
      });

      if (error) throw error;
      return {
        reference,
        success: Boolean(data?.success),
        status: data?.status || "unknown",
        message: data?.message || "Verification finished",
        votesCredited: data?.votesCredited,
        votesCount: data?.votesCount,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
      queryClient.invalidateQueries({ queryKey: ["nominees"] });
      queryClient.invalidateQueries({ queryKey: ["admin-nominees"] });
    },
  });
}

export function useReconcilePendingPayments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (paymentsToVerify: PaymentRecord[]): Promise<{
      total: number;
      paidCount: number;
      failedCount: number;
      unverifiedCount: number;
      votesCreditedTotal: number;
    }> => {
      if (!supabase) throw new Error("Supabase client is not available");

      let paidCount = 0;
      let failedCount = 0;
      let unverifiedCount = 0;
      let votesCreditedTotal = 0;

      for (const p of paymentsToVerify) {
        try {
          const { data, error } = await supabase.functions.invoke("paystack-verify", {
            body: { reference: p.client_reference.trim() },
          });

          if (!error && data?.success) {
            if (data.status === "paid") {
              paidCount++;
              if (data.votesCredited && data.votesCount) {
                votesCreditedTotal += Number(data.votesCount);
              }
            } else if (data.status === "failed" || data.status === "cancelled") {
              failedCount++;
            }
          } else {
            unverifiedCount++;
          }
        } catch (_) {
          unverifiedCount++;
        }
      }

      return {
        total: paymentsToVerify.length,
        paidCount,
        failedCount,
        unverifiedCount,
        votesCreditedTotal,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
      queryClient.invalidateQueries({ queryKey: ["nominees"] });
      queryClient.invalidateQueries({ queryKey: ["admin-nominees"] });
    },
  });
}

export function useSyncAllPaystack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (includeTest = false): Promise<{
      success: boolean;
      message: string;
      paystackTotal?: number;
      matchedCount?: number;
      importedCount?: number;
      updatedPaidCount?: number;
      pendingFailedCount?: number;
      votesCreditedTotal?: number;
      testSkippedCount?: number;
    }> => {
      try {
        // 1. Direct browser-level sync with Paystack API & Supabase
        return await syncPaystackTransactionsDirectly(includeTest);
      } catch (clientErr) {
        console.warn("Direct sync error, falling back to edge function:", clientErr);
        if (!supabase) throw clientErr;

        const { data, error } = await supabase.functions.invoke("paystack-sync", {
          body: { includeTest },
        });

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
      queryClient.invalidateQueries({ queryKey: ["nominees"] });
      queryClient.invalidateQueries({ queryKey: ["admin-nominees"] });
    },
  });
}

// Backward compatibility wrappers
export const useHubtelSettings = usePaystackSettings;
export const useUpdateHubtelSettings = useUpdatePaystackSettings;



