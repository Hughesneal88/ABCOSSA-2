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
    console.log("Hubtel USSD received payload:", JSON.stringify(body));

    // =========================================================================
    // 1. Hubtel Programmable USSD Interactive Session Handler
    // =========================================================================
    if (body.SessionId && body.Type) {
      const sessionId = body.SessionId;
      const sessionType = body.Type; // "Initiation" | "Response" | "Release" | "Timeout"
      const message = String(body.Message || "").trim();
      const mobile = String(body.Mobile || body.PhoneNumber || "Unknown");
      const clientState = String(body.ClientState || "").trim();

      // Step 1: Initial dial (*713#)
      if (sessionType === "Initiation" || !clientState || clientState === "START") {
        return new Response(
          JSON.stringify({
            SessionId: sessionId,
            Type: "Response",
            Message: "Welcome to ABCOSSA Awards 2026!\n\nEnter Candidate Code (e.g. 101):",
            Label: "Candidate Code",
            DataType: "input",
            ClientState: "ENTER_CODE",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Step 2: User entered Candidate Code -> Prompt for vote count
      if (clientState === "ENTER_CODE") {
        const candidateCode = message;
        // Look up nominee
        const { data: nominee, error: nomErr } = await supabase
          .from("nominees")
          .select("id, name, nominee_code")
          .or(`nominee_code.eq.${candidateCode},id.eq.${candidateCode}`)
          .maybeSingle();

        if (nomErr || !nominee) {
          return new Response(
            JSON.stringify({
              SessionId: sessionId,
              Type: "Response",
              Message: `Invalid Code "${candidateCode}".\n\nPlease enter a valid Candidate Code:`,
              Label: "Candidate Code",
              DataType: "input",
              ClientState: "ENTER_CODE",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Fetch vote price
        const { data: priceSetting } = await supabase
          .from("site_settings")
          .select("value")
          .eq("key", "vote_price_ghs")
          .maybeSingle();
        const unitPrice = priceSetting?.value ? parseFloat(priceSetting.value) : 1.0;

        return new Response(
          JSON.stringify({
            SessionId: sessionId,
            Type: "Response",
            Message: `Voting for ${nominee.name}\nPrice: GH₵ ${unitPrice.toFixed(2)} / vote\n\nEnter number of votes:`,
            Label: "Number of Votes",
            DataType: "input",
            ClientState: `CONFIRM_${nominee.id}_${nominee.nominee_code || candidateCode}`,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Step 3: User entered number of votes -> Complete & trigger prompt
      if (clientState.startsWith("CONFIRM_")) {
        const parts = clientState.split("_");
        const nomineeId = parts[1];
        const nomineeCode = parts[2] || "";
        const voteCount = Math.max(1, parseInt(message, 10) || 1);

        const { data: nominee } = await supabase
          .from("nominees")
          .select("id, name, votes_count")
          .eq("id", nomineeId)
          .maybeSingle();

        if (nominee) {
          const newVotes = (nominee.votes_count || 0) + voteCount;
          await supabase.from("nominees").update({ votes_count: newVotes }).eq("id", nominee.id);

          await supabase.from("payments").insert({
            client_reference: `hubtel_ussd_${sessionId}`,
            transaction_id: `hubtel_${Date.now()}`,
            amount: voteCount * 1.0,
            currency: "GHS",
            customer_name: `USSD Voter (${mobile})`,
            customer_email: "ussd-voting@abcossa.org",
            customer_phone: mobile,
            payment_type: "voting",
            status: "paid",
            payment_channel: "ussd-hubtel",
            description: `Hubtel USSD Vote for ${nominee.name} (${voteCount} vote${voteCount > 1 ? "s" : ""})`,
            metadata: {
              nominee_id: nominee.id,
              nominee_code: nomineeCode,
              nominee_name: nominee.name,
              votes_count: voteCount,
              gateway: "hubtel",
              session_id: sessionId,
            },
          });

          return new Response(
            JSON.stringify({
              SessionId: sessionId,
              Type: "Release",
              Message: `Thank you! You have successfully cast ${voteCount} vote(s) for ${nominee.name}.\n\nABCOSSA 2026.`,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Fallback release
      return new Response(
        JSON.stringify({
          SessionId: sessionId,
          Type: "Release",
          Message: "Thank you for using ABCOSSA USSD Voting.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // 2. Hubtel Payment Notification / Transaction Callback
    // =========================================================================
    const candidateCode = String(
      body.nominee_code ||
      body.candidate_code ||
      body.nomineeCode ||
      body.code ||
      body.CustomData?.nominee_code ||
      body.Data?.CustomData?.nominee_code ||
      ""
    ).trim();

    const votesToAdd = Math.max(
      1,
      parseInt(
        String(
          body.votes ||
          body.number_of_votes ||
          body.quantity ||
          body.CustomData?.votes_count ||
          body.Data?.CustomData?.votes_count ||
          "1"
        ),
        10
      ) || 1
    );

    const amountPaid = parseFloat(String(body.Amount || body.amount || body.total_amount || "0")) || 0;
    const customerPhone = String(
      body.CustomerPhoneNumber || body.CustomerMobile || body.phone || body.phone_number || "USSD Voter"
    ).trim();
    const customerName = String(
      body.CustomerName || body.name || `USSD Voter (${customerPhone})`
    ).trim();
    const transactionRef = String(
      body.ClientReference || body.TransactionId || body.transaction_id || `hubtel_${Date.now()}`
    ).trim();

    if (!candidateCode) {
      return new Response(
        JSON.stringify({ error: "Missing nominee code in callback payload" }),
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
      payment_channel: "ussd-hubtel",
      description: `Hubtel USSD Vote for ${nominee.name} (${votesToAdd} vote${votesToAdd > 1 ? "s" : ""})`,
      metadata: {
        nominee_id: nominee.id,
        nominee_code: candidateCode,
        nominee_name: nominee.name,
        votes_count: votesToAdd,
        gateway: "hubtel",
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
    console.error("Error processing Hubtel USSD webhook:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
