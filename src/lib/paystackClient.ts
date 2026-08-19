import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export type PaymentChannel = "mobile_money" | "card" | "mtn-gh" | "telecel-gh" | "at-gh";

export interface InitiatePaymentParams {
  amount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paymentType: "dues" | "event" | "donation" | "voting";
  paymentChannel?: PaymentChannel;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentRecord {
  id: string;
  client_reference: string;
  checkout_id: string | null;
  transaction_id: string | null;
  amount: number;
  currency: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  payment_type: string;
  status: "pending" | "paid" | "failed" | "cancelled";
  payment_channel: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PaystackPopOptions {
  key: string;
  email: string;
  amount: number; // in pesewas (amount * 100)
  currency?: string;
  ref: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  channels?: string[];
  metadata?: {
    custom_fields?: Array<{
      display_name: string;
      variable_name: string;
      value: string;
    }>;
    [key: string]: unknown;
  };
  callback: (response: {
    reference: string;
    trans?: string;
    status?: string;
    message?: string;
    transaction?: string;
    trxref?: string;
  }) => void;
  onClose: () => void;
}

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: PaystackPopOptions) => {
        openIframe: () => void;
      };
    };
  }
}

/**
 * Dynamically loads the Paystack Inline JS script
 */
export function loadPaystackScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.PaystackPop) {
      resolve(true);
      return;
    }

    const existingScript = document.getElementById("paystack-inline-js");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(true));
      existingScript.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.id = "paystack-inline-js";
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Generates a unique transaction reference for Paystack
 */
export function generatePaymentReference(typePrefix = "ABC"): string {
  const time = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${typePrefix}-${time}-${rand}`;
}

/**
 * Format GHS currency
 */
export function formatGHS(amount: number): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Initiates payment with Paystack and creates record in Supabase
 */
export async function createPaymentTransaction(params: InitiatePaymentParams): Promise<{
  payment: PaymentRecord;
  reference: string;
}> {
  const clientReference = generatePaymentReference(params.paymentType.substring(0, 3).toUpperCase());

  if (!isSupabaseConfigured || !supabase) {
    // Demo fallback record if Supabase is not configured
    const demoRecord: PaymentRecord = {
      id: crypto.randomUUID(),
      client_reference: clientReference,
      checkout_id: `paystack_${Date.now()}`,
      transaction_id: `tx_${Date.now()}`,
      amount: params.amount,
      currency: "GHS",
      customer_name: params.customerName,
      customer_email: params.customerEmail,
      customer_phone: params.customerPhone,
      payment_type: params.paymentType,
      status: "pending",
      payment_channel: params.paymentChannel || "mobile_money",
      description: params.description || `${params.paymentType.toUpperCase()} payment for ${params.customerName}`,
      metadata: params.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return { payment: demoRecord, reference: clientReference };
  }

  // Insert payment record into Supabase with 'pending' status
  const { data: dbPayment, error: dbErr } = await supabase
    .from("payments")
    .insert({
      client_reference: clientReference,
      amount: params.amount,
      currency: "GHS",
      customer_name: params.customerName,
      customer_email: params.customerEmail,
      customer_phone: params.customerPhone,
      payment_type: params.paymentType,
      payment_channel: params.paymentChannel || "mobile_money",
      description: params.description || `${params.paymentType.toUpperCase()} payment for ${params.customerName}`,
      status: "pending",
      metadata: params.metadata || {},
    })
    .select()
    .single();

  if (dbErr) throw dbErr;

  return { payment: dbPayment as PaymentRecord, reference: clientReference };
}

/**
 * Updates a payment record as paid after successful Paystack callback
 */
export async function updatePaymentSuccess(
  paymentId: string,
  transactionId?: string,
  reference?: string,
  channel?: string
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  const updates: Record<string, unknown> = {
    status: "paid",
    updated_at: new Date().toISOString(),
  };

  if (transactionId) updates.transaction_id = transactionId;
  if (reference) updates.checkout_id = reference;
  if (channel) updates.payment_channel = channel;

  const { error } = await supabase
    .from("payments")
    .update(updates)
    .eq("id", paymentId);

  if (error) {
    console.error("Failed to update payment status in Supabase:", error);
  }
}

/**
 * Updates a payment record as failed/cancelled
 */
export async function updatePaymentStatus(
  paymentId: string,
  status: "failed" | "cancelled"
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  await supabase
    .from("payments")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId);
}
