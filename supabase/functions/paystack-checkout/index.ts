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
    const {
      paymentId,
      clientReference,
      amount,
      customerName,
      customerEmail,
      customerPhone,
      description,
      callbackUrl,
    } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Fetch dynamic Paystack settings from site_settings table
    const { data: settingsData } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["paystack_secret_key", "paystack_currency"]);

    const settingsMap = Object.fromEntries(
      (settingsData || []).map((r: { key: string; value: string }) => [r.key, r.value])
    );

    const secretKey = settingsMap["paystack_secret_key"] || Deno.env.get("PAYSTACK_SECRET_KEY") || "";
    const currency = settingsMap["paystack_currency"] || "GHS";

    if (!secretKey) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Paystack Secret Key is not configured. Please set it in the Staff Portal or environment variables.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Call Paystack Initialize Transaction API
    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: customerEmail,
        amount: Math.round(Number(amount) * 100), // Pesewas
        currency,
        reference: clientReference,
        callback_url: callbackUrl || `${req.headers.get("origin") || "https://abcossa.org"}/payments/verify`,
        metadata: {
          payment_id: paymentId,
          customer_name: customerName,
          customer_phone: customerPhone,
          description: description || "ABCOSSA Payment",
        },
      }),
    });

    const result = await paystackRes.json();

    if (result.status && result.data?.authorization_url) {
      if (paymentId) {
        await supabase
          .from("payments")
          .update({
            checkout_id: result.data.reference,
            transaction_id: result.data.access_code,
          })
          .eq("id", paymentId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          authorizationUrl: result.data.authorization_url,
          accessCode: result.data.access_code,
          reference: result.data.reference,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: result.message || "Failed to initialize Paystack transaction",
        result,
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
