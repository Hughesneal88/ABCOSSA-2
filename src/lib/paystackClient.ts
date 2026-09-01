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
 * Dynamically loads the Paystack Inline JS script
 */
export function loadPaystackScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.PaystackPop) {
      resolve(true);
      return;
    }

    const existingScript = document.getElementById("paystack-inline-js") as HTMLScriptElement | null;
    if (existingScript) {
      if (window.PaystackPop) {
        resolve(true);
        return;
      }
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
      // Fallback to v1 if v2 script fails to load
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
    throw new Error("Unable to load Paystack payment module. Please check your internet connection and try again.");
  }

  // Ensure callback functions are standard synchronous functions
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
    console.warn("Paystack V2 newTransaction failed, trying fallback:", err);
  }

  // 2. Try Paystack V1 setup pattern: PaystackPop.setup({...}).openIframe()
  if (window.PaystackPop && typeof window.PaystackPop.setup === "function") {
    try {
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
      });

      if (handler && typeof handler.openIframe === "function") {
        handler.openIframe();
        return;
      }
    } catch (err) {
      console.warn("Paystack V1 setup failed:", err);
    }
  }

  throw new Error("Could not initialize Paystack popup. Please verify your Paystack Public Key in the Admin Portal and reload.");
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

  const fallbackRecord: PaymentRecord = {
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

  if (!isSupabaseConfigured || !supabase) {
    return { payment: fallbackRecord, reference: clientReference };
  }

  try {
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

    if (dbErr) {
      console.warn("Could not insert pending payment in Supabase, continuing with fallback record:", dbErr);
      return { payment: fallbackRecord, reference: clientReference };
    }

    return { payment: dbPayment as PaymentRecord, reference: clientReference };
  } catch (err) {
    console.warn("Exception inserting payment in Supabase:", err);
    return { payment: fallbackRecord, reference: clientReference };
  }
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

  try {
    const { error } = await supabase
      .from("payments")
      .update(updates)
      .eq("id", paymentId);

    if (error) {
      console.warn("Failed to update payment status in Supabase:", error);
    }
  } catch (err) {
    console.warn("Exception updating payment status:", err);
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

  try {
    await supabase
      .from("payments")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId);
  } catch (err) {
    console.warn("Exception updating payment cancellation:", err);
  }
}

/**
 * Directly synchronizes and reconciles all transactions from Paystack account into Supabase
 */
