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
    const { reference } = await req.json();

    if (!reference) {
      return new Response(
        JSON.stringify({ success: false, message: "Transaction reference is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

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

    // Verify transaction with official Paystack API
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    const result = await paystackRes.json();
    console.log("Paystack verification result for", reference, ":", JSON.stringify(result));

    // STRICT CHECK: Skip test domain transactions
    const domain = String(result.data?.domain || "").toLowerCase();
    const gatewayResponse = String(result.data?.gateway_response || "").toLowerCase();
    if (domain === "test" || gatewayResponse.includes("test transaction")) {
      return new Response(
        JSON.stringify({
          success: false,
          status: "test_ignored",
          verified: false,
          message: "This is a Paystack test/sandbox transaction and was ignored to preserve live data.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch current payment record from database
    const { data: currentPayment } = await supabase
      .from("payments")
      .select("*")
      .eq("client_reference", reference)
      .maybeSingle();

    const wasAlreadyPaid = currentPayment?.status === "paid";
    const nomineeId = currentPayment?.metadata?.nominee_id;
    const votesCount = Number(currentPayment?.metadata?.votes_count || 0);

    if (result.status && result.data?.status === "success") {
      // 1. Update payment record to PAID
      const { data: updatedPayment, error: dbErr } = await supabase
        .from("payments")
        .update({
          status: "paid",
          transaction_id: String(result.data.id || result.data.reference),
          payment_channel: result.data.channel || currentPayment?.payment_channel || "momo",
          updated_at: new Date().toISOString(),
        })
        .eq("client_reference", reference)
        .select()
        .maybeSingle();

      if (dbErr) {
        console.error("Database update error:", dbErr);
      }

      // 2. Automatically credit votes to nominee if not already credited
      let votesCredited = false;
      if (!wasAlreadyPaid && nomineeId && votesCount > 0) {
        const { data: nominee } = await supabase
          .from("nominees")
          .select("id, votes_count")
          .eq("id", nomineeId)
          .maybeSingle();

        if (nominee) {
          const newVotes = (nominee.votes_count || 0) + votesCount;
          await supabase.from("nominees").update({ votes_count: newVotes }).eq("id", nomineeId);
          votesCredited = true;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: "paid",
          verified: true,
          votesCredited,
          votesCount: votesCredited ? votesCount : 0,
          payment: updatedPayment || currentPayment,
          paystackData: result.data,
          message: `Verified successfully as Paid on Paystack.${votesCredited ? ` Credited ${votesCount} votes.` : ""}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If transaction exists on Paystack but failed / abandoned:
    if (result.status && (result.data?.status === "failed" || result.data?.status === "abandoned")) {
      const paystackStatus = result.data.status === "abandoned" ? "failed" : result.data.status;
      await supabase
        .from("payments")
        .update({
          status: paystackStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("client_reference", reference);

      return new Response(
        JSON.stringify({
          success: true,
          status: paystackStatus,
          verified: true,
          message: `Paystack confirms transaction was ${result.data.status}: ${result.data.gateway_response || "Not authorized"}`,
          paystackData: result.data,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transaction not found or rejected on Paystack
    return new Response(
      JSON.stringify({
        success: false,
        status: "unverified",
        verified: false,
        message: result.message || "Transaction not found on Paystack.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in paystack-verify edge function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
