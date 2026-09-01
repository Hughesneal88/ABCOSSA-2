import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface UssdSessionState {
  session_id: string;
  user_id: string;
  current_step: string;
  candidate_code?: string | null;
  nominee_id?: string | null;
  nominee_name?: string | null;
  category_id?: string | null;
  category_title?: string | null;
  category_page: number;
  nominee_page: number;
  quantity: number;
  network?: string | null;
  wallet_phone?: string | null;
  reference?: string | null;
  metadata?: Record<string, any>;
  updated_at?: string;
}

// In-memory fallback cache across warm isolate requests
const inMemorySessions = new Map<string, UssdSessionState>();

function normalizePhone(rawPhone: string) {
  const cleaned = String(rawPhone || "").trim().replace(/[^\d]/g, "");
  if (cleaned.startsWith("233") && cleaned.length === 12) {
    return {
      international: cleaned,
      local: `0${cleaned.slice(3)}`,
      isValid: true,
    };
  }
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    return {
      international: `233${cleaned.slice(1)}`,
      local: cleaned,
      isValid: true,
    };
  }
  if (cleaned.length >= 9 && cleaned.length <= 13) {
    return {
      international: cleaned.startsWith("233") ? cleaned : `233${cleaned.replace(/^0+/, "")}`,
      local: cleaned.startsWith("0") ? cleaned : `0${cleaned.replace(/^233/, "")}`,
      isValid: true,
    };
  }
  return {
    international: cleaned,
    local: cleaned,
    isValid: false,
  };
}

async function submitPaystackOtp(params: {
  reference: string;
  otp: string;
  secretKey: string;
}) {
  const { reference, otp, secretKey } = params;
  try {
    const res = await fetch("https://api.paystack.co/charge/submit_otp", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reference: reference.trim(),
        otp: otp.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    console.log("Paystack submit OTP response:", JSON.stringify(data));
    const isOk = Boolean(
      data.status &&
      (data.data?.status === "success" ||
       data.data?.status === "pay_offline" ||
       data.data?.status === "pending" ||
       data.data?.status === "processed")
    );
    return {
      success: isOk,
      status: data.data?.status || (data.status ? "success" : "failed"),
      message: data.data?.display_text || data.data?.message || data.message || "OTP response received",
      result: data,
    };
  } catch (err) {
    console.error("Paystack submit OTP error:", err);
    return { success: false, status: "error", message: "Failed to submit OTP", result: null };
  }
}

async function triggerMoMoPayment(params: {
  amount: number;
  phone: string;
  network: string;
  reference: string;
  nomineeName: string;
  votesCount: number;
  supabase: any;
}) {
  const { amount, phone, network, reference, nomineeName, votesCount, supabase } = params;
  const normalized = normalizePhone(phone);

  const { data: settingsRows } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", [
      "paystack_secret_key",
      "arkesel_api_key",
      "hubtel_client_id",
      "hubtel_client_secret",
      "hubtel_merchant_account_number"
    ]);

  const settings: Record<string, string> = Object.fromEntries(
    (settingsRows || []).map((r: { key: string; value: string }) => [r.key, r.value])
  );

  const paystackKey = settings["paystack_secret_key"] || Deno.env.get("PAYSTACK_SECRET_KEY") || "";
  const arkeselKey = settings["arkesel_api_key"] || Deno.env.get("ARKESEL_API_KEY") || "";
  const hubtelClientId = settings["hubtel_client_id"] || Deno.env.get("HUBTEL_CLIENT_ID") || "";
  const hubtelSecret = settings["hubtel_client_secret"] || Deno.env.get("HUBTEL_CLIENT_SECRET") || "";
  const hubtelMerchant = settings["hubtel_merchant_account_number"] || Deno.env.get("HUBTEL_MERCHANT_ACCOUNT_NUMBER") || "2019842";

  console.log("Trigger MoMo Payment started for:", {
    phone: normalized.local,
    amount,
    network,
    hasPaystackKey: Boolean(paystackKey),
    hasArkeselKey: Boolean(arkeselKey),
    hasHubtelKey: Boolean(hubtelClientId && hubtelSecret),
  });

  // 1. Prioritize Paystack MoMo Charge API if Paystack secret key is configured
  if (paystackKey) {
    try {
      // Auto-detect telco provider from 10-digit phone prefix
      const prefix = normalized.local.slice(0, 3);
      let provider = "mtn";
      if (["024", "054", "055", "059", "053"].includes(prefix)) {
        provider = "mtn";
      } else if (["020", "050"].includes(prefix)) {
        provider = "vod";
      } else if (["027", "057", "026"].includes(prefix)) {
        provider = "tgo";
      } else if (network.toLowerCase().includes("telecel") || network.toLowerCase().includes("vod")) {
        provider = "vod";
      } else if (network.toLowerCase().includes("at") || network.toLowerCase().includes("tgo")) {
        provider = "tgo";
      }

      const chargePayload = {
        amount: Math.round(amount * 100), // In Ghana Pesewas (e.g. GHS 5.00 = 500)
        email: `voter_${normalized.local}@abcossa.org`,
        currency: "GHS",
        reference: reference,
        mobile_money: {
          phone: normalized.local,
          provider: provider,
        },
        metadata: {
          nominee_name: nomineeName,
          votes_count: votesCount,
          source: "arkesel_ussd",
        },
      };

      console.log("Calling Paystack Charge API with payload:", JSON.stringify(chargePayload));

      const res = await fetch("https://api.paystack.co/charge", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${paystackKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chargePayload),
        signal: AbortSignal.timeout(2800),
      });

      const data = await res.json().catch(() => ({}));
      console.log("Paystack MoMo charge response:", JSON.stringify(data));
      
      const chargeStatus = data.data?.status || "";
      const requiresOtp = chargeStatus === "send_otp" || chargeStatus === "send_birthday";

      return {
        gateway: "paystack",
        success: Boolean(data.status),
        requiresOtp: requiresOtp,
        message: data.data?.display_text || data.data?.message || data.message || "Payment authorization initiated",
        reference: reference,
        result: data,
      };
    } catch (e: any) {
      console.error("Paystack MoMo charge error / timeout:", e);
      // If it was a network timeout, Paystack may still be processing the charge in background
      if (e?.name === "TimeoutError" || String(e).includes("Timeout")) {
        return {
          gateway: "paystack",
          success: true,
          requiresOtp: false,
          message: "Payment prompt dispatched to your phone.",
          reference: reference,
          result: { status: "pending", timeoutDispatched: true },
        };
      }
    }
  }

  // 2. Fallback to Arkesel MoMo API
  if (arkeselKey) {
    try {
      const res = await fetch("https://api.arkesel.com/api/v2/momo/debit", {
        method: "POST",
        headers: {
          "api-key": arkeselKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amount,
          currency: "GHS",
          phone: normalized.local,
          network: network.toUpperCase(),
          reference: reference,
          callback_url: "https://abcossa.org",
        }),
      });
      const data = await res.json().catch(() => ({}));
      console.log("Arkesel MoMo debit response:", JSON.stringify(data));
      return { gateway: "arkesel", success: true, result: data };
    } catch (e) {
      console.error("Arkesel MoMo debit error:", e);
    }
  }

  // 3. Fallback to Hubtel Receive MoMo API
  if (hubtelClientId && hubtelSecret) {
    try {
      const channel = network.toLowerCase().includes("mtn")
        ? "mtn-gh"
        : network.toLowerCase().includes("telecel") || network.toLowerCase().includes("vod")
        ? "vodafone-gh"
        : "airteltigo-gh";

      const auth = btoa(`${hubtelClientId}:${hubtelSecret}`);
      const res = await fetch(`https://api-merchant.hubtel.com/v1/merchantaccount/merchants/${hubtelMerchant}/receive/mobilemoney`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          CustomerName: "USSD Voter",
          CustomerMsisdn: normalized.local,
          CustomerEmail: "ussd-voting@abcossa.org",
          Channel: channel,
          Amount: amount,
          Description: `ABCOSSA Vote: ${votesCount} for ${nomineeName}`,
          ClientReference: reference,
        }),
      });
      const data = await res.json().catch(() => ({}));
      console.log("Hubtel MoMo receive response:", JSON.stringify(data));
      return { gateway: "hubtel", success: true, result: data };
    } catch (e) {
      console.error("Hubtel MoMo receive error:", e);
    }
  }

  console.warn("No payment gateway API keys configured in site_settings or environment variables!");
  return { gateway: "unconfigured", success: false, result: { message: "No payment gateway key set" } };
}

