import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch dynamic Paystack secret key from site_settings or env
    const { data: settingsData } = await supabase
      .from("site_settings")
      .select("key, value")
      .eq("key", "paystack_secret_key");

    const secretKey = settingsData?.[0]?.value || Deno.env.get("PAYSTACK_SECRET_KEY") || "";

    if (!secretKey) {
      return new Response(
        JSON.stringify({ success: false, message: "Paystack Secret Key is not configured yet in Staff Portal Settings." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // 1. Fetch recent transactions from Paystack API (up to 100 per sync)
    const paystackRes = await fetch("https://api.paystack.co/transaction?perPage=100", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    const pData = await paystackRes.json();
    if (!pData.status || !Array.isArray(pData.data)) {
      return new Response(
        JSON.stringify({ success: false, message: pData.message || "Failed to fetch transactions from Paystack" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const paystackTransactions = pData.data;
    console.log(`Fetched ${paystackTransactions.length} transactions from Paystack.`);

    // 2. Fetch all local payments from Supabase
    const { data: localPayments = [], error: fetchLocalErr } = await supabase
      .from("payments")
      .select("*");

    if (fetchLocalErr) {
      console.error("Error fetching local payments:", fetchLocalErr);
    }

    const localMap = new Map<string, any>();
    (localPayments || []).forEach((p: any) => {
      if (p.client_reference) localMap.set(p.client_reference, p);
      if (p.transaction_id) localMap.set(p.transaction_id, p);
    });

    let matchedCount = 0;
    let importedCount = 0;
    let updatedPaidCount = 0;
    let votesCreditedTotal = 0;
    let testSkippedCount = 0;

    // 3. Reconcile each transaction from Paystack (STRICTLY EXCLUDING TEST TRANSACTIONS)
    for (const p of paystackTransactions) {
      const domain = String(p.domain || "").toLowerCase();
      const gatewayResponse = String(p.gateway_response || "").toLowerCase();
      const ref = String(p.reference || "").trim();

      // STRICT CHECK: Skip all test domain transactions
      const isTest = domain === "test" || gatewayResponse.includes("test transaction") || ref.toLowerCase().startsWith("test_");
      if (isTest) {
        testSkippedCount++;
        console.log(`Skipping test transaction ${ref} (domain: ${domain})`);
        continue;
      }

      const trxId = String(p.id || "");
      const isSuccess = p.status === "success";
      const normalizedStatus = isSuccess ? "paid" : p.status === "abandoned" ? "failed" : p.status;
      const amountGhs = Number(p.amount || 0) / 100; // Paystack returns amount in pesewas
      const channel = String(p.channel || "mobile_money");
      const customerName = `${p.customer?.first_name || ""} ${p.customer?.last_name || ""}`.trim() || p.customer?.email || "Paystack Customer";
      const customerPhone = p.customer?.phone || "";
      const customerEmail = p.customer?.email || "customer@abcossa.org";
      const meta = typeof p.metadata === "object" && p.metadata !== null ? p.metadata : {};
      const nomineeId = meta.nominee_id;
      const votesCount = Number(meta.votes_count || 0);

      const existing = localMap.get(ref) || localMap.get(trxId);

      if (existing) {
        matchedCount++;
        const wasPaid = existing.status === "paid";

        // Update existing record if status changed
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
            // Credit votes if voting transaction
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
        // Import new LIVE successful transaction from Paystack that was missing locally
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

        // Credit nominee votes
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

    // 4. Check remaining local 'pending' records against Paystack live list
    const paystackRefSet = new Set(
      paystackTransactions
        .filter((t: any) => String(t.domain || "").toLowerCase() !== "test")
        .map((t: any) => String(t.reference))
    );
    let pendingFailedCount = 0;

    for (const localP of localPayments) {
      if (localP.status === "pending" && localP.client_reference) {
        if (paystackRefSet.has(localP.client_reference)) {
          // Already matched in live loop
        } else {
          // Query single transaction verification
          try {
            const singleRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(localP.client_reference)}`, {
              method: "GET",
              headers: { Authorization: `Bearer ${secretKey}` },
            });
            const singleData = await singleRes.json();
            if (singleData.status && singleData.data) {
              const domain = String(singleData.data.domain || "").toLowerCase();
              if (domain !== "test") {
                const s = singleData.data.status;
                const newStatus = s === "success" ? "paid" : s === "abandoned" ? "failed" : s;
                if (newStatus !== "pending") {
                  await supabase.from("payments").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", localP.id);
                  if (newStatus === "paid") updatedPaidCount++;
                  if (newStatus === "failed") pendingFailedCount++;
                }
              }
            }
          } catch (_) {}
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        paystackTotal: paystackTransactions.length,
        matchedCount,
        importedCount,
        updatedPaidCount,
        pendingFailedCount,
        votesCreditedTotal,
        testSkippedCount,
        message: `Successfully synchronized live payments: ${updatedPaidCount} updated to Paid, ${importedCount} imported, ${votesCreditedTotal} votes credited (${testSkippedCount} test records excluded).`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in paystack-sync edge function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
