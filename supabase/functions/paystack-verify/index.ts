import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Fetch dynamic Paystack settings
    const { data: settingsData } = await supabase
      .from("site_settings")
      .select("key, value")
      .eq("key", "paystack_secret_key");

    const secretKey = settingsData?.[0]?.value || Deno.env.get("PAYSTACK_SECRET_KEY") || "";

    if (!secretKey) {
      return new Response(
        JSON.stringify({ success: false, message: "Paystack Secret Key not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Verify transaction with Paystack API
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    const result = await paystackRes.json();

    if (result.status && result.data?.status === "success") {
      // Update payment record in database
      const { data: updatedPayment, error: dbErr } = await supabase
        .from("payments")
        .update({
          status: "paid",
          transaction_id: String(result.data.id),
          payment_channel: result.data.channel || "card",
          updated_at: new Date().toISOString(),
        })
        .eq("client_reference", reference)
        .select()
        .single();

      if (dbErr) {
        console.error("Database update error:", dbErr);
      }

      return new Response(
        JSON.stringify({ success: true, payment: updatedPayment, paystackData: result.data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: result.data?.gateway_response || result.message || "Payment verification failed",
        status: result.data?.status || "failed",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
