import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: settingsData } = await supabase
      .from("site_settings")
      .select("key, value")
      .eq("key", "paystack_secret_key");

    const secretKey = settingsData?.[0]?.value || Deno.env.get("PAYSTACK_SECRET_KEY") || "";

    // If secretKey is available, verify HMAC SHA512 signature
    if (secretKey && signature) {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(secretKey);
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-512" },
        false,
        ["sign"]
      );
      const signatureBytes = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(rawBody));
      const expectedSignature = Array.from(new Uint8Array(signatureBytes))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (expectedSignature !== signature) {
        return new Response("Invalid signature", { status: 400 });
      }
    }

    const payload = JSON.parse(rawBody);

    if (payload.event === "charge.success") {
      const { reference, id: transactionId, channel } = payload.data || {};

      if (reference) {
        await supabase
          .from("payments")
          .update({
            status: "paid",
            transaction_id: String(transactionId),
            payment_channel: channel || "paystack",
            updated_at: new Date().toISOString(),
          })
          .eq("client_reference", reference);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Error" }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
