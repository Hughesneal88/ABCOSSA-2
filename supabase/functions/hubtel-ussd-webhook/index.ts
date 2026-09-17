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

        // Fetch bulk voting config
        const { data: bulkRows } = await supabase
          .from("site_settings")
          .select("key, value")
          .in("key", ["bulk_voting_enabled", "bulk_voting_packages", "bulk_voting_start", "bulk_voting_end"]);
        const bulkMap = Object.fromEntries((bulkRows || []).map((r: any) => [r.key, r.value]));
        const bulkEnabled = bulkMap["bulk_voting_enabled"] === "true";
        let bulkPkgs: { amount_ghs: number; votes: number }[] = [];
        try { bulkPkgs = bulkMap["bulk_voting_packages"] ? JSON.parse(bulkMap["bulk_voting_packages"]) : []; } catch { bulkPkgs = []; }
        const isBulkActive = bulkEnabled && bulkPkgs.length > 0
          && (!bulkMap["bulk_voting_start"] || new Date() >= new Date(bulkMap["bulk_voting_start"]))
          && (!bulkMap["bulk_voting_end"] || new Date() <= new Date(bulkMap["bulk_voting_end"]));

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
          // FIX: Record payment as PENDING — votes are ONLY credited when payment is confirmed
          // DO NOT increment votes here! Votes are credited via webhook callback.
          // Calculate effective price (bulk package if active, otherwise standard)
          let effectiveAmount = voteCount * unitPrice;
          if (isBulkActive) {
            const match = bulkPkgs.find(p => p.votes === voteCount);
            if (match) effectiveAmount = match.amount_ghs;
          }

          const trxRef = `hubtel_ussd_${sessionId}_${Date.now()}`;
          await supabase.from("payments").insert({
            client_reference: trxRef,
            transaction_id: `hubtel_${Date.now()}`,
            amount: effectiveAmount,
            currency: "GHS",
            customer_name: `USSD Voter (${mobile})`,
            customer_email: "ussd-voting@abcossa.org",
            customer_phone: mobile,
            payment_type: "voting",
            status: "pending",
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
              Message: `Your vote for ${nominee.name} (${voteCount} vote(s)) has been submitted. Payment is being processed.`,
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

    // FIX: Record payment entry and use atomic RPC to credit votes
    const { data: insertedPayment } = await supabase.from("payments").insert({
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
    }).select("id").maybeSingle();

    // Use atomic RPC to credit votes — prevents double-crediting
    if (insertedPayment?.id) {
      const { data: newCount } = await supabase.rpc("credit_votes_atomic", {
        p_payment_id: insertedPayment.id,
        p_nominee_id: nominee.id,
        p_votes_count: votesToAdd,
      });
      if (newCount !== null) {
        console.log(`Hubtel callback: Credited ${votesToAdd} votes to nominee ${nominee.id}. New total: ${newCount}`);
        return new Response(
          JSON.stringify({
            status: "success",
            message: `Successfully credited ${votesToAdd} vote(s) to ${nominee.name}. New total: ${newCount}`,
            nominee_id: nominee.id,
            total_votes: newCount,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        message: `Vote payment recorded for ${nominee.name}. Votes will be credited upon verification.`,
        nominee_id: nominee.id,
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
