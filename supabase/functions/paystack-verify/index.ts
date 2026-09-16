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

      // 2. FIX: Use atomic RPC to credit votes — prevents double-crediting
      let votesCredited = false;
      if (nomineeId && votesCount > 0 && updatedPayment?.id) {
        const { data: newCount } = await supabase.rpc("credit_votes_atomic", {
          p_payment_id: updatedPayment.id,
          p_nominee_id: nomineeId,
          p_votes_count: votesCount,
        });

        // newCount is NULL if votes were already credited (idempotent)
        if (newCount !== null) {
          votesCredited = true;
          console.log(`Verify: Credited ${votesCount} votes to nominee ${nomineeId}. New total: ${newCount}`);
        } else {
          console.log(`Verify: Payment ${reference} votes already credited — skipped.`);
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

    // If transaction exists on Paystack and is still pending / ongoing:
    if (
      result.status &&
      (result.data?.status === "pending" ||
        result.data?.status === "ongoing" ||
        result.data?.status === "processing" ||
        result.data?.status === "queued")
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          status: "pending",
          verified: false,
          votesCredited: false,
          votesCount: 0,
          payment: currentPayment,
          paystackData: result.data,
          message: "Payment is pending authorization on mobile money. Votes remain pending until confirmed.",
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

      // FIX: Use atomic RPC to deduct votes if previously credited
      if (currentPayment?.is_votes_credited && nomineeId && votesCount > 0 && currentPayment?.id) {
        const { data: newCount } = await supabase.rpc("deduct_votes_atomic", {
          p_payment_id: currentPayment.id,
          p_nominee_id: nomineeId,
          p_votes_count: votesCount,
        });

        if (newCount !== null) {
          console.log(`Verify: Deducted ${votesCount} votes from nominee ${nomineeId}. New total: ${newCount}`);
        }
      }

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

    // Transaction NOT FOUND on Paystack (or rejected) -> Mark as FAILED
    await supabase
      .from("payments")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("client_reference", reference);

    // FIX: Use atomic RPC to deduct votes if previously credited
    if (currentPayment?.is_votes_credited && nomineeId && votesCount > 0 && currentPayment?.id) {
      const { data: newCount } = await supabase.rpc("deduct_votes_atomic", {
        p_payment_id: currentPayment.id,
        p_nominee_id: nomineeId,
        p_votes_count: votesCount,
      });

      if (newCount !== null) {
        console.log(`Verify: Deducted ${votesCount} votes from nominee ${nomineeId}. New total: ${newCount}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: "failed",
        verified: true,
        message: result.message || "Transaction reference was not found on Paystack. Marked as Failed.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error verifying payment with Paystack:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal Server Error",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
