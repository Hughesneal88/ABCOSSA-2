import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface UssdSessionState {
  session_id: string;
  user_id: string;
  current_step: string;
  candidate_code?: string | null;
  nominee_id?: string | null;
  nominee_name?: string | null;
  category_id?: string | null;
  category_title?: string | null;
  category_page: number;
  nominee_page: number;
  quantity: number;
  metadata?: Record<string, any>;
}

// In-memory fallback cache in case ussd_sessions table is momentarily unreachable
const inMemorySessions = new Map<string, UssdSessionState>();

/**
 * Arkesel USSD Gateway Interactive Engine & Stateful Webhook Handler
 *
 * Handles:
 * 1. Step-by-Step Interactive Sessions (Arkesel sends single-turn input in each HTTP request)
 * 2. Express Dialing (e.g. *928*667*101# or *928*667*101*5#)
 * 3. Dynamic Category & Nominee Directory Browsing with Pagination (99. Next, 88. Prev, 00. Back)
 * 4. Automatic Mobile Money Payment Triggering & Webhook Callbacks
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

    console.log("Arkesel USSD received payload:", JSON.stringify(payload));

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

    // Helper for responding in Arkesel standard USSD format
    const respondUSSD = async (message: string, continueSession = true, nextState?: Partial<UssdSessionState>) => {
      // If nextState is provided, update the session in Supabase & memory
      if (nextState) {
        const updatedState: UssdSessionState = {
          session_id: sessionId,
          user_id: userId,
          current_step: nextState.current_step || "MAIN_MENU",
          candidate_code: nextState.candidate_code ?? null,
          nominee_id: nextState.nominee_id ?? null,
          nominee_name: nextState.nominee_name ?? null,
          category_id: nextState.category_id ?? null,
          category_title: nextState.category_title ?? null,
          category_page: nextState.category_page ?? 1,
          nominee_page: nextState.nominee_page ?? 1,
          quantity: nextState.quantity ?? 1,
          metadata: nextState.metadata ?? {},
        };

        inMemorySessions.set(sessionId, updatedState);

        try {
          await supabase.from("ussd_sessions").upsert(
            {
              ...updatedState,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "session_id" }
          );
        } catch (e) {
          console.warn("Could not upsert ussd_session:", e);
        }
      }

      // If session is closing (continueSession: false), clean up state
      if (!continueSession) {
        inMemorySessions.delete(sessionId);
        try {
          await supabase.from("ussd_sessions").delete().eq("session_id", sessionId);
        } catch (_) {}
      }

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
    // A. Payment Callback / Webhook Notification from Arkesel
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
    // B. Interactive USSD Session Flow & State Machine
    // =========================================================================

    // If user hung up or timed out
    if (sessionType.toLowerCase() === "release" || sessionType.toLowerCase() === "timeout") {
      inMemorySessions.delete(sessionId);
      try {
        await supabase.from("ussd_sessions").delete().eq("session_id", sessionId);
      } catch (_) {}
      return respondUSSD("Session ended", false);
    }

    // Clean user input
    let cleanInput = rawUserData;
    if (cleanInput.startsWith("*928*667*")) {
      cleanInput = cleanInput.replace(/^\*928\*667\*/, "").replace(/#$/, "");
    } else if (
      cleanInput.startsWith("*928*667#") ||
      cleanInput === "*928*667" ||
      cleanInput === "*920*667#" ||
      cleanInput === "*920*22#"
    ) {
      cleanInput = "";
    }

    // Load active session state from database / memory
    let sessionState: UssdSessionState | null = inMemorySessions.get(sessionId) || null;
    if (!sessionState) {
      try {
        const { data: dbSession } = await supabase
          .from("ussd_sessions")
          .select("*")
          .eq("session_id", sessionId)
          .maybeSingle();

        if (dbSession) {
          sessionState = dbSession as UssdSessionState;
          inMemorySessions.set(sessionId, sessionState);
        }
      } catch (_) {}
    }

    // Default main menu text
    const renderMainMenu = async () => {
      const menuText =
        "Welcome to ABCOSSA Dinner Awards '26\n" +
        "Celebrating Excellence\n\n" +
        "1. Vote with Candidate Code\n" +
        "2. Browse Award Categories\n" +
        "3. View Pricing & Info\n" +
        "4. Check Live Standings";

      return respondUSSD(menuText, true, {
        current_step: "MAIN_MENU",
        candidate_code: null,
        nominee_id: null,
        nominee_name: null,
        quantity: 1,
      });
    };

    // -------------------------------------------------------------------------
    // Shortcut / Fast-Dial Check (e.g. *928*667*101# or *928*667*101*5#)
    // -------------------------------------------------------------------------
    if (cleanInput.includes("*")) {
      const parts = cleanInput.split("*").map((s) => s.trim()).filter(Boolean);
      // Fast candidate code
      const candidateCode = parts[0] === "1" ? parts[1] : parts[0];
      const qtyStr = parts[0] === "1" ? parts[2] : parts[1];

      if (candidateCode) {
        const { data: nominee } = await supabase
          .from("nominees")
          .select("id, name, nominee_code, category_id, votes_count")
          .eq("nominee_code", candidateCode)
          .maybeSingle();

        if (nominee) {
          if (!qtyStr) {
            // Prompt for votes
            return respondUSSD(
              `Nominee: ${nominee.name}\n` +
              `Rate: ${formatGHS(votePrice)} / vote\n\n` +
              `Enter number of votes to cast:\n` +
              `(e.g. 1, 5, 10, 20...)\n\n` +
              `00. Back`,
              true,
              {
                current_step: "ENTER_VOTES",
                candidate_code: nominee.nominee_code,
                nominee_id: nominee.id,
                nominee_name: nominee.name,
              }
            );
          } else {
            // Quantity provided in fast-dial -> prompt confirmation
            const voteCount = Math.max(1, parseInt(qtyStr, 10) || 1);
            const totalAmount = voteCount * votePrice;

            return respondUSSD(
              `Confirm Vote for:\n` +
              `• ${nominee.name} (#${candidateCode})\n` +
              `• Quantity: ${voteCount} Vote${voteCount > 1 ? "s" : ""}\n` +
              `• Total Amount: ${formatGHS(totalAmount)}\n\n` +
              `1. Confirm & Pay via MoMo\n` +
              `2. Cancel\n\n` +
              `00. Back`,
              true,
              {
                current_step: "CONFIRM_VOTE",
                candidate_code: nominee.nominee_code,
                nominee_id: nominee.id,
                nominee_name: nominee.name,
                quantity: voteCount,
              }
            );
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // Step 0: Session Initiation (First dial into *928*667#)
    // -------------------------------------------------------------------------
    if (sessionType.toLowerCase() === "initiation" || !cleanInput || !sessionState) {
      // If user directly entered a 3-digit candidate code on first dial
      if (/^\d{3,4}$/.test(cleanInput)) {
        const { data: nominee } = await supabase
          .from("nominees")
          .select("id, name, nominee_code, category_id, votes_count")
          .eq("nominee_code", cleanInput)
          .maybeSingle();

        if (nominee) {
          return respondUSSD(
            `Nominee: ${nominee.name}\n` +
            `Rate: ${formatGHS(votePrice)} / vote\n\n` +
            `Enter number of votes to cast:\n` +
            `(e.g. 1, 5, 10, 20...)\n\n` +
            `00. Back`,
            true,
            {
              current_step: "ENTER_VOTES",
              candidate_code: nominee.nominee_code,
              nominee_id: nominee.id,
              nominee_name: nominee.name,
            }
          );
        }
      }

      return renderMainMenu();
    }

    const currentStep = sessionState.current_step;
    const userInput = cleanInput;

    // Global back to main menu
    if (userInput === "00" && (currentStep === "ENTER_CODE" || currentStep === "BROWSE_CATEGORIES" || currentStep === "INFO" || currentStep === "STANDINGS")) {
      return renderMainMenu();
    }

    // =========================================================================
    // Step 1: MAIN_MENU Selection
    // =========================================================================
    if (currentStep === "MAIN_MENU") {
      if (userInput === "1") {
        return respondUSSD(
          "Enter 3-digit Candidate Code:\n(e.g. 101, 102, 103...)\n\n00. Back to Main Menu",
          true,
          {
            ...sessionState,
            current_step: "ENTER_CODE",
          }
        );
      }

      if (/^\d{3,4}$/.test(userInput)) {
        // Direct candidate code from menu
        const { data: nominee } = await supabase
          .from("nominees")
          .select("id, name, nominee_code, category_id, votes_count")
          .eq("nominee_code", userInput)
          .maybeSingle();

        if (nominee) {
          return respondUSSD(
            `Nominee: ${nominee.name}\n` +
            `Rate: ${formatGHS(votePrice)} / vote\n\n` +
            `Enter number of votes to cast:\n` +
            `(e.g. 1, 5, 10, 20...)\n\n` +
            `00. Back`,
            true,
            {
              ...sessionState,
              current_step: "ENTER_VOTES",
              candidate_code: nominee.nominee_code,
              nominee_id: nominee.id,
              nominee_name: nominee.name,
            }
          );
        } else {
          return respondUSSD(
            `Candidate Code "${userInput}" was not found.\n\nPlease enter a valid 3-digit code:\n\n00. Back`,
            true,
            {
              ...sessionState,
              current_step: "ENTER_CODE",
            }
          );
        }
      }

      if (userInput === "2") {
        // Browse Categories (Page 1)
        const { data: allCategories = [] } = await supabase
          .from("award_categories")
          .select("id, title, display_order")
          .eq("is_active", true)
          .order("display_order", { ascending: true });

        const categories = allCategories || [];
        const catPageSize = 4;
        const totalCatPages = Math.max(1, Math.ceil(categories.length / catPageSize));
        const pageCats = categories.slice(0, catPageSize);

        let catMenu = `Select Category (1/${totalCatPages}):\n`;
        pageCats.forEach((c, idx) => {
          catMenu += `${idx + 1}. ${c.title}\n`;
        });
        catMenu += "\n";
        if (totalCatPages > 1) catMenu += "99. Next Page >>\n";
        catMenu += "00. Main Menu";

        return respondUSSD(catMenu.trim(), true, {
          ...sessionState,
          current_step: "BROWSE_CATEGORIES",
          category_page: 1,
        });
      }

      if (userInput === "3") {
        // Pricing & Info
        return respondUSSD(
          "ABCOSSA Dinner Awards '26\n\n" +
          `• Rate: ${formatGHS(votePrice)} per vote\n` +
          "• Networks: MTN, Telecel, AT\n" +
          "• Fast Dial: *928*667*Code#\n" +
          "• Portal: https://abcossa.org\n\n" +
          "00. Main Menu",
          true,
          {
            ...sessionState,
            current_step: "INFO",
          }
        );
      }

      if (userInput === "4") {
        // Top 4 Standings
        const { data: topNominees = [] } = await supabase
          .from("nominees")
          .select("name, votes_count, nominee_code")
          .eq("is_published", true)
          .order("votes_count", { ascending: false })
          .limit(4);

        let standingsText = "Live Awards Standings:\n\n";
        topNominees.forEach((n, idx) => {
          standingsText += `${idx + 1}. ${n.name} (#${n.nominee_code}) - ${n.votes_count} votes\n`;
        });
        standingsText += "\n00. Main Menu";

        return respondUSSD(standingsText.trim(), true, {
          ...sessionState,
          current_step: "STANDINGS",
        });
      }

      // Default invalid input on main menu
      return renderMainMenu();
    }

    // =========================================================================
    // Step 2: ENTER_CODE (User is typing candidate code)
    // =========================================================================
    if (currentStep === "ENTER_CODE") {
      if (userInput === "00") {
        return renderMainMenu();
      }

      const candidateCode = userInput;
      const { data: nominee, error: findErr } = await supabase
        .from("nominees")
        .select("id, name, nominee_code, category_id, votes_count")
        .eq("nominee_code", candidateCode)
        .maybeSingle();

      if (findErr || !nominee) {
        return respondUSSD(
          `Candidate Code "${candidateCode}" not found.\n\nPlease check the code and try again (e.g. 101, 102...):\n\n00. Main Menu`,
          true,
          {
            ...sessionState,
            current_step: "ENTER_CODE",
          }
        );
      }

      // Nominee found -> Prompt for number of votes
      return respondUSSD(
        `Nominee: ${nominee.name}\n` +
        `Rate: ${formatGHS(votePrice)} / vote\n\n` +
        `Enter number of votes to cast:\n` +
        `(e.g. 1, 5, 10, 20...)\n\n` +
        `00. Back`,
        true,
        {
          ...sessionState,
          current_step: "ENTER_VOTES",
          candidate_code: nominee.nominee_code,
          nominee_id: nominee.id,
          nominee_name: nominee.name,
        }
      );
    }

    // =========================================================================
    // Step 3: ENTER_VOTES (User is typing number of votes)
    // =========================================================================
    if (currentStep === "ENTER_VOTES") {
      if (userInput === "00") {
        return respondUSSD(
          "Enter 3-digit Candidate Code:\n(e.g. 101, 102, 103...)\n\n00. Back to Main Menu",
          true,
          {
            ...sessionState,
            current_step: "ENTER_CODE",
          }
        );
      }

      const voteCount = parseInt(userInput, 10);
      if (isNaN(voteCount) || voteCount < 1) {
        return respondUSSD(
          "Please enter a valid number of votes (e.g. 1, 5, 10):\n\n00. Back",
          true,
          {
            ...sessionState,
            current_step: "ENTER_VOTES",
          }
        );
      }

      const totalAmount = voteCount * votePrice;
      const nomineeName = sessionState.nominee_name || "Selected Candidate";
      const code = sessionState.candidate_code || "";

      // Move to Confirmation step
      return respondUSSD(
        `Confirm Vote for:\n` +
        `• ${nomineeName} (#${code})\n` +
        `• Quantity: ${voteCount} Vote${voteCount > 1 ? "s" : ""}\n` +
        `• Total Amount: ${formatGHS(totalAmount)}\n\n` +
        `1. Confirm & Pay via MoMo\n` +
        `2. Cancel\n\n` +
        `00. Back`,
        true,
        {
          ...sessionState,
          current_step: "CONFIRM_VOTE",
          quantity: voteCount,
        }
      );
    }

    // =========================================================================
    // Step 4: CONFIRM_VOTE (User confirms payment)
    // =========================================================================
    if (currentStep === "CONFIRM_VOTE") {
      if (userInput === "00") {
        return respondUSSD(
          `Nominee: ${sessionState.nominee_name}\n` +
          `Rate: ${formatGHS(votePrice)} / vote\n\n` +
          `Enter number of votes to cast:\n` +
          `(e.g. 1, 5, 10, 20...)\n\n` +
          `00. Back`,
          true,
          {
            ...sessionState,
            current_step: "ENTER_VOTES",
          }
        );
      }

      if (userInput === "1") {
        const voteCount = sessionState.quantity || 1;
        const totalAmount = voteCount * votePrice;
        const nomineeId = sessionState.nominee_id;
        const candidateCode = sessionState.candidate_code || "";
        const nomineeName = sessionState.nominee_name || "Nominee";

        // Record votes & payment
        if (nomineeId) {
          const { data: nomRow } = await supabase
            .from("nominees")
            .select("votes_count")
            .eq("id", nomineeId)
            .maybeSingle();

          const newVotes = (nomRow?.votes_count || 0) + voteCount;
          await supabase.from("nominees").update({ votes_count: newVotes }).eq("id", nomineeId);
        }

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
          description: `Arkesel USSD Vote for ${nomineeName} (${voteCount} vote${voteCount > 1 ? "s" : ""})`,
          metadata: {
            nominee_id: nomineeId,
            nominee_code: candidateCode,
            nominee_name: nomineeName,
            votes_count: voteCount,
            session_id: sessionId,
            gateway: "arkesel",
          },
        });

        return respondUSSD(
          `Payment Request Sent!\n\n` +
          `You requested ${voteCount} vote(s) for ${nomineeName} (${formatGHS(totalAmount)}).\n\n` +
          `Please authorize the Mobile Money PIN prompt on your phone.\n\n` +
          `Thank you for supporting ABCOSSA!`,
          false
        );
      } else {
        return respondUSSD("Voting transaction cancelled.\n\nThank you for using ABCOSSA USSD.", false);
      }
    }

    // =========================================================================
    // Step 5: BROWSE_CATEGORIES (Directory Browsing)
    // =========================================================================
    if (currentStep === "BROWSE_CATEGORIES") {
      if (userInput === "00") {
        return renderMainMenu();
      }

      const { data: allCategories = [] } = await supabase
        .from("award_categories")
        .select("id, title, display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      const categories = allCategories || [];
      const catPageSize = 4;
      const totalCatPages = Math.max(1, Math.ceil(categories.length / catPageSize));
      let currentCatPage = sessionState.category_page || 1;

      if (userInput === "99") {
        currentCatPage = Math.min(totalCatPages, currentCatPage + 1);
      } else if (userInput === "88") {
        currentCatPage = Math.max(1, currentCatPage - 1);
      } else {
        const selectedNum = parseInt(userInput, 10);
        const startIdx = (currentCatPage - 1) * catPageSize;
        const selectedCat = categories[startIdx + (selectedNum - 1)] || categories[selectedNum - 1];

        if (selectedCat) {
          // Selected a valid category -> Fetch its nominees (Page 1)
          const { data: allNominees = [] } = await supabase
            .from("nominees")
            .select("id, name, nominee_code")
            .eq("category_id", selectedCat.id)
            .eq("is_published", true)
            .order("nominee_code", { ascending: true });

          const catNominees = allNominees || [];
          const nomPageSize = 4;
          const totalNomPages = Math.max(1, Math.ceil(catNominees.length / nomPageSize));

          if (catNominees.length === 0) {
            return respondUSSD(
              `No nominees currently registered in "${selectedCat.title}".\n\n00. Back to Categories`,
              true,
              {
                ...sessionState,
                current_step: "BROWSE_CATEGORIES",
              }
            );
          }

          const pageNominees = catNominees.slice(0, nomPageSize);
          let nomMenu = `${selectedCat.title} (1/${totalNomPages}):\n`;
          pageNominees.forEach((n, idx) => {
            nomMenu += `${idx + 1}. ${n.name} (#${n.nominee_code})\n`;
          });
          nomMenu += "\n";
          if (totalNomPages > 1) nomMenu += "99. Next Page >>\n";
          nomMenu += "00. Back to Categories";

          return respondUSSD(nomMenu.trim(), true, {
            ...sessionState,
            current_step: "BROWSE_NOMINEES",
            category_id: selectedCat.id,
            category_title: selectedCat.title,
            nominee_page: 1,
          });
        }
      }

      // Re-render categories page after 99 / 88 navigation
      const startIdx = (currentCatPage - 1) * catPageSize;
      const pageCats = categories.slice(startIdx, startIdx + catPageSize);

      let catMenu = `Select Category (${currentCatPage}/${totalCatPages}):\n`;
      pageCats.forEach((c, idx) => {
        catMenu += `${idx + 1}. ${c.title}\n`;
      });
      catMenu += "\n";
      if (currentCatPage < totalCatPages) catMenu += "99. Next Page >>\n";
      if (currentCatPage > 1) catMenu += "88. << Prev Page\n";
      catMenu += "00. Main Menu";

      return respondUSSD(catMenu.trim(), true, {
        ...sessionState,
        current_step: "BROWSE_CATEGORIES",
        category_page: currentCatPage,
      });
    }

    // =========================================================================
    // Step 6: BROWSE_NOMINEES (Nominees in Category Browsing)
    // =========================================================================
    if (currentStep === "BROWSE_NOMINEES") {
      if (userInput === "00") {
        // Back to categories
        const { data: allCategories = [] } = await supabase
          .from("award_categories")
          .select("id, title, display_order")
          .eq("is_active", true)
          .order("display_order", { ascending: true });

        const categories = allCategories || [];
        const catPageSize = 4;
        const totalCatPages = Math.max(1, Math.ceil(categories.length / catPageSize));
        const currentCatPage = sessionState.category_page || 1;
        const startIdx = (currentCatPage - 1) * catPageSize;
        const pageCats = categories.slice(startIdx, startIdx + catPageSize);

        let catMenu = `Select Category (${currentCatPage}/${totalCatPages}):\n`;
        pageCats.forEach((c, idx) => {
          catMenu += `${idx + 1}. ${c.title}\n`;
        });
        catMenu += "\n";
        if (currentCatPage < totalCatPages) catMenu += "99. Next Page >>\n";
        if (currentCatPage > 1) catMenu += "88. << Prev Page\n";
        catMenu += "00. Main Menu";

        return respondUSSD(catMenu.trim(), true, {
          ...sessionState,
          current_step: "BROWSE_CATEGORIES",
        });
      }

      const categoryId = sessionState.category_id;
      const { data: allNominees = [] } = await supabase
        .from("nominees")
        .select("id, name, nominee_code")
        .eq("category_id", categoryId)
        .eq("is_published", true)
        .order("nominee_code", { ascending: true });

      const catNominees = allNominees || [];
      const nomPageSize = 4;
      const totalNomPages = Math.max(1, Math.ceil(catNominees.length / nomPageSize));
      let currentNomPage = sessionState.nominee_page || 1;

      if (userInput === "99") {
        currentNomPage = Math.min(totalNomPages, currentNomPage + 1);
      } else if (userInput === "88") {
        currentNomPage = Math.max(1, currentNomPage - 1);
      } else {
        // Match by nominee code (e.g. 101) or page selection number (1, 2, 3...)
        const codeMatch = catNominees.find((n) => n.nominee_code === userInput);
        const startIdx = (currentNomPage - 1) * nomPageSize;
        const numMatch = catNominees[startIdx + (parseInt(userInput, 10) - 1)];
        const selectedNominee = codeMatch || numMatch;

        if (selectedNominee) {
          return respondUSSD(
            `Nominee: ${selectedNominee.name}\n` +
            `Rate: ${formatGHS(votePrice)} / vote\n\n` +
            `Enter number of votes to cast:\n` +
            `(e.g. 1, 5, 10, 20...)\n\n` +
            `00. Back`,
            true,
            {
              ...sessionState,
              current_step: "ENTER_VOTES",
              candidate_code: selectedNominee.nominee_code,
              nominee_id: selectedNominee.id,
              nominee_name: selectedNominee.name,
            }
          );
        }
      }

      // Re-render nominees page after 99 / 88 navigation
      const startIdx = (currentNomPage - 1) * nomPageSize;
      const pageNominees = catNominees.slice(startIdx, startIdx + nomPageSize);
      const catTitle = sessionState.category_title || "Category";

      let nomMenu = `${catTitle} (${currentNomPage}/${totalNomPages}):\n`;
      pageNominees.forEach((n, idx) => {
        nomMenu += `${idx + 1}. ${n.name} (#${n.nominee_code})\n`;
      });
      nomMenu += "\n";
      if (currentNomPage < totalNomPages) nomMenu += "99. Next Page >>\n";
      if (currentNomPage > 1) nomMenu += "88. << Prev Page\n";
      nomMenu += "00. Back to Categories";

      return respondUSSD(nomMenu.trim(), true, {
        ...sessionState,
        current_step: "BROWSE_NOMINEES",
        nominee_page: currentNomPage,
      });
    }

    // Info or Standings -> any input returns to main menu
    if (currentStep === "INFO" || currentStep === "STANDINGS") {
      return renderMainMenu();
    }

    // Fallback: render main menu
    return renderMainMenu();
  } catch (error) {
    console.error("Fatal error in Arkesel USSD webhook:", error);
    return new Response(
      JSON.stringify({
        sessionID: "error",
        message: "An unexpected error occurred. Please try again shortly.",
        continueSession: false,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
