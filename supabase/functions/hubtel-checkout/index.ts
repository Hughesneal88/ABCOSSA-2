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
    const { paymentId, clientReference, amount, customerName, customerEmail, customerPhone, description } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Fetch dynamic Hubtel Merchant settings from site_settings table
    const { data: settingsData } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["hubtel_merchant_account_number", "hubtel_client_id", "hubtel_client_secret"]);

    const settingsMap = Object.fromEntries((settingsData || []).map((r: { key: string; value: string }) => [r.key, r.value]));

    const merchantNo = settingsMap["hubtel_merchant_account_number"] || Deno.env.get("HUBTEL_MERCHANT_ACCOUNT_NUMBER") || "2019842";
    const clientId = settingsMap["hubtel_client_id"] || Deno.env.get("HUBTEL_CLIENT_ID") || "";
    const clientSecret = settingsMap["hubtel_client_secret"] || Deno.env.get("HUBTEL_CLIENT_SECRET") || "";

    if (!clientId || !clientSecret) {
      // Return simulated success URL when API credentials are not yet set
      return new Response(
        JSON.stringify({
          success: true,
          message: "Hubtel payment record generated. Set Client ID and Secret in Staff Portal for live API redirect.",
          clientReference,
          merchantNo,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Hubtel Online Checkout Invoice API
    const authHeader = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
    const hubtelRes = await fetch("https://api-merchant.hubtel.com/v1/merchantaccount/onlinecheckout/invoice/create", {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        invoice: {
          totalAmount: amount,
          description: description || "ABCOSSA Payment",
        },
        store: {
          name: "ABCOSSA",
        },
        actions: {
          cancelUrl: `${req.headers.get("origin") || "https://abcossa.org"}/payments/cancel`,
          returnUrl: `${req.headers.get("origin") || "https://abcossa.org"}/payments/success`,
        },
        customData: {
          paymentId,
          clientReference,
        },
      }),
    });

    const result = await hubtelRes.json();

    if (result.responseCode === "00" && result.data?.checkoutUrl) {
      await supabase
        .from("payments")
        .update({ checkout_id: result.data.checkoutId })
        .eq("id", paymentId);

      return new Response(
        JSON.stringify({ success: true, checkoutUrl: result.data.checkoutUrl, checkoutId: result.data.checkoutId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: result.message || "Failed to create Hubtel invoice", result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