/**
 * Arkesel USSD Gateway Interactive Engine & Stateful Webhook Handler
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Parse incoming parameters
    let payload: Record<string, any> = {};

    if (req.method === "GET") {
      const url = new URL(req.url);
      payload = Object.fromEntries(url.searchParams.entries());
    } else {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        payload = await req.json().catch(() => ({}));
      } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
        const formData = await req.formData().catch(() => new FormData());
        const entries: Record<string, any> = {};
        formData.forEach((val, key) => {
          entries[key] = val;
        });
        payload = entries;
      } else {
        const text = await req.text().catch(() => "");
        try {
          payload = JSON.parse(text);
        } catch {
          const urlParams = new URLSearchParams(text);
          payload = Object.fromEntries(urlParams.entries());
        }
      }
    }

    console.log("Arkesel USSD received payload:", JSON.stringify(payload));

    const sessionId = String(
      payload.sessionID ||
      payload.sessionId ||
      payload.session_id ||
      payload.SessionId ||
      `sess_${Date.now()}`
    ).trim();

    // Dynamically parse user phone from gateway (no hardcoded default!)
    const userId = String(
      payload.userID ||
      payload.userId ||
      payload.user_id ||
      payload.msisdn ||
      payload.phoneNumber ||
      payload.phone ||
      payload.Mobile ||
      payload.sender ||
      ""
    ).trim();

    const rawUserData = String(
      payload.userData ||
      payload.message ||
      payload.userInput ||
      payload.text ||
      payload.user_data ||
      payload.Message ||
      ""
    ).trim();

    const sessionType = String(
      payload.type ||
      payload.Type ||
      payload.session_type ||
      "Response"
    ).trim();

    const phoneInfo = normalizePhone(userId);

    // Save session helper across Multi-Tier storage
    const saveSession = async (state: UssdSessionState) => {
      inMemorySessions.set(sessionId, state);
      if (userId) inMemorySessions.set(userId, state);

      try {
        await supabase.from("ussd_sessions").upsert(
          {
            ...state,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "session_id" }
        );
      } catch (_) {}

      try {
        const fallbackItems = [{ key: `ussd_sess_${sessionId}`, value: JSON.stringify(state) }];
        if (userId) {
          fallbackItems.push({ key: `ussd_user_${userId}`, value: JSON.stringify(state) });
        }
        await supabase.from("site_settings").upsert(fallbackItems, { onConflict: "key" });
      } catch (_) {}
    };

    const clearSession = async () => {
      inMemorySessions.delete(sessionId);
      if (userId) inMemorySessions.delete(userId);
      try {
        await supabase.from("ussd_sessions").delete().eq("session_id", sessionId);
      } catch (_) {}
      try {
        const keysToDelete = [`ussd_sess_${sessionId}`];
        if (userId) keysToDelete.push(`ussd_user_${userId}`);
        await supabase.from("site_settings").delete().in("key", keysToDelete);
      } catch (_) {}
    };

    // Helper for responding in Arkesel standard USSD format
    const respondUSSD = async (message: string, continueSession = true, nextState?: Partial<UssdSessionState>) => {
      if (nextState) {
        const updatedState: UssdSessionState = {
          session_id: sessionId,
          user_id: userId,
          current_step: nextState.current_step || "MAIN_MENU",
          candidate_code: nextState.candidate_code ?? null,
          nominee_id: nextState.nominee_id ?? null,
          nominee_name: nextState.nominee_name ?? null,
          category_id: nextState.category_id ?? null,
          category_title: nextState.category_title ?? null,
          category_page: nextState.category_page ?? 1,
          nominee_page: nextState.nominee_page ?? 1,
          quantity: nextState.quantity ?? 1,
          network: nextState.network ?? null,
          wallet_phone: nextState.wallet_phone ?? null,
          reference: nextState.reference ?? null,
          metadata: nextState.metadata ?? {},
          updated_at: new Date().toISOString(),
        };

        await saveSession(updatedState);
      }

      if (!continueSession) {
        await clearSession();
      }

      return new Response(
        JSON.stringify({
          sessionID: sessionId,
          userID: userId,
          message: message,
          continueSession: continueSession,
          type: continueSession ? "Response" : "Release",
          Type: continueSession ? "Response" : "Release",
          action: continueSession ? "prompt" : "release",
          status: continueSession ? "continue" : "end",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
          },
        }
      );
    };

    // Helper to format currency safely
    const formatGHS = (val: number) => {
      const num = Number(val);
      const safe = isNaN(num) ? 1.0 : num;
      return `GHS ${safe.toFixed(2)}`;
    };

    // Fetch dynamic site voting price
    const { data: priceRow } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "vote_price_ghs")
      .maybeSingle();
    const rawPrice = priceRow?.value ? parseFloat(String(priceRow.value)) : 1.0;
    const votePrice = isNaN(rawPrice) || rawPrice <= 0 ? 1.0 : rawPrice;

    // =========================================================================
    // A. Payment Callback / Webhook Notification from Arkesel
    // =========================================================================
    const isPaymentCallback =
      payload.action === "payment" ||
      payload.event === "payment.success" ||
      (payload.status === "success" && (payload.amount || payload.transaction_id)) ||
      Boolean(payload.nominee_code && payload.votes && !payload.sessionID);

    if (isPaymentCallback) {
      const candidateCode = String(
        payload.nominee_code ||
        payload.candidate_code ||
        payload.code ||
        payload.candidate_id ||
        ""
      ).trim();

      const votesToAdd = Math.max(
        1,
        parseInt(String(payload.votes || payload.number_of_votes || payload.quantity || "1"), 10) || 1
      );

      const amountPaid = parseFloat(String(payload.amount || payload.total_amount || "0")) || (votesToAdd * votePrice);
      const customerPhone = userId || String(payload.phone || payload.customer_phone || "");
      const transactionRef = String(payload.transaction_id || payload.reference || `arkesel_${Date.now()}`).trim();

      if (candidateCode) {
        const { data: nominee } = await supabase
          .from("nominees")
          .select("id, name, votes_count, category_id")
          .or(`nominee_code.eq.${candidateCode},id.eq.${candidateCode}`)
          .maybeSingle();

        if (nominee) {
          const newVotes = (nominee.votes_count || 0) + votesToAdd;
          await supabase.from("nominees").update({ votes_count: newVotes }).eq("id", nominee.id);

          await supabase.from("payments").insert({
            client_reference: transactionRef,
            transaction_id: transactionRef,
            amount: amountPaid,
            currency: "GHS",
            customer_name: `USSD Voter (${customerPhone})`,
            customer_email: "ussd-voting@abcossa.org",
            customer_phone: customerPhone,
            payment_type: "voting",
            status: "paid",
            payment_channel: "ussd-arkesel",
            description: `Arkesel USSD Vote for ${nominee.name} (${votesToAdd} votes)`,
            metadata: {
              nominee_id: nominee.id,
              nominee_code: candidateCode,
              nominee_name: nominee.name,
              votes_count: votesToAdd,
              gateway: "arkesel",
              raw_payload: payload,
            },
          });

          return new Response(
            JSON.stringify({
              status: "success",
              message: `Credited ${votesToAdd} vote(s) to ${nominee.name}. Total: ${newVotes}`,
              nominee_id: nominee.id,
              total_votes: newVotes,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // =========================================================================
    // B. Interactive USSD Session Flow & Multi-Tier State Recovery
    // =========================================================================

    if (sessionType.toLowerCase() === "release" || sessionType.toLowerCase() === "timeout") {
      await clearSession();
      return respondUSSD("Session ended", false);
    }

    // Clean user input
    let cleanInput = rawUserData;
    if (cleanInput.startsWith("*928*667*")) {
      cleanInput = cleanInput.replace(/^\*928\*667\*/, "").replace(/#$/, "");
    } else if (
      cleanInput.startsWith("*928*667#") ||
      cleanInput === "*928*667" ||
      cleanInput === "*920*667#" ||
      cleanInput === "*920*22#"
    ) {
      cleanInput = "";
    }

    // Multi-tier session lookup
    let sessionState: UssdSessionState | null =
      inMemorySessions.get(sessionId) || (userId ? inMemorySessions.get(userId) : null) || null;

    if (!sessionState) {
      try {
        const orFilter = userId ? `session_id.eq.${sessionId},user_id.eq.${userId}` : `session_id.eq.${sessionId}`;
        const { data: dbSession } = await supabase
          .from("ussd_sessions")
          .select("*")
          .or(orFilter)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (dbSession) {
          sessionState = dbSession as UssdSessionState;
          inMemorySessions.set(sessionId, sessionState);
          if (userId) inMemorySessions.set(userId, sessionState);
        }
      } catch (_) {}
    }

    if (!sessionState) {
      try {
        const keysToFetch = [`ussd_sess_${sessionId}`];
        if (userId) keysToFetch.push(`ussd_user_${userId}`);
        const { data: fallbackRows } = await supabase
          .from("site_settings")
          .select("key, value")
          .in("key", keysToFetch);

        if (fallbackRows && fallbackRows.length > 0) {
          const val = fallbackRows[0].value;
          if (val) {
            sessionState = JSON.parse(val) as UssdSessionState;
            inMemorySessions.set(sessionId, sessionState);
            if (userId) inMemorySessions.set(userId, sessionState);
          }
        }
      } catch (_) {}
    }

    // Default main menu text
    const renderMainMenu = async () => {
      const menuText =
        "ABCOSSA Awards 2026\n" +
        "1. Vote with Candidate Code\n" +
        "2. Browse Categories\n" +
        "3. Live Standings\n" +
        "4. Event Info & Pricing";

      return respondUSSD(menuText, true, {
        current_step: "MAIN_MENU",
        candidate_code: null,
        nominee_id: null,
        nominee_name: null,
        quantity: 1,
        network: null,
        wallet_phone: null,
      });
    };

    // -------------------------------------------------------------------------
    // Shortcut / Fast-Dial (e.g. *928*667*101# or *928*667*101*5#)
    // -------------------------------------------------------------------------
    if (cleanInput.includes("*")) {
      const parts = cleanInput.split("*").map((s) => s.trim()).filter(Boolean);
      const candidateCode = parts[0] === "1" ? parts[1] : parts[0];
      const qtyStr = parts[0] === "1" ? parts[2] : parts[1];

      if (candidateCode) {
        const { data: nominee } = await supabase
          .from("nominees")
          .select("id, name, nominee_code, category_id, votes_count")
          .eq("nominee_code", candidateCode)
          .maybeSingle();

        if (nominee) {
          if (!qtyStr) {
            return respondUSSD(
              `Nominee: ${nominee.name}\n` +
              `Price: ${formatGHS(votePrice)} / vote\n\n` +
              `Enter number of votes to cast:\n` +
              `(e.g. 1, 5, 10, 20)\n\n` +
              `00. Back`,
              true,
              {
                current_step: "ENTER_VOTES",
                candidate_code: nominee.nominee_code,
                nominee_id: nominee.id,
                nominee_name: nominee.name,
              }
            );
          } else {
            const voteCount = Math.max(1, parseInt(qtyStr, 10) || 1);
            const totalAmount = voteCount * votePrice;

            return respondUSSD(
              `Nominee: ${nominee.name}\n` +
              `Votes: ${voteCount} (${formatGHS(totalAmount)})\n\n` +
              `Select Payment Network:\n` +
              `1. MTN Mobile Money\n` +
              `2. Telecel Cash\n` +
              `3. AT Money\n\n` +
              `00. Back`,
              true,
              {
                current_step: "SELECT_NETWORK",
                candidate_code: nominee.nominee_code,
                nominee_id: nominee.id,
                nominee_name: nominee.name,
                quantity: voteCount,
              }
            );
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // Session Initiation Check
    // -------------------------------------------------------------------------
    const isFirstTurn = sessionType.toLowerCase() === "initiation" || cleanInput === "";

    if (isFirstTurn) {
      return renderMainMenu();
    }

    // Determine current step with Smart State Fallback
    let currentStep = sessionState?.current_step || "MAIN_MENU";
    const userInput = cleanInput;

    if (!sessionState || currentStep === "MAIN_MENU") {
      if (userInput === "1") {
        currentStep = "MAIN_MENU";
      } else if (userInput === "2") {
        currentStep = "MAIN_MENU";
      } else if (userInput === "3") {
        currentStep = "MAIN_MENU";
      } else if (userInput === "4") {
        currentStep = "MAIN_MENU";
      } else if (/^\d{3,4}$/.test(userInput)) {
        currentStep = "ENTER_CODE";
      }
    }

    // Global back to main menu
    if (userInput === "00" && (currentStep === "ENTER_CODE" || currentStep === "BROWSE_CATEGORIES" || currentStep === "INFO" || currentStep === "STANDINGS")) {
      return renderMainMenu();
    }

    // =========================================================================
    // Step 1: MAIN_MENU
    // =========================================================================
    if (currentStep === "MAIN_MENU") {
      if (userInput === "1") {
        return respondUSSD(
          "Enter 3-digit Candidate Code:\n(e.g. 101, 102, 103)\n\n00. Main Menu",
          true,
          {
            ...(sessionState || {}),
            current_step: "ENTER_CODE",
          }
        );
      }

      if (/^\d{3,4}$/.test(userInput)) {
        const { data: nominee } = await supabase
          .from("nominees")
          .select("id, name, nominee_code, category_id, votes_count")
          .eq("nominee_code", userInput)
          .maybeSingle();

        if (nominee) {
          return respondUSSD(
            `Nominee: ${nominee.name}\n` +
            `Price: ${formatGHS(votePrice)} / vote\n\n` +
            `Enter number of votes to cast:\n` +
            `(e.g. 1, 5, 10, 20)\n\n` +
            `00. Back`,
            true,
            {
              ...(sessionState || {}),
              current_step: "ENTER_VOTES",
              candidate_code: nominee.nominee_code,
              nominee_id: nominee.id,
              nominee_name: nominee.name,
            }
          );
        } else {
          return respondUSSD(
            `Candidate Code "${userInput}" was not found.\n\nPlease enter a valid 3-digit code:\n\n00. Back`,
            true,
            {
              ...(sessionState || {}),
              current_step: "ENTER_CODE",
            }
          );
        }
      }

      if (userInput === "2") {
        const { data: allCategories = [] } = await supabase
          .from("award_categories")
          .select("id, title, display_order")
          .eq("is_active", true)
          .order("display_order", { ascending: true });

        const categories = allCategories || [];
        const catPageSize = 4;
        const totalCatPages = Math.max(1, Math.ceil(categories.length / catPageSize));
        const pageCats = categories.slice(0, catPageSize);

        let catMenu = `Select Category (1/${totalCatPages}):\n`;
        pageCats.forEach((c, idx) => {
          catMenu += `${idx + 1}. ${c.title}\n`;
        });
        catMenu += "\n";
        if (totalCatPages > 1) catMenu += "99. Next Page >>\n";
        catMenu += "00. Main Menu";

        return respondUSSD(catMenu.trim(), true, {
          ...(sessionState || {}),
          current_step: "BROWSE_CATEGORIES",
          category_page: 1,
        });
      }

      if (userInput === "3") {
        return respondUSSD(
          "ABCOSSA Awards 2026\n\n" +
          `Rate: ${formatGHS(votePrice)} / vote\n` +
          "Networks: MTN, Telecel, AT\n" +
          "Portal: https://abcossa.org\n\n" +
          "00. Main Menu",
          true,
          {
            ...(sessionState || {}),
            current_step: "INFO",
          }
        );
      }

      if (userInput === "4") {
        const { data: topNominees = [] } = await supabase
          .from("nominees")
          .select("name, votes_count, nominee_code")
          .eq("is_published", true)
          .order("votes_count", { ascending: false })
          .limit(4);

        let standingsText = "Live Awards Standings:\n\n";
        topNominees.forEach((n, idx) => {
          standingsText += `${idx + 1}. ${n.name} (#${n.nominee_code}) - ${n.votes_count} votes\n`;
        });
        standingsText += "\n00. Main Menu";

        return respondUSSD(standingsText.trim(), true, {
          ...(sessionState || {}),
          current_step: "STANDINGS",
        });
      }

      return renderMainMenu();
    }

    // =========================================================================
    // Step 2: ENTER_CODE
    // =========================================================================
    if (currentStep === "ENTER_CODE") {
      if (userInput === "00") {
        return renderMainMenu();
      }

      const candidateCode = userInput;
      const { data: nominee, error: findErr } = await supabase
        .from("nominees")
        .select("id, name, nominee_code, category_id, votes_count")
        .eq("nominee_code", candidateCode)
        .maybeSingle();

      if (findErr || !nominee) {
        return respondUSSD(
          `Candidate Code "${candidateCode}" not found.\n\nPlease check the code and try again (e.g. 101, 102):\n\n00. Main Menu`,
          true,
          {
            ...(sessionState || {}),
            current_step: "ENTER_CODE",
          }
        );
      }

      return respondUSSD(
        `Nominee: ${nominee.name}\n` +
        `Price: ${formatGHS(votePrice)} / vote\n\n` +
        `Enter number of votes to cast:\n` +
        `(e.g. 1, 5, 10, 20)\n\n` +
        `00. Back`,
        true,
        {
          ...(sessionState || {}),
          current_step: "ENTER_VOTES",
          candidate_code: nominee.nominee_code,
          nominee_id: nominee.id,
          nominee_name: nominee.name,
        }
      );
    }

    // =========================================================================
    // Step 3: ENTER_VOTES -> SELECT_NETWORK
    // =========================================================================
    if (currentStep === "ENTER_VOTES") {
      if (userInput === "00") {
        return respondUSSD(
          "Enter 3-digit Candidate Code:\n(e.g. 101, 102, 103)\n\n00. Main Menu",
          true,
          {
            ...(sessionState || {}),
            current_step: "ENTER_CODE",
          }
        );
      }

      const voteCount = parseInt(userInput, 10);
      if (isNaN(voteCount) || voteCount < 1) {
        return respondUSSD(
          "Please enter a valid number of votes (e.g. 1, 5, 10):\n\n00. Back",
          true,
          {
            ...(sessionState || {}),
            current_step: "ENTER_VOTES",
          }
        );
      }

      const totalAmount = voteCount * votePrice;
      const nomineeName = sessionState?.nominee_name || "Nominee";

      return respondUSSD(
        `Nominee: ${nomineeName}\n` +
        `Votes: ${voteCount} (${formatGHS(totalAmount)})\n\n` +
        `Select Payment Network:\n` +
        `1. MTN Mobile Money\n` +
        `2. Telecel Cash\n` +
        `3. AT Money\n\n` +
        `00. Back`,
        true,
        {
          ...(sessionState || {}),
          current_step: "SELECT_NETWORK",
          quantity: voteCount,
        }
      );
    }

    // =========================================================================
    // Step 4: SELECT_NETWORK -> Check Phone & Prompt
    // =========================================================================
    if (currentStep === "SELECT_NETWORK") {
      if (userInput === "00") {
        return respondUSSD(
          `Nominee: ${sessionState?.nominee_name || "Nominee"}\n` +
          `Price: ${formatGHS(votePrice)} / vote\n\n` +
          `Enter number of votes to cast:\n` +
          `(e.g. 1, 5, 10, 20)\n\n` +
          `00. Back`,
          true,
          {
            ...(sessionState || {}),
            current_step: "ENTER_VOTES",
          }
        );
      }

      let networkName = "MTN";
      if (userInput === "1") networkName = "MTN";
      else if (userInput === "2") networkName = "Telecel";
      else if (userInput === "3") networkName = "AT";
      else {
        return respondUSSD(
          `Invalid network option.\n\n` +
          `Select Payment Network:\n` +
          `1. MTN Mobile Money\n` +
          `2. Telecel Cash\n` +
          `3. AT Money\n\n` +
          `00. Back`,
          true,
          {
            ...(sessionState || {}),
            current_step: "SELECT_NETWORK",
          }
        );
      }

      // If gateway provided a valid dialing phone number, ask for confirmation
      if (phoneInfo.isValid && phoneInfo.local) {
        return respondUSSD(
          `Network: ${networkName} MoMo\n\n` +
          `Pay with this number (${phoneInfo.local})?\n` +
          `1. Yes, use this number\n` +
          `2. No, use other wallet\n\n` +
          `00. Back`,
          true,
          {
            ...(sessionState || {}),
            current_step: "CONFIRM_PHONE",
            network: networkName,
          }
        );
      }

      // If NO valid phone detected from gateway, ask voter to type their number
      return respondUSSD(
        `Network: ${networkName} MoMo\n\n` +
        `Enter 10-digit MoMo Number:\n` +
        `(e.g. 0241234567)\n\n` +
        `00. Back`,
        true,
        {
          ...(sessionState || {}),
          current_step: "ENTER_PHONE",
          network: networkName,
        }
      );
    }

    // =========================================================================
    // Step 5: CONFIRM_PHONE
    // =========================================================================
    if (currentStep === "CONFIRM_PHONE") {
      if (userInput === "00") {
        return respondUSSD(
          `Select Payment Network:\n` +
          `1. MTN Mobile Money\n` +
          `2. Telecel Cash\n` +
          `3. AT Money\n\n` +
          `00. Back`,
          true,
          {
            ...(sessionState || {}),
            current_step: "SELECT_NETWORK",
          }
        );
      }

      if (userInput === "1") {
        const walletPhone = phoneInfo.local;
        const voteCount = sessionState?.quantity || 1;
        const totalAmount = voteCount * votePrice;
        const nomineeName = sessionState?.nominee_name || "Nominee";
        const code = sessionState?.candidate_code || "";
        const netName = sessionState?.network || "MTN";

        return respondUSSD(
          `Vote Summary:\n` +
          `- Nominee: ${nomineeName} (${code})\n` +
          `- Quantity: ${voteCount} vote(s)\n` +
          `- Total: ${formatGHS(totalAmount)}\n` +
          `- Network: ${netName} MoMo\n` +
          `- Wallet: ${walletPhone}\n\n` +
          `1. Authorize & Pay\n` +
          `2. Cancel\n\n` +
          `00. Back`,
          true,
          {
            ...(sessionState || {}),
            current_step: "CONFIRM_VOTE",
            wallet_phone: walletPhone,
          }
        );
      }

      if (userInput === "2") {
        return respondUSSD(
          `Enter 10-digit MoMo Number:\n` +
          `(e.g. 0241234567)\n\n` +
          `00. Back`,
          true,
          {
            ...(sessionState || {}),
            current_step: "ENTER_PHONE",
          }
        );
      }

      return respondUSSD(
        `Please select an option:\n` +
        `1. Yes, use this number (${phoneInfo.local})\n` +
        `2. No, use other wallet\n\n` +
        `00. Back`,
        true,
        {
          ...(sessionState || {}),
          current_step: "CONFIRM_PHONE",
        }
      );
    }

    // =========================================================================
    // Step 6: ENTER_PHONE
    // =========================================================================
    if (currentStep === "ENTER_PHONE") {
      if (userInput === "00") {
        return respondUSSD(
          `Select Payment Network:\n` +
          `1. MTN Mobile Money\n` +
          `2. Telecel Cash\n` +
          `3. AT Money\n\n` +
          `00. Back`,
          true,
          {
            ...(sessionState || {}),
            current_step: "SELECT_NETWORK",
          }
        );
      }

      const inputPhone = userInput.replace(/[^\d]/g, "");
      const normalizedInput = normalizePhone(inputPhone);

      if (!normalizedInput.isValid) {
        return respondUSSD(
          `Invalid phone number.\n\nPlease enter a 10-digit MoMo number (e.g. 0241234567):\n\n00. Back`,
          true,
          {
            ...(sessionState || {}),
            current_step: "ENTER_PHONE",
          }
        );
      }

      const walletPhone = normalizedInput.local;
      const voteCount = sessionState?.quantity || 1;
      const totalAmount = voteCount * votePrice;
      const nomineeName = sessionState?.nominee_name || "Nominee";
      const code = sessionState?.candidate_code || "";
      const netName = sessionState?.network || "MTN";

      return respondUSSD(
        `Vote Summary:\n` +
        `- Nominee: ${nomineeName} (${code})\n` +
        `- Quantity: ${voteCount} vote(s)\n` +
        `- Total: ${formatGHS(totalAmount)}\n` +
        `- Network: ${netName} MoMo\n` +
        `- Wallet: ${walletPhone}\n\n` +
        `1. Authorize & Pay\n` +
        `2. Cancel\n\n` +
        `00. Back`,
        true,
        {
          ...(sessionState || {}),
          current_step: "CONFIRM_VOTE",
          wallet_phone: walletPhone,
        }
      );
    }

    // =========================================================================
    // Step 7: CONFIRM_VOTE -> Initiate Payment Push
    // =========================================================================
    if (currentStep === "CONFIRM_VOTE") {
      if (userInput === "00") {
        return respondUSSD(
          `Select Payment Network:\n` +
          `1. MTN Mobile Money\n` +
          `2. Telecel Cash\n` +
          `3. AT Money\n\n` +
          `00. Back`,
          true,
          {
            ...(sessionState || {}),
            current_step: "SELECT_NETWORK",
          }
        );
      }

      if (userInput === "1") {
        const voteCount = sessionState?.quantity || 1;
        const totalAmount = voteCount * votePrice;
        const nomineeId = sessionState?.nominee_id;
        const candidateCode = sessionState?.candidate_code || "";
        const nomineeName = sessionState?.nominee_name || "Nominee";
        const network = sessionState?.network || "MTN";
        const walletPhone = sessionState?.wallet_phone || phoneInfo.local || "";
        const trxRef = `USSD_${Date.now().toString().slice(-8)}`;

        // 1. Trigger MoMo Payment API push to subscriber
        const paymentResult = await triggerMoMoPayment({
          amount: totalAmount,
          phone: walletPhone,
          network: network,
          reference: trxRef,
          nomineeName: nomineeName,
          votesCount: voteCount,
          supabase: supabase,
        });

        // 2. Record vote & payment in Supabase
        if (nomineeId) {
          const { data: nomRow } = await supabase
            .from("nominees")
            .select("votes_count")
            .eq("id", nomineeId)
            .maybeSingle();

          const newVotes = (nomRow?.votes_count || 0) + voteCount;
          await supabase.from("nominees").update({ votes_count: newVotes }).eq("id", nomineeId);
        }

        await supabase.from("payments").insert({
          client_reference: trxRef,
          transaction_id: trxRef,
          amount: totalAmount,
          currency: "GHS",
          customer_name: `USSD Voter (${walletPhone})`,
          customer_email: `voter_${walletPhone}@abcossa.org`,
          customer_phone: walletPhone,
          payment_type: "voting",
          status: "pending",
          payment_channel: `ussd-${network.toLowerCase()}`,
          description: `USSD Vote for ${nomineeName} (${voteCount} vote(s)) via ${network}`,
          metadata: {
            nominee_id: nomineeId,
            nominee_code: candidateCode,
            nominee_name: nomineeName,
            votes_count: voteCount,
            network: network,
            wallet_phone: walletPhone,
            session_id: sessionId,
            gateway: paymentResult.gateway,
            payment_result: paymentResult.result,
          },
        });

        if (paymentResult.gateway === "unconfigured") {
          return respondUSSD(
            "Payment Setup Notice:\n\n" +
            "Paystack Live Key is not configured in Portal settings.\n\n" +
            "Thank you for supporting ABCOSSA!",
            false
          );
        }

        if (!paymentResult.success) {
          const errMsg = paymentResult.result?.message || "Could not trigger network prompt.";
          return respondUSSD(
            `Payment Notice:\n\n` +
            `${errMsg}\n\n` +
            `Phone: ${walletPhone}\n` +
            `Please try again or check your wallet balance.`,
            false
          );
        }

        // CRITICAL: Handle in-session OTP flow for Telecel Cash / Vodafone & AT Money
        if (paymentResult.requiresOtp) {
          return respondUSSD(
            `Telecel Cash OTP / Voucher\n\n` +
            `An OTP / Voucher has been sent via SMS to ${walletPhone}.\n\n` +
            `Enter the OTP / Voucher code:\n\n` +
            `00. Cancel`,
            true,
            {
              ...(sessionState || {}),
              current_step: "ENTER_OTP",
              reference: trxRef,
              wallet_phone: walletPhone,
              quantity: voteCount,
            }
          );
        }

        // Standard USSD PIN push (MTN & direct telco push)
        const isMTN = network.toLowerCase().includes("mtn");
        const approvalGuide = isMTN
          ? `(If missed, dial *170# -> 6. Approvals).`
          : `(Check phone notifications for MoMo prompt).`;

        return respondUSSD(
          `Payment Prompt Sent!\n\n` +
          `Enter your MoMo PIN on ${walletPhone} to authorize ${formatGHS(totalAmount)}.\n` +
          `${approvalGuide}\n\n` +
          `Your votes will be credited immediately!`,
          false
        );
      } else {
        return respondUSSD("Voting transaction cancelled.\n\nThank you for using ABCOSSA USSD.", false);
      }
    }

    // =========================================================================
    // Step 7B: ENTER_OTP -> Submit Telecel / AT OTP to Paystack
    // =========================================================================
    if (currentStep === "ENTER_OTP") {
      if (userInput === "00") {
        return respondUSSD("Voting transaction cancelled.\n\nThank you for using ABCOSSA USSD.", false);
      }

      const otp = userInput.trim();
      const ref = sessionState?.reference || "";
      const voteCount = sessionState?.quantity || 1;
      const totalAmount = voteCount * votePrice;
      const nomineeName = sessionState?.nominee_name || "Nominee";

      // Fetch Paystack Secret Key
      const { data: settingsRows } = await supabase
        .from("site_settings")
        .select("key, value")
        .eq("key", "paystack_secret_key");
      const secretKey = settingsRows?.[0]?.value || Deno.env.get("PAYSTACK_SECRET_KEY") || "";

      if (!secretKey) {
        return respondUSSD("Payment Gateway configuration error. Please try again shortly.", false);
      }

      const otpResult = await submitPaystackOtp({
        reference: ref,
        otp: otp,
        secretKey: secretKey,
      });

      if (!otpResult.success && otpResult.status !== "pay_offline" && otpResult.status !== "pending") {
        return respondUSSD(
          `Invalid or Expired OTP.\n\n` +
          `Please re-enter the OTP code sent to your phone:\n\n` +
          `00. Cancel`,
          true,
          {
            ...(sessionState || {}),
            current_step: "ENTER_OTP",
          }
        );
      }

      // Mark payment as paid in database upon OTP success
      await supabase
        .from("payments")
        .update({
          status: "paid",
          updated_at: new Date().toISOString(),
        })
        .eq("client_reference", ref);

      return respondUSSD(
        `Payment Authorized!\n\n` +
        `Your payment of ${formatGHS(totalAmount)} has been approved.\n\n` +
        `${voteCount} vote(s) credited to ${nomineeName}!\n\n` +
        `Thank you for voting!`,
        false
      );
    }

    // =========================================================================
    // Step 8: BROWSE_CATEGORIES
    // =========================================================================
    if (currentStep === "BROWSE_CATEGORIES") {
      if (userInput === "00") {
        return renderMainMenu();
      }

      const { data: allCategories = [] } = await supabase
        .from("award_categories")
        .select("id, title, display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      const categories = allCategories || [];
      const catPageSize = 4;
      const totalCatPages = Math.max(1, Math.ceil(categories.length / catPageSize));
      let currentCatPage = sessionState?.category_page || 1;

      if (userInput === "99") {
        currentCatPage = Math.min(totalCatPages, currentCatPage + 1);
      } else if (userInput === "88") {
        currentCatPage = Math.max(1, currentCatPage - 1);
      } else {
        const selectedNum = parseInt(userInput, 10);
        const startIdx = (currentCatPage - 1) * catPageSize;
        const selectedCat = categories[startIdx + (selectedNum - 1)] || categories[selectedNum - 1];

        if (selectedCat) {
          const { data: allNominees = [] } = await supabase
            .from("nominees")
            .select("id, name, nominee_code")
            .eq("category_id", selectedCat.id)
            .eq("is_published", true)
            .order("nominee_code", { ascending: true });

          const catNominees = allNominees || [];
          const nomPageSize = 4;
          const totalNomPages = Math.max(1, Math.ceil(catNominees.length / nomPageSize));

          if (catNominees.length === 0) {
            return respondUSSD(
              `No nominees currently registered in "${selectedCat.title}".\n\n00. Back to Categories`,
              true,
              {
                ...(sessionState || {}),
                current_step: "BROWSE_CATEGORIES",
              }
            );
          }

          const pageNominees = catNominees.slice(0, nomPageSize);
          let nomMenu = `${selectedCat.title} (1/${totalNomPages}):\n`;
          pageNominees.forEach((n, idx) => {
            nomMenu += `${idx + 1}. ${n.name} (#${n.nominee_code})\n`;
          });
          nomMenu += "\n";
          if (totalNomPages > 1) nomMenu += "99. Next Page >>\n";
          nomMenu += "00. Back to Categories";

          return respondUSSD(nomMenu.trim(), true, {
            ...(sessionState || {}),
            current_step: "BROWSE_NOMINEES",
            category_id: selectedCat.id,
            category_title: selectedCat.title,
            nominee_page: 1,
          });
        }
      }

      const startIdx = (currentCatPage - 1) * catPageSize;
      const pageCats = categories.slice(startIdx, startIdx + catPageSize);

      let catMenu = `Select Category (${currentCatPage}/${totalCatPages}):\n`;
      pageCats.forEach((c, idx) => {
        catMenu += `${idx + 1}. ${c.title}\n`;
      });
      catMenu += "\n";
      if (currentCatPage < totalCatPages) catMenu += "99. Next Page >>\n";
      if (currentCatPage > 1) catMenu += "88. << Prev Page\n";
      catMenu += "00. Main Menu";

      return respondUSSD(catMenu.trim(), true, {
        ...(sessionState || {}),
        current_step: "BROWSE_CATEGORIES",
        category_page: currentCatPage,
      });
    }

    // =========================================================================
    // Step 9: BROWSE_NOMINEES
    // =========================================================================
    if (currentStep === "BROWSE_NOMINEES") {
      if (userInput === "00") {
        const { data: allCategories = [] } = await supabase
          .from("award_categories")
          .select("id, title, display_order")
          .eq("is_active", true)
          .order("display_order", { ascending: true });

        const categories = allCategories || [];
        const catPageSize = 4;
        const totalCatPages = Math.max(1, Math.ceil(categories.length / catPageSize));
        const currentCatPage = sessionState?.category_page || 1;
        const startIdx = (currentCatPage - 1) * catPageSize;
        const pageCats = categories.slice(startIdx, startIdx + catPageSize);

        let catMenu = `Select Category (${currentCatPage}/${totalCatPages}):\n`;
        pageCats.forEach((c, idx) => {
          catMenu += `${idx + 1}. ${c.title}\n`;
        });
        catMenu += "\n";
        if (currentCatPage < totalCatPages) catMenu += "99. Next Page >>\n";
        if (currentCatPage > 1) catMenu += "88. << Prev Page\n";
        catMenu += "00. Main Menu";

        return respondUSSD(catMenu.trim(), true, {
          ...(sessionState || {}),
          current_step: "BROWSE_CATEGORIES",
        });
      }

      const categoryId = sessionState?.category_id;
      const { data: allNominees = [] } = await supabase
        .from("nominees")
        .select("id, name, nominee_code")
        .eq("category_id", categoryId)
        .eq("is_published", true)
        .order("nominee_code", { ascending: true });

      const catNominees = allNominees || [];
      const nomPageSize = 4;
      const totalNomPages = Math.max(1, Math.ceil(catNominees.length / nomPageSize));
      let currentNomPage = sessionState?.nominee_page || 1;

      if (userInput === "99") {
        currentNomPage = Math.min(totalNomPages, currentNomPage + 1);
      } else if (userInput === "88") {
        currentNomPage = Math.max(1, currentNomPage - 1);
      } else {
        const codeMatch = catNominees.find((n) => n.nominee_code === userInput);
        const startIdx = (currentNomPage - 1) * nomPageSize;
        const numMatch = catNominees[startIdx + (parseInt(userInput, 10) - 1)];
        const selectedNominee = codeMatch || numMatch;

        if (selectedNominee) {
          return respondUSSD(
            `Nominee: ${selectedNominee.name}\n` +
            `Price: ${formatGHS(votePrice)} / vote\n\n` +
            `Enter number of votes to cast:\n` +
            `(e.g. 1, 5, 10, 20)\n\n` +
            `00. Back`,
            true,
            {
              ...(sessionState || {}),
              current_step: "ENTER_VOTES",
              candidate_code: selectedNominee.nominee_code,
              nominee_id: selectedNominee.id,
              nominee_name: selectedNominee.name,
            }
          );
        }
      }

      const startIdx = (currentNomPage - 1) * nomPageSize;
      const pageNominees = catNominees.slice(startIdx, startIdx + nomPageSize);
      const catTitle = sessionState?.category_title || "Category";

      let nomMenu = `${catTitle} (${currentNomPage}/${totalNomPages}):\n`;
      pageNominees.forEach((n, idx) => {
        nomMenu += `${idx + 1}. ${n.name} (#${n.nominee_code})\n`;
      });
      nomMenu += "\n";
      if (currentNomPage < totalNomPages) nomMenu += "99. Next Page >>\n";
      if (currentNomPage > 1) nomMenu += "88. << Prev Page\n";
      nomMenu += "00. Back to Categories";

      return respondUSSD(nomMenu.trim(), true, {
        ...(sessionState || {}),
        current_step: "BROWSE_NOMINEES",
        nominee_page: currentNomPage,
      });
    }

    if (currentStep === "INFO" || currentStep === "STANDINGS") {
      return renderMainMenu();
    }

    return renderMainMenu();
  } catch (error) {
    console.error("Fatal error in Arkesel USSD webhook:", error);
    return new Response(
      JSON.stringify({
        sessionID: "error",
        message: "An unexpected error occurred. Please try again shortly.",
        continueSession: false,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
