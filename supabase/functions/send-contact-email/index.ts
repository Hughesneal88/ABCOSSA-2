import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUBJECT_LABELS: Record<string, string> = {
  general: "General Inquiry",
  admissions: "Admissions",
  internship: "Internship listing",
  partnership: "Partnership Opportunity",
  media: "Media/Press",
  other: "Other",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { name, email, subject, message } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Save the submission
    const { error: insertError } = await supabase
      .from("contact_submissions")
      .insert({ name, email, subject, message });

    if (insertError) throw new Error(insertError.message);

    // Read the configured contact email
    const { data: setting } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "contact_email")
      .maybeSingle();

    const toEmail =
      (setting as { value: string } | null)?.value || "abcossa22@gmail.com";

    // Send via Resend — only runs when RESEND_API_KEY secret is set
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const subjectLabel = SUBJECT_LABELS[subject] ?? subject;
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          // During Resend free tier, "from" must be onboarding@resend.dev
          // Once you verify your domain in Resend, change this to e.g. noreply@abcossa.ug
          from: "ABCOSSA Website <onboarding@resend.dev>",
          to: [toEmail],
          reply_to: email,
          subject: `[ABCOSSA] ${subjectLabel} — from ${name}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
              <h2 style="color:#2d6a4f;margin-bottom:4px">New contact form message</h2>
              <p style="color:#555;margin-top:0;font-size:14px">Submitted via the ABCOSSA website</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr>
                  <td style="padding:6px 12px 6px 0;color:#555;vertical-align:top;width:90px"><strong>Name</strong></td>
                  <td style="padding:6px 0">${name}</td>
                </tr>
                <tr>
                  <td style="padding:6px 12px 6px 0;color:#555;vertical-align:top"><strong>Email</strong></td>
                  <td style="padding:6px 0"><a href="mailto:${email}" style="color:#2d6a4f">${email}</a></td>
                </tr>
                <tr>
                  <td style="padding:6px 12px 6px 0;color:#555;vertical-align:top"><strong>Subject</strong></td>
                  <td style="padding:6px 0">${subjectLabel}</td>
                </tr>
              </table>
              <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
              <div style="white-space:pre-wrap;line-height:1.7;color:#333">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
              <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
              <p style="font-size:12px;color:#999">
                Reply directly to this email to respond to ${name}.
                This message is also saved in the ABCOSSA staff portal under Settings → Messages.
              </p>
            </div>
          `,
        }),
      });

      if (!emailRes.ok) {
        // Log but don't fail — submission is saved; email failure is non-fatal
        const errText = await emailRes.text();
        console.error("Resend send failed:", errText);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
