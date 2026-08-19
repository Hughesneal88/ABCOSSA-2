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

export interface OpenPaystackOptions {
  key: string;
  email: string;
  amount: number; // in pesewas (amount * 100)
  currency?: string;
  ref: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  channels?: string[];
  metadata?: Record<string, unknown>;
  onSuccess: (response: { reference: string; transaction?: string; trxref?: string; [key: string]: unknown }) => void;
  onCancel: () => void;
}

declare global {
  interface Window {
    PaystackPop?: any;
  }
}

/**
 * Dynamically loads the Paystack Inline JS script (v2 with fallback)
 */
export function loadPaystackScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.PaystackPop) {
      resolve(true);
      return;
    }

    const existingScript = document.getElementById("paystack-inline-js") as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(true));
      existingScript.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.id = "paystack-inline-js";
    script.src = "https://js.paystack.co/v2/inline.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      // Fallback to v1 if v2 fails to load
      const fallbackScript = document.createElement("script");
      fallbackScript.id = "paystack-inline-js-v1";
      fallbackScript.src = "https://js.paystack.co/v1/inline.js";
      fallbackScript.async = true;
      fallbackScript.onload = () => resolve(true);
      fallbackScript.onerror = () => resolve(false);
      document.body.appendChild(fallbackScript);
    };
    document.body.appendChild(script);
  });
}

/**
 * Open Paystack popup supporting both V2 class and V1 setup patterns
 */
export async function openPaystackPopup(options: OpenPaystackOptions): Promise<void> {
  const loaded = await loadPaystackScript();
  if (!loaded || !window.PaystackPop) {
    throw new Error("Unable to load Paystack payment module. Please check your internet connection.");
  }

  // Ensure callback functions are standard non-async functions
  const handleSuccess = function (response: any) {
    const result = {
      reference: response?.reference || response?.trxref || options.ref,
      transaction: response?.transaction || response?.reference || response?.trans,
      trxref: response?.trxref || response?.reference,
      status: response?.status || "success",
    };
    options.onSuccess(result);
  };

  const handleCancel = function () {
    options.onCancel();
  };

  // 1. Try Paystack V2 class pattern: new PaystackPop().newTransaction(...)
  try {
    if (typeof window.PaystackPop === "function") {
      const paystackInstance = new window.PaystackPop();
      if (paystackInstance && typeof paystackInstance.newTransaction === "function") {
        paystackInstance.newTransaction({
          key: options.key,
          email: options.email,
          amount: options.amount,
          currency: options.currency || "GHS",
          ref: options.ref,
          reference: options.ref,
          firstname: options.firstname,
          lastname: options.lastname,
          phone: options.phone,
          channels: options.channels || ["mobile_money", "card"],
          metadata: options.metadata,
          onSuccess: handleSuccess,
          onCancel: handleCancel,
        });
        return;
      }
    }
  } catch (err) {
    console.warn("Paystack V2 newTransaction attempt failed, falling back to setup():", err);
  }

  // 2. Try Paystack V1 setup pattern: PaystackPop.setup({...}).openIframe()
  if (window.PaystackPop && typeof window.PaystackPop.setup === "function") {
    const handler = window.PaystackPop.setup({
      key: options.key,
      email: options.email,
      amount: options.amount,
      currency: options.currency || "GHS",
      ref: options.ref,
      firstname: options.firstname,
      lastname: options.lastname,
      phone: options.phone,
      channels: options.channels || ["mobile_money", "card"],
      metadata: options.metadata,
      callback: handleSuccess,
      onClose: handleCancel,
      onSuccess: handleSuccess,
      onCancel: handleCancel,
    });

    if (handler && typeof handler.openIframe === "function") {
      handler.openIframe();
      return;
    }
  }

  // 3. Try direct instance setup
  if (typeof window.PaystackPop === "function") {
    const instance = new window.PaystackPop();
    if (instance && typeof instance.setup === "function") {
      const handler = instance.setup({
        key: options.key,
        email: options.email,
        amount: options.amount,
        currency: options.currency || "GHS",
        ref: options.ref,
        firstname: options.firstname,
        lastname: options.lastname,
        phone: options.phone,
        channels: options.channels || ["mobile_money", "card"],
        metadata: options.metadata,
        callback: handleSuccess,
        onClose: handleCancel,
      });
      if (handler && typeof handler.openIframe === "function") {
        handler.openIframe();
        return;
      }
    }
  }

  throw new Error("Could not initialize Paystack popup. Please reload the page and try again.");
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
