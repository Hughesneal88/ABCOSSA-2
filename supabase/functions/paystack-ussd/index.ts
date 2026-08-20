import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Paystack Ghana USSD Session Handler
 * Specification: https://pilot-ussd-gh.d111ulzzlm5kvf.amplifyapp.com/docs/payments/ussd/
 * 
 * Paystack sends:
 * {
 *   "session": "PSK_ry7jkdo8jdhu8hs77wg",
 *   "message": "101",
 *   "phone": "+23312345678",
 *   "network_code": "MTN",
 *   "service_code": "*415*123#"
 * }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    console.log("Paystack USSD payload:", JSON.stringify(body));

    const session = String(body.session || `session_${Date.now()}`);
    const rawMessage = String(body.message || "").trim();
    const phone = String(body.phone || "Unknown");
    const networkCode = String(body.network_code || "Unknown");

    // Fetch active vote price
    const { data: priceSetting } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "vote_price_ghs")
      .maybeSingle();
    const unitPrice = priceSetting?.value ? parseFloat(priceSetting.value) : 1.0;

    // Split accumulated selections (Paystack passes inputs separated by * or current step)
    const inputs = rawMessage ? rawMessage.split("*").map((s) => s.trim()).filter(Boolean) : [];

    // Step 1: Initial dial with no input
    if (inputs.length === 0) {
      return new Response(
        JSON.stringify({
          message: "Welcome to ABCOSSA Awards 2026!\n\nEnter Candidate Code (e.g. 101):",
          type: "continue",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: User provided Candidate Code (e.g. "101")
    const candidateCode = inputs[0];
    const { data: nominee, error: nomErr } = await supabase
      .from("nominees")
      .select("id, name, nominee_code, votes_count")
      .or(`nominee_code.eq.${candidateCode},id.eq.${candidateCode}`)
      .maybeSingle();

    if (nomErr || !nominee) {
      return new Response(
        JSON.stringify({
          message: `Candidate "${candidateCode}" not found.\n\nPlease enter a valid Candidate Code:`,
          type: "continue",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If only candidate code provided -> prompt for number of votes
    if (inputs.length === 1) {
      return new Response(
        JSON.stringify({
          message: `Vote for ${nominee.name}\nPrice: GH₵ ${unitPrice.toFixed(2)}/vote\n\nEnter number of votes:`,
          type: "continue",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: User provided number of votes (e.g. "101*5" or step 2 input "5")
    const voteCount = Math.max(1, parseInt(inputs[1], 10) || 1);
    const totalAmount = voteCount * unitPrice;

    // Auto-credit votes
    const newVotes = (nominee.votes_count || 0) + voteCount;
    await supabase.from("nominees").update({ votes_count: newVotes }).eq("id", nominee.id);

    // Record transaction
    await supabase.from("payments").insert({
      client_reference: `paystack_ussd_${session}`,
      transaction_id: `psk_ussd_${Date.now()}`,
      amount: totalAmount,
      currency: "GHS",
      customer_name: `USSD Voter (${phone})`,
      customer_email: "ussd-voting@abcossa.org",
      customer_phone: phone,
      payment_type: "voting",
      status: "paid",
      payment_channel: `ussd-paystack-${networkCode.toLowerCase()}`,
      description: `Paystack USSD Vote for ${nominee.name} (${voteCount} vote${voteCount > 1 ? "s" : ""})`,
      metadata: {
        nominee_id: nominee.id,
        nominee_code: nominee.nominee_code || candidateCode,
        nominee_name: nominee.name,
        votes_count: voteCount,
        session,
        network_code: networkCode,
        gateway: "paystack_ussd",
      },
    });

    // Send charge action to Paystack
    return new Response(
      JSON.stringify({
        message: `Voting for ${nominee.name} (${voteCount} vote${voteCount > 1 ? "s" : ""}). Authorize payment of GH₵ ${totalAmount.toFixed(2)} on your phone.`,
        type: "charge",
        data: {
          amount: totalAmount,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Paystack USSD handler error:", error);
    return new Response(
      JSON.stringify({
        message: "An error occurred processing your USSD vote. Please try again later.",
        type: "end",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
