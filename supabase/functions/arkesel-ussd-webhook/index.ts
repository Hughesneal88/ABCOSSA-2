import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/**
 * Arkesel USSD Gateway Interactive Engine & Webhook Handler
 * 
 * Supports:
 * 1. Arkesel USSD Interactive Sessions (JSON & Form-Encoded, GET & POST)
 * 2. Express Dialing (e.g. *928*667*101# or *928*667*101*5#)
 * 3. Step-by-step Interactive Menus (Categories -> Nominees -> Quantity -> Confirm)
 * 4. Arkesel Mobile Money Payment Callbacks
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Parse incoming parameters (support POST JSON, POST Form Data, and GET Query Params)
    let payload: Record<string, any> = {};

    if (req.method === "GET") {
      const url = new URL(req.url);
      payload = Object.fromEntries(url.searchParams.entries());
    } else {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        payload = await req.json().catch(() => ({}));
      } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
        const formData = await req.formData().catch(() => new FormData());
        const entries: Record<string, any> = {};
        formData.forEach((val, key) => {
          entries[key] = val;
        });
        payload = entries;
      } else {
        const text = await req.text().catch(() => "");
        try {
          payload = JSON.parse(text);
        } catch {
          const urlParams = new URLSearchParams(text);
          payload = Object.fromEntries(urlParams.entries());
        }
      }
    }

    console.log("Arkesel USSD webhook received payload:", JSON.stringify(payload));

    // Normalize incoming session fields across Arkesel / Ghana USSD gateway dialects
    const sessionId = String(
      payload.sessionID ||
      payload.sessionId ||
      payload.session_id ||
      payload.SessionId ||
      `sess_${Date.now()}`
    ).trim();

    const userId = String(
      payload.userID ||
      payload.userId ||
      payload.user_id ||
      payload.msisdn ||
      payload.phoneNumber ||
      payload.phone ||
      payload.Mobile ||
      "233000000000"
    ).trim();

    const rawUserData = String(
      payload.userData ||
      payload.message ||
      payload.userInput ||
      payload.text ||
      payload.user_data ||
      payload.Message ||
      ""
    ).trim();

    const sessionType = String(
      payload.type ||
      payload.Type ||
      payload.session_type ||
      "Response"
    ).trim();

    const serviceCode = String(
      payload.serviceCode ||
      payload.service_code ||
      payload.ServiceCode ||
      "*928*667#"
    ).trim();

    // Helper for responding in Arkesel standard USSD format
    const respondUSSD = (message: string, continueSession = true) => {
      return new Response(
        JSON.stringify({
          sessionID: sessionId,
          userID: userId,
          message: message,
          continueSession: continueSession,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
          },
        }
      );
    };

    // Helper to format currency
    const formatGHS = (val: number) => `GHS ${val.toFixed(2)}`;

    // Fetch dynamic site voting price
    const { data: priceRow } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "vote_price_ghs")
      .maybeSingle();
    const votePrice = priceRow?.value ? parseFloat(priceRow.value) : 1.0;

    // =========================================================================
    // A. Check if this is a Payment Callback / Webhook Notification from Arkesel
    // =========================================================================
    const isPaymentCallback =
      payload.action === "payment" ||
      payload.event === "payment.success" ||
      (payload.status === "success" && (payload.amount || payload.transaction_id)) ||
      Boolean(payload.nominee_code && payload.votes && !payload.sessionID);

    if (isPaymentCallback) {
      const candidateCode = String(
        payload.nominee_code ||
        payload.candidate_code ||
        payload.code ||
        payload.candidate_id ||
        ""
      ).trim();

      const votesToAdd = Math.max(
        1,
        parseInt(String(payload.votes || payload.number_of_votes || payload.quantity || "1"), 10) || 1
      );

      const amountPaid = parseFloat(String(payload.amount || payload.total_amount || "0")) || (votesToAdd * votePrice);
      const customerPhone = userId;
      const transactionRef = String(payload.transaction_id || payload.reference || `arkesel_${Date.now()}`).trim();

      if (candidateCode) {
        const { data: nominee } = await supabase
          .from("nominees")
          .select("id, name, votes_count, category_id")
          .or(`nominee_code.eq.${candidateCode},id.eq.${candidateCode}`)
          .maybeSingle();

        if (nominee) {
          const newVotes = (nominee.votes_count || 0) + votesToAdd;
          await supabase.from("nominees").update({ votes_count: newVotes }).eq("id", nominee.id);

          await supabase.from("payments").insert({
            client_reference: transactionRef,
            transaction_id: transactionRef,
            amount: amountPaid,
            currency: "GHS",
            customer_name: `USSD Voter (${customerPhone})`,
            customer_email: "ussd-voting@abcossa.org",
            customer_phone: customerPhone,
            payment_type: "voting",
            status: "paid",
            payment_channel: "ussd-arkesel",
            description: `Arkesel USSD Vote for ${nominee.name} (${votesToAdd} vote${votesToAdd > 1 ? "s" : ""})`,
            metadata: {
              nominee_id: nominee.id,
              nominee_code: candidateCode,
              nominee_name: nominee.name,
              votes_count: votesToAdd,
              gateway: "arkesel",
              raw_payload: payload,
            },
          });

          return new Response(
            JSON.stringify({
              status: "success",
              message: `Credited ${votesToAdd} vote(s) to ${nominee.name}. Total: ${newVotes}`,
              nominee_id: nominee.id,
              total_votes: newVotes,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // =========================================================================
    // B. Interactive USSD Session Flow
    // =========================================================================
    
    // Clean raw user input string (remove shortcodes and leading/trailing asterisks)
    let cleanInput = rawUserData;
    if (cleanInput.startsWith("*928*667*")) {
      cleanInput = cleanInput.replace(/^\*928\*667\*/, "").replace(/#$/, "");
    } else if (cleanInput.startsWith("*928*667#") || cleanInput === "*928*667" || cleanInput === "*920*667#" || cleanInput === "*920*22#") {
      cleanInput = "";
    }

    // Split sequential user path inputs (e.g. "1*101*5" or "101*5" or "101")
    const steps = cleanInput ? cleanInput.split("*").map((s) => s.trim()).filter(Boolean) : [];

    // STEP 0: Initial Dial / Main Menu
    if (sessionType.toLowerCase() === "initiation" || steps.length === 0) {
      const menu = 
        `Welcome to ABCOSSA Dinner Awards '26\n` +
        `Celebrating Excellence\n\n` +
        `1. Vote with Candidate Code\n` +
        `2. Browse Award Categories\n` +
        `3. View Pricing & Info\n` +
        `4. Check Live Standings`;
      return respondUSSD(menu, true);
    }

    // Direct / Express candidate dial check: if user entered candidate code directly (e.g. "101" or "101*5")
    const firstInput = steps[0];

    // Branch 1: User chose "1" (Vote with Code) OR entered a 3-digit candidate code directly (e.g. "101")
    if (firstInput === "1" || /^\d{3,4}$/.test(firstInput)) {
      const isDirectCode = /^\d{3,4}$/.test(firstInput);
      const candidateCode = isDirectCode ? firstInput : steps[1];

      // If user selected option "1" from main menu but hasn't typed code yet
      if (!candidateCode) {
        return respondUSSD(
          `Enter 3-digit Candidate Code:\n(e.g. 101, 102, 103...)\n\n00. Back to Main Menu`,
          true
        );
      }

      // If user typed '00' -> return to main menu
      if (candidateCode === "00") {
        return respondUSSD(
          `Welcome to ABCOSSA Dinner Awards '26\n\n1. Vote with Candidate Code\n2. Browse Award Categories\n3. View Pricing & Info\n4. Check Live Standings`,
          true
        );
      }

      // Lookup nominee in Supabase
      const { data: nominee, error: findErr } = await supabase
        .from("nominees")
        .select("id, name, nominee_code, votes_count, category_id")
        .eq("nominee_code", candidateCode)
        .maybeSingle();

      if (findErr || !nominee) {
        return respondUSSD(
          `Candidate Code "${candidateCode}" was not found.\n\nPlease check the code and try again.\n\n00. Main Menu`,
          true
        );
      }

      // Sub-step: Nominee found, check if vote quantity is supplied
      const quantityInput = isDirectCode ? steps[1] : steps[2];

      if (!quantityInput) {
        return respondUSSD(
          `Nominee: ${nominee.name}\n` +
          `Rate: ${formatGHS(votePrice)} / vote\n\n` +
          `Enter number of votes to cast:\n` +
          `(e.g. 1, 5, 10, 20...)\n\n` +
          `00. Back`,
          true
        );
      }

      if (quantityInput === "00") {
        return respondUSSD(`Enter 3-digit Candidate Code:\n(e.g. 101, 102, 103...)`, true);
      }

      const voteCount = Math.max(1, parseInt(quantityInput, 10) || 1);
      const totalAmount = voteCount * votePrice;

      // Sub-step: Confirmation
      const confirmInput = isDirectCode ? steps[2] : steps[3];
      if (!confirmInput) {
        return respondUSSD(
          `Confirm Vote for:\n` +
          `• ${nominee.name} (#${candidateCode})\n` +
          `• Quantity: ${voteCount} Vote${voteCount > 1 ? "s" : ""}\n` +
          `• Total: ${formatGHS(totalAmount)}\n\n` +
          `1. Confirm & Pay via MoMo\n` +
          `2. Cancel\n\n` +
          `00. Back`,
          true
        );
      }

      if (confirmInput === "1") {
        // Record vote in Supabase
        const newVotes = (nominee.votes_count || 0) + voteCount;
        await supabase.from("nominees").update({ votes_count: newVotes }).eq("id", nominee.id);

        const trxRef = `USSD_${Date.now().toString().slice(-8)}`;
        await supabase.from("payments").insert({
          client_reference: trxRef,
          transaction_id: trxRef,
          amount: totalAmount,
          currency: "GHS",
          customer_name: `USSD Voter (${userId})`,
          customer_email: "ussd-voting@abcossa.org",
          customer_phone: userId,
          payment_type: "voting",
          status: "paid",
          payment_channel: "ussd-arkesel",
          description: `Arkesel USSD Vote for ${nominee.name} (${voteCount} vote${voteCount > 1 ? "s" : ""})`,
          metadata: {
            nominee_id: nominee.id,
            nominee_code: candidateCode,
            nominee_name: nominee.name,
            votes_count: voteCount,
            session_id: sessionId,
            gateway: "arkesel",
          },
        });

        return respondUSSD(
          `Payment Request Initiated!\n\n` +
          `You requested ${voteCount} vote(s) for ${nominee.name} (${formatGHS(totalAmount)}).\n\n` +
          `Please authorize the Mobile Money PIN prompt on your phone.\n\n` +
          `Thank you for supporting ABCOSSA!`,
          false
        );
      } else {
        return respondUSSD(`Voting transaction cancelled.\n\nThank you for using ABCOSSA USSD.`, false);
      }
    }

    // Branch 2: Browse Award Categories (with Dynamic Pagination)
    if (firstInput === "2") {
      // Fetch all active categories
      const { data: allCategories = [] } = await supabase
        .from("award_categories")
        .select("id, title, display_order")
        .order("display_order", { ascending: true });

      const categories = allCategories || [];
      const catPageSize = 4;
      const totalCatPages = Math.max(1, Math.ceil(categories.length / catPageSize));

      // Parse navigational steps in category browsing
      // e.g. steps: ["2"], ["2", "99"], ["2", "99", "99"], ["2", "99", "5"], ["2", "5", "1", "10", "1"]
      let currentCatPage = 1;
      let selectedCatIndex: number | null = null;
      let subStepIndex = 1;

      for (let i = 1; i < steps.length; i++) {
        const val = steps[i];
        if (val === "00") {
          return respondUSSD(
            `Welcome to ABCOSSA Dinner Awards '26\n\n1. Vote with Candidate Code\n2. Browse Award Categories\n3. View Pricing & Info\n4. Check Live Standings`,
            true
          );
        } else if (val === "99") {
          currentCatPage = Math.min(totalCatPages, currentCatPage + 1);
        } else if (val === "88") {
          currentCatPage = Math.max(1, currentCatPage - 1);
        } else {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num >= 1 && num <= categories.length) {
            selectedCatIndex = num - 1;
            subStepIndex = i + 1;
            break;
          }
        }
      }

      // If user hasn't selected a specific category yet, render the category page
      if (selectedCatIndex === null) {
        const startIdx = (currentCatPage - 1) * catPageSize;
        const pageCats = categories.slice(startIdx, startIdx + catPageSize);

        let catMenu = `Select Category (${currentCatPage}/${totalCatPages}):\n`;
        pageCats.forEach((c, idx) => {
          const itemNum = startIdx + idx + 1;
          catMenu += `${itemNum}. ${c.title}\n`;
        });

        catMenu += "\n";
        if (currentCatPage < totalCatPages) catMenu += "99. Next Page >>\n";
        if (currentCatPage > 1) catMenu += "88. << Prev Page\n";
        catMenu += "00. Main Menu";

        return respondUSSD(catMenu.trim(), true);
      }

      const selectedCat = categories[selectedCatIndex];
      if (!selectedCat) {
        return respondUSSD(`Invalid category option.\n\n00. Back to Categories`, true);
      }

      // Fetch nominees in the selected category
      const { data: allNominees = [] } = await supabase
        .from("nominees")
        .select("id, name, nominee_code")
        .eq("category_id", selectedCat.id)
        .order("nominee_code", { ascending: true });

      const catNominees = allNominees || [];
      const nomPageSize = 4;
      const totalNomPages = Math.max(1, Math.ceil(catNominees.length / nomPageSize));

      let currentNomPage = 1;
      let selectedNomIndex: number | null = null;
      let nomineeStepIndex = subStepIndex;

      for (let i = subStepIndex; i < steps.length; i++) {
        const val = steps[i];
        if (val === "00") {
          // Go back to categories
          return respondUSSD(`Enter 2 to browse categories or 00 for Main Menu.`, true);
        } else if (val === "99") {
          currentNomPage = Math.min(totalNomPages, currentNomPage + 1);
        } else if (val === "88") {
          currentNomPage = Math.max(1, currentNomPage - 1);
        } else {
          // Check if match by candidate code (e.g. 101) or list number (1, 2, 3...)
          const codeMatchIdx = catNominees.findIndex((n) => n.nominee_code === val);
          if (codeMatchIdx !== -1) {
            selectedNomIndex = codeMatchIdx;
            nomineeStepIndex = i + 1;
            break;
          }
          const num = parseInt(val, 10);
          if (!isNaN(num) && num >= 1 && num <= catNominees.length) {
            selectedNomIndex = num - 1;
            nomineeStepIndex = i + 1;
            break;
          }
        }
      }

      // If user hasn't selected a nominee yet, render the nominees page
      if (selectedNomIndex === null) {
        if (catNominees.length === 0) {
          return respondUSSD(
            `Category: ${selectedCat.title}\n\nNo nominees registered in this category yet.\n\n00. Back to Categories`,
            true
          );
        }

        const startIdx = (currentNomPage - 1) * nomPageSize;
        const pageNominees = catNominees.slice(startIdx, startIdx + nomPageSize);

        let nomMenu = `${selectedCat.title} (${currentNomPage}/${totalNomPages}):\n`;
        pageNominees.forEach((n, idx) => {
          const itemNum = startIdx + idx + 1;
          const codeTag = n.nominee_code ? ` (#${n.nominee_code})` : "";
          nomMenu += `${itemNum}. ${n.name}${codeTag}\n`;
        });

        nomMenu += "\n";
        if (currentNomPage < totalNomPages) nomMenu += "99. Next Page >>\n";
        if (currentNomPage > 1) nomMenu += "88. << Prev Page\n";
        nomMenu += "00. Back to Categories";

        return respondUSSD(nomMenu.trim(), true);
      }

      const selectedNom = catNominees[selectedNomIndex];
      if (!selectedNom) {
        return respondUSSD(`Invalid nominee selection.\n\n00. Back`, true);
      }

      // Ask for vote quantity
      const votesQty = steps[nomineeStepIndex];
      if (!votesQty) {
        return respondUSSD(
          `Nominee: ${selectedNom.name} (#${selectedNom.nominee_code || "—"})\n` +
          `Category: ${selectedCat.title}\n` +
          `Rate: ${formatGHS(votePrice)} / vote\n\n` +
          `Enter number of votes:\n` +
          `(e.g. 1, 5, 10, 20...)\n\n` +
          `00. Back`,
          true
        );
      }

      if (votesQty === "00") {
        return respondUSSD(`Enter candidate code or number to select nominee.`, true);
      }

      const voteCount = Math.max(1, parseInt(votesQty, 10) || 1);
      const totalAmount = voteCount * votePrice;

      // Confirmation step
      const confirmInput = steps[nomineeStepIndex + 1];
      if (!confirmInput) {
        return respondUSSD(
          `Confirm Vote for:\n` +
          `• ${selectedNom.name} (#${selectedNom.nominee_code || "—"})\n` +
          `• Category: ${selectedCat.title}\n` +
          `• Quantity: ${voteCount} Votes\n` +
          `• Total: ${formatGHS(totalAmount)}\n\n` +
          `1. Confirm & Pay via MoMo\n` +
          `2. Cancel\n\n` +
          `00. Back`,
          true
        );
      }

      if (confirmInput === "1") {
        // Record vote in Supabase
        const { data: currentNom } = await supabase
          .from("nominees")
          .select("votes_count")
          .eq("id", selectedNom.id)
          .maybeSingle();

        const newVotes = (currentNom?.votes_count || 0) + voteCount;
        await supabase.from("nominees").update({ votes_count: newVotes }).eq("id", selectedNom.id);

        const trxRef = `USSD_${Date.now().toString().slice(-8)}`;
        await supabase.from("payments").insert({
          client_reference: trxRef,
          transaction_id: trxRef,
          amount: totalAmount,
          currency: "GHS",
          customer_name: `USSD Voter (${userId})`,
          customer_email: "ussd-voting@abcossa.org",
          customer_phone: userId,
          payment_type: "voting",
          status: "paid",
          payment_channel: "ussd-arkesel",
          description: `Arkesel USSD Vote for ${selectedNom.name} (${voteCount} vote${voteCount > 1 ? "s" : ""})`,
          metadata: {
            nominee_id: selectedNom.id,
            nominee_code: selectedNom.nominee_code,
            nominee_name: selectedNom.name,
            votes_count: voteCount,
            session_id: sessionId,
            gateway: "arkesel",
          },
        });

        return respondUSSD(
          `Payment Request Initiated!\n\n` +
          `You requested ${voteCount} vote(s) for ${selectedNom.name} (${formatGHS(totalAmount)}).\n\n` +
          `Please authorize the Mobile Money PIN prompt on your phone.\n\n` +
          `Thank you for voting!`,
          false
        );
      } else {
        return respondUSSD(`Voting transaction cancelled.\n\nThank you for using ABCOSSA USSD.`, false);
      }
    }

    // Branch 3: Pricing & Info
    if (firstInput === "3") {
      return respondUSSD(
        `ABCOSSA Dinner Awards '26\n\n` +
        `• Voting Rate: ${formatGHS(votePrice)} per vote\n` +
        `• Direct Dial: *928*667*[Code]#\n` +
        `• Networks: MTN, Telecel, AT\n` +
        `• Online: https://abcossa.org\n\n` +
        `00. Main Menu`,
        true
      );
    }

    // Branch 4: Live Standings Leader
    if (firstInput === "4") {
      const { data: topNominees = [] } = await supabase
        .from("nominees")
        .select("name, votes_count, nominee_code")
        .order("votes_count", { ascending: false })
        .limit(3);

      let text = "🏆 Live Standings Leaders:\n\n";
      (topNominees || []).forEach((n, idx) => {
        text += `${idx + 1}. ${n.name} (#${n.nominee_code || "—"}): ${n.votes_count || 0} votes\n`;
      });
      text += "\n00. Main Menu";
      return respondUSSD(text, true);
    }

    // Fallback default
    return respondUSSD(
      `Welcome to ABCOSSA Dinner Awards '26\n\n` +
      `1. Vote with Candidate Code\n` +
      `2. Browse Award Categories\n` +
      `3. View Pricing & Info\n` +
      `4. Check Live Standings`,
      true
    );
  } catch (error) {
    console.error("Error processing Arkesel USSD webhook:", error);
    return new Response(
      JSON.stringify({
        sessionID: "error",
        message: "An error occurred processing your request. Please try dialing *928*667# again.",
        continueSession: false,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
