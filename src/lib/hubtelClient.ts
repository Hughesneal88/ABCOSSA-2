import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export type PaymentChannel = "mtn-gh" | "telecel-gh" | "at-gh" | "card";

export interface InitiatePaymentParams {
  amount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paymentType: "dues" | "event" | "donation" | "voting";
  paymentChannel: PaymentChannel;
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

export function generatePaymentReference(typePrefix = "ABC"): string {
  const time = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${typePrefix}-${time}-${rand}`;
}

export function formatGHS(amount: number): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Initiates payment with Hubtel backend and saves record to Supabase
 */
export async function createPaymentTransaction(params: InitiatePaymentParams): Promise<{
  payment: PaymentRecord;
  checkoutUrl?: string;
}> {
  const clientReference = generatePaymentReference(params.paymentType.substring(0, 3).toUpperCase());

  if (!isSupabaseConfigured || !supabase) {
    // Demo fallback record if Supabase is not yet configured
    const demoRecord: PaymentRecord = {
      id: crypto.randomUUID(),
      client_reference: clientReference,
      checkout_id: `demo_${Date.now()}`,
      transaction_id: `tx_${Date.now()}`,
      amount: params.amount,
      currency: "GHS",
      customer_name: params.customerName,
      customer_email: params.customerEmail,
      customer_phone: params.customerPhone,
      payment_type: params.paymentType,
      status: "paid",
      payment_channel: params.paymentChannel,
      description: params.description || "Demo payment",
      metadata: params.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return { payment: demoRecord };
  }

  // 1. Insert payment record into Supabase
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
      payment_channel: params.paymentChannel,
      description: params.description || `${params.paymentType.toUpperCase()} payment for ${params.customerName}`,
      status: "pending",
      metadata: params.metadata || {},
    })
    .select()
    .single();

  if (dbErr) throw dbErr;

  // 2. Try invoking edge function for real Hubtel API checkout if deployed
  try {
    const { data: edgeData, error: edgeErr } = await supabase.functions.invoke("hubtel-checkout", {
      body: {
        paymentId: dbPayment.id,
        clientReference,
        amount: params.amount,
        customerName: params.customerName,
        customerEmail: params.customerEmail,
        customerPhone: params.customerPhone,
        paymentChannel: params.paymentChannel,
        description: params.description,
      },
    });

    if (!edgeErr && edgeData?.checkoutUrl) {
      return { payment: dbPayment as PaymentRecord, checkoutUrl: edgeData.checkoutUrl };
    }
  } catch {
    // Edge function not deployed yet — transaction created in pending state
  }

  return { payment: dbPayment as PaymentRecord };
}