export async function syncPaystackTransactionsDirectly(includeTest = false): Promise<{
  success: boolean;
  message: string;
  paystackTotal: number;
  matchedCount: number;
  importedCount: number;
  updatedPaidCount: number;
  votesCreditedTotal: number;
  testSkippedCount: number;
}> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured.");
  }

  // 1. Fetch Paystack secret key from site_settings
  const { data: settingsData, error: sErr } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", ["paystack_secret_key", "paystack_public_key"]);

  if (sErr) throw sErr;

  const settingsMap = Object.fromEntries(
    (settingsData || []).map((r: { key: string; value: string }) => [r.key, r.value])
  );

  const secretKey = settingsMap["paystack_secret_key"]?.trim() || "";
  const publicKey = settingsMap["paystack_public_key"]?.trim() || "";

  if (!secretKey) {
    throw new Error("Paystack Secret Key is not configured yet. Please enter your secret key in Settings.");
  }

  const isTestKey = secretKey.startsWith("sk_test_") || publicKey.startsWith("pk_test_");

  // 2. Query Paystack Transaction List API
  const res = await fetch("https://api.paystack.co/transaction?perPage=100", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
  });

  const pData = await res.json();
  if (!pData.status || !Array.isArray(pData.data)) {
    throw new Error(pData.message || "Failed to retrieve transactions from Paystack");
  }

  const paystackTransactions = pData.data;

  // 3. Fetch all local payments
  const { data: localPayments = [], error: fetchLocalErr } = await supabase
    .from("payments")
    .select("*");

  if (fetchLocalErr) throw fetchLocalErr;

  const localMap = new Map<string, PaymentRecord>();
  (localPayments || []).forEach((p: PaymentRecord) => {
    if (p.client_reference) localMap.set(p.client_reference, p);
    if (p.transaction_id) localMap.set(p.transaction_id, p);
  });

  let matchedCount = 0;
  let importedCount = 0;
  let updatedPaidCount = 0;
  let votesCreditedTotal = 0;
  let testSkippedCount = 0;

  // 4. Process each transaction from Paystack (STRICTLY EXCLUDING TEST TRANSACTIONS)
  for (const p of paystackTransactions) {
    const domain = String(p.domain || "").toLowerCase();
    const gatewayResponse = String(p.gateway_response || "").toLowerCase();
    const ref = String(p.reference || "").trim();

    // STRICT CHECK: Skip all test domain transactions
    const isTest = domain === "test" || gatewayResponse.includes("test transaction") || ref.toLowerCase().startsWith("test_");
    if (isTest && !includeTest) {
      testSkippedCount++;
      continue;
    }

    const trxId = String(p.id || "");
    const isSuccess = p.status === "success";
    const normalizedStatus = isSuccess ? "paid" : p.status === "abandoned" ? "failed" : p.status;
    const amountGhs = Number(p.amount || 0) / 100;
    const channel = String(p.channel || "mobile_money");
    const customerName =
      `${p.customer?.first_name || ""} ${p.customer?.last_name || ""}`.trim() ||
      p.customer?.email ||
      "Paystack Customer";
    const customerPhone = p.customer?.phone || "";
    const customerEmail = p.customer?.email || "customer@abcossa.org";
    const meta = typeof p.metadata === "object" && p.metadata !== null ? p.metadata : {};
    const nomineeId = meta.nominee_id;
    const votesCount = Number(meta.votes_count || 0);

    const existing = localMap.get(ref) || localMap.get(trxId);

    if (existing) {
      matchedCount++;
      const wasPaid = existing.status === "paid";

      if (existing.status !== normalizedStatus || !existing.transaction_id) {
        await supabase
          .from("payments")
          .update({
            status: normalizedStatus,
            transaction_id: trxId,
            amount: amountGhs,
            payment_channel: channel,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (!wasPaid && isSuccess) {
          updatedPaidCount++;
          if (nomineeId && votesCount > 0) {
            const { data: nominee } = await supabase
              .from("nominees")
              .select("id, votes_count")
              .eq("id", nomineeId)
              .maybeSingle();

            if (nominee) {
              const newVotes = (nominee.votes_count || 0) + votesCount;
              await supabase.from("nominees").update({ votes_count: newVotes }).eq("id", nomineeId);
              votesCreditedTotal += votesCount;
            }
          }
        }
      }
    } else if (isSuccess) {
      // Import new successful transaction from Paystack that was missing locally
      importedCount++;
      const newRecord = {
        client_reference: ref || `PAYSTACK_${trxId}`,
        transaction_id: trxId,
        amount: amountGhs,
        currency: p.currency || "GHS",
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        payment_type: meta.payment_type || "voting",
        status: "paid",
        payment_channel: channel,
        description: meta.description || `Paystack Payment for ${meta.nominee_name || "ABCOSSA"}`,
        metadata: meta,
        created_at: p.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await supabase.from("payments").insert(newRecord);

      if (nomineeId && votesCount > 0) {
        const { data: nominee } = await supabase
          .from("nominees")
          .select("id, votes_count")
          .eq("id", nomineeId)
          .maybeSingle();

        if (nominee) {
          const newVotes = (nominee.votes_count || 0) + votesCount;
          await supabase.from("nominees").update({ votes_count: newVotes }).eq("id", nomineeId);
          votesCreditedTotal += votesCount;
        }
      }
    }
  }

  // 5. Cross-reference remaining local pending records
  let pendingFailedCount = 0;
  for (const localP of localPayments) {
    if (localP.status === "pending" && localP.client_reference) {
      const matchOnPaystack = paystackTransactions.find(
        (t: any) => String(t.reference) === localP.client_reference
      );
      if (matchOnPaystack) {
        const s = matchOnPaystack.status;
        const newStatus = s === "success" ? "paid" : s === "abandoned" ? "failed" : s;
        if (newStatus !== "pending") {
          await supabase.from("payments").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", localP.id);
          if (newStatus === "paid") updatedPaidCount++;
          if (newStatus === "failed") pendingFailedCount++;
        }
      } else {
        // If reference is not found in Paystack live list -> mark as failed
        await supabase.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", localP.id);
        pendingFailedCount++;
      }
    }
  }

  return {
    success: true,
    paystackTotal: paystackTransactions.length,
    matchedCount,
    importedCount,
    updatedPaidCount,
    pendingFailedCount,
    votesCreditedTotal,
    testSkippedCount,
    message: `Synchronized ${paystackTransactions.length} transactions from Paystack. (${updatedPaidCount} marked Paid, ${pendingFailedCount} uninitiated marked Failed, ${importedCount} imported, ${votesCreditedTotal} votes credited).`,
  };
}

/**
 * Simple CSV line parser handling quotes and commas
 */
function parseCsvLine(text: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Imports and updates records from a Paystack CSV export file
 */
export async function importPaystackCsv(
  csvText: string,
  excludeTest = true
): Promise<{
  totalRows: number;
  updatedPaid: number;
  importedCount: number;
  failedCount: number;
  votesCredited: number;
  testSkipped: number;
  message: string;
}> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured.");
  }

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("CSV file is empty or missing headers.");
  }

  const headerLine = parseCsvLine(lines[0]);
  const headers = headerLine.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

  // Find column indices
  const getColIdx = (...candidates: string[]) => {
    for (const c of candidates) {
      const idx = headers.findIndex((h) => h.includes(c));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const refIdx = getColIdx("reference", "ref", "clientref");
  const statusIdx = getColIdx("status", "paymentstatus", "state");
  const amountIdx = getColIdx("amount", "total", "value");
  const emailIdx = getColIdx("customeremail", "email", "customer");
  const phoneIdx = getColIdx("phone", "customermobile", "msisdn", "customerno");
  const nameIdx = getColIdx("customername", "name", "fullname", "payer");
  const channelIdx = getColIdx("channel", "paymentmethod", "gateway");
  const dateIdx = getColIdx("paidat", "transactiondate", "createdat", "date");
  const domainIdx = getColIdx("domain", "mode", "environment");
  const metaIdx = getColIdx("metadata", "customfields", "description", "details");

  if (refIdx === -1) {
    throw new Error("Could not find a 'Reference' column in the uploaded CSV.");
  }

  // Fetch local records
  const { data: localPayments = [], error: fetchErr } = await supabase
    .from("payments")
    .select("*");

  if (fetchErr) throw fetchErr;

  const localMap = new Map<string, PaymentRecord>();
  (localPayments || []).forEach((p: PaymentRecord) => {
    if (p.client_reference) localMap.set(p.client_reference.toLowerCase().trim(), p);
    if (p.transaction_id) localMap.set(p.transaction_id.toLowerCase().trim(), p);
  });

  let updatedPaid = 0;
  let importedCount = 0;
  let failedCount = 0;
  let votesCredited = 0;
  let testSkipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (row.length === 0 || !row[refIdx]) continue;

    const ref = row[refIdx].trim();
    const rawStatus = (statusIdx !== -1 ? row[statusIdx] : "success").toLowerCase().trim();
    const isSuccess = rawStatus === "success" || rawStatus === "paid" || rawStatus === "completed" || rawStatus === "approved";
    const normalizedStatus = isSuccess ? "paid" : rawStatus === "abandoned" ? "failed" : rawStatus;

    // Check domain / test
    const rawDomain = (domainIdx !== -1 ? row[domainIdx] : "").toLowerCase().trim();
    const isTest = rawDomain === "test" || ref.toLowerCase().startsWith("test_");
    if (excludeTest && isTest) {
      testSkipped++;
      continue;
    }

    // Parse amount
    let amount = 0;
    if (amountIdx !== -1 && row[amountIdx]) {
      const cleanAmt = row[amountIdx].replace(/[^0-9.]/g, "");
      amount = parseFloat(cleanAmt) || 0;
      // If amount appears to be in pesewas (e.g. > 100 with no decimal point in standard GHS ranges)
      if (amount >= 100 && !row[amountIdx].includes(".")) {
        // e.g. 500 pesewas = 5 GHS
        amount = amount / 100;
      }
    }

    const email = emailIdx !== -1 && row[emailIdx] ? row[emailIdx] : "customer@abcossa.org";
    const phone = phoneIdx !== -1 && row[phoneIdx] ? row[phoneIdx] : "";
    const name = nameIdx !== -1 && row[nameIdx] ? row[nameIdx] : "Paystack Customer";
    const channel = channelIdx !== -1 && row[channelIdx] ? row[channelIdx] : "mobile_money";
    const paidAt = dateIdx !== -1 && row[dateIdx] ? row[dateIdx] : new Date().toISOString();

    // Parse metadata if available
    let meta: Record<string, any> = {};
    if (metaIdx !== -1 && row[metaIdx]) {
      try {
        meta = JSON.parse(row[metaIdx]);
      } catch (_) {
        meta = { description: row[metaIdx] };
      }
    }

    const nomineeId = meta.nominee_id;
    const votesCount = Number(meta.votes_count || (amount > 0 ? amount : 1));

    const existing = localMap.get(ref.toLowerCase()) || (meta.transaction_id && localMap.get(String(meta.transaction_id).toLowerCase()));

    if (existing) {
      const wasPaid = existing.status === "paid";
      if (existing.status !== normalizedStatus) {
        await supabase
          .from("payments")
          .update({
            status: normalizedStatus,
            amount: amount > 0 ? amount : existing.amount,
            payment_channel: channel || existing.payment_channel,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (!wasPaid && isSuccess) {
          updatedPaid++;
          const targetNomineeId = existing.metadata?.nominee_id || nomineeId;
          const targetVotes = Number(existing.metadata?.votes_count || votesCount);

          if (targetNomineeId && targetVotes > 0) {
            const { data: nominee } = await supabase
              .from("nominees")
              .select("id, votes_count")
              .eq("id", targetNomineeId)
              .maybeSingle();

            if (nominee) {
              await supabase
                .from("nominees")
                .update({ votes_count: (nominee.votes_count || 0) + targetVotes })
                .eq("id", targetNomineeId);
              votesCredited += targetVotes;
            }
          }
        }
      }
    } else if (isSuccess) {
      // Insert new payment from CSV
      importedCount++;
      const newRecord = {
        client_reference: ref,
        amount: amount > 0 ? amount : 1,
        currency: "GHS",
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        payment_type: meta.payment_type || "voting",
        status: "paid",
        payment_channel: channel,
        description: meta.description || `Imported Paystack Payment ${ref}`,
        metadata: meta,
        created_at: paidAt,
        updated_at: new Date().toISOString(),
      };

      await supabase.from("payments").insert(newRecord);

      if (nomineeId && votesCount > 0) {
        const { data: nominee } = await supabase
          .from("nominees")
          .select("id, votes_count")
          .eq("id", nomineeId)
          .maybeSingle();

        if (nominee) {
          await supabase
            .from("nominees")
            .update({ votes_count: (nominee.votes_count || 0) + votesCount })
            .eq("id", nomineeId);
          votesCredited += votesCount;
        }
      }
    } else {
      failedCount++;
    }
  }

  return {
    totalRows: lines.length - 1,
    updatedPaid,
    importedCount,
    failedCount,
    votesCredited,
    testSkipped,
    message: `Processed ${lines.length - 1} records from Paystack CSV (${updatedPaid} updated to Paid, ${importedCount} imported, ${votesCredited} votes credited, ${testSkipped} test records skipped).`,
  };
}
