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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    console.log("Arkesel USSD webhook received payload:", JSON.stringify(body));

    // Handle standard Arkesel USSD voting callback fields
    const candidateCode = String(
      body.nominee_code ||
      body.candidate_code ||
      body.nomineeCode ||
      body.code ||
      body.candidate_id ||
      ""
    ).trim();

    const votesToAdd = Math.max(
      1,
      parseInt(String(body.votes || body.number_of_votes || body.quantity || body.vote_count || "1"), 10) || 1
    );

    const amountPaid = parseFloat(String(body.amount || body.total_amount || "0")) || 0;
    const customerPhone = String(body.phone || body.phone_number || body.msisdn || body.customer_phone || "USSD Voter").trim();
    const customerName = String(body.customer_name || body.name || `USSD Voter (${customerPhone})`).trim();
    const transactionRef = String(body.transaction_id || body.reference || body.trxref || `arkesel_${Date.now()}`).trim();

    if (!candidateCode) {
      return new Response(
        JSON.stringify({ error: "Missing nominee/candidate code in callback" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up nominee by nominee_code or ID
    let query = supabase.from("nominees").select("id, name, votes_count, category_id");
    if (candidateCode.includes("-") && candidateCode.length > 20) {
      query = query.eq("id", candidateCode);
    } else {
      query = query.eq("nominee_code", candidateCode);
    }

    const { data: nominee, error: findErr } = await query.maybeSingle();

    if (findErr || !nominee) {
      console.warn(`Nominee with code "${candidateCode}" not found in database.`);
      return new Response(
        JSON.stringify({ error: `Nominee code ${candidateCode} not found` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Increment votes count
    const newVotes = (nominee.votes_count || 0) + votesToAdd;
    const { error: updateErr } = await supabase
      .from("nominees")
      .update({ votes_count: newVotes })
      .eq("id", nominee.id);

    if (updateErr) {
      console.error("Failed to update nominee votes count:", updateErr);
      throw updateErr;
    }

    // Record payment entry in payments table
    await supabase.from("payments").insert({
      client_reference: transactionRef,
      transaction_id: transactionRef,
      amount: amountPaid,
      currency: "GHS",
      customer_name: customerName,
      customer_email: "ussd-voting@abcossa.org",
      customer_phone: customerPhone,
      payment_type: "voting",
      status: "paid",
      payment_channel: "ussd-arkesel",
      description: `USSD Vote for ${nominee.name} (${votesToAdd} vote${votesToAdd > 1 ? "s" : ""})`,
      metadata: {
        nominee_id: nominee.id,
        nominee_code: candidateCode,
        nominee_name: nominee.name,
        votes_count: votesToAdd,
        gateway: "arkesel",
        raw_payload: body,
      },
    });

    return new Response(
      JSON.stringify({
        status: "success",
        message: `Successfully credited ${votesToAdd} vote(s) to ${nominee.name}. New total: ${newVotes}`,
        nominee_id: nominee.id,
        total_votes: newVotes,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing Arkesel USSD webhook:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
