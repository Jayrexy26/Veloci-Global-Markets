import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY")!;
const FROM_ADDR    = Deno.env.get("RESEND_FROM") || "Veloci Global Markets <noreply@velociglobal.pro>";
const ADMIN_SECRET = Deno.env.get("ADMIN_SECRET") || "";

const LOGO_URL = "https://www.velociglobal.pro/assets/vgm-logo.png";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const xSecret = req.headers.get("x-admin-secret");
  let authorized = ADMIN_SECRET.length > 0 && xSecret === ADMIN_SECRET;

  if (!authorized) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: { user } } = await db.auth.getUser(token);
      if (user) {
        const { count } = await db.from("admin_users").select("id", { count: "exact", head: true }).eq("id", user.id);
        authorized = (count ?? 0) > 0;
      }
    }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const { action } = body;

  try {
    if (action === "send_email") {
      const { recipient_email, recipient_name, recipient_user_id, subject, body_text } = body;
      if (!recipient_email || !subject || !body_text) return err("Missing required fields");
      if (!RESEND_KEY) return err("RESEND_API_KEY not configured");

      const html      = buildEmailHtml(subject, recipient_name ?? "", body_text);
      const plainText = buildPlainText(subject, recipient_name ?? "", body_text);

      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDR, to: [recipient_email], subject, html, text: plainText }),
      });

      if (!sendRes.ok) {
        const e = await sendRes.json().catch(() => ({}));
        return err((e as any).message ?? `Resend HTTP ${sendRes.status}`);
      }

      await db.from("admin_sent_emails").insert({
        recipient_email,
        recipient_name: recipient_name ?? null,
        recipient_user_id: recipient_user_id ?? null,
        subject,
        body_text,
        body_html: html,
      });

      return ok({ sent: true });
    }

    if (action === "get_email_history") {
      const { data } = await db.from("admin_sent_emails")
        .select("id,recipient_email,recipient_name,subject,body_html,sent_at")
        .order("sent_at", { ascending: false })
        .limit(200);
      return ok({ emails: data ?? [] });
    }

    return err("Unknown action: " + action);

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

function ok(data: object) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
}
function err(msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
}

function buildPlainText(subject: string, recipientName: string, bodyText: string): string {
  const greeting = recipientName ? `Dear ${recipientName},` : "Dear Valued Client,";
  const clean = bodyText.replace(/\*([^*\n]+)\*/g, "$1").replace(/#([^#\n]+)#/g, "$1");
  return [
    "Veloci Global Markets",
    "",
    subject,
    "",
    greeting,
    "",
    clean,
    "",
    "---",
    "If you require any assistance, please contact us via live chat or our support team at help.velociglobalmarkets@gmail.com.",
    "",
    "Warm regards,",
    "Veloci Global Markets | velociglobal.pro",
  ].join("\n");
}

function buildEmailHtml(subject: string, recipientName: string, bodyText: string): string {
  const safe = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const greeting = recipientName ? `Dear ${safe(recipientName)},` : "Dear Valued Client,";
  const bodyHtml = safe(bodyText)
    .replace(/\*([^*\n]+)\*/g, (_m, t) => `<strong style="color:#f05a1a;text-transform:uppercase;">${t}</strong>`)
    .replace(/#([^#\n]+)#/g, (_m, t) => `<strong>${t}</strong>`)
    .replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${safe(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f6;padding:48px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
      <tr>
        <td style="background:#0a0e1a;border-radius:14px 14px 0 0;padding:20px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="Veloci Global Markets" height="80" style="display:block;margin:0 auto;height:80px;">
        </td>
      </tr>
      <tr>
        <td style="background:linear-gradient(90deg,#f05a1a 0%,#d94d12 100%);height:4px;font-size:0;line-height:0;">&nbsp;</td>
      </tr>
      <tr>
        <td style="background:#ffffff;padding:44px 44px 32px;border-left:1px solid #e2e6ee;border-right:1px solid #e2e6ee;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.1em;color:#f05a1a;text-transform:uppercase;">Message from Veloci</p>
          <h1 style="margin:0 0 20px;font-size:26px;font-weight:700;color:#0d1117;line-height:1.3;">${safe(subject)}</h1>
          <p style="margin:0 0 8px;font-size:15px;color:#4b5563;line-height:1.7;">${greeting}</p>
          <p style="margin:0 0 0;font-size:15px;color:#4b5563;line-height:1.7;">${bodyHtml}</p>
        </td>
      </tr>
      <tr>
        <td style="background:#f8fafc;border-left:1px solid #e2e6ee;border-right:1px solid #e2e6ee;padding:24px 44px;">
          <p style="margin:0 0 12px;font-size:13px;color:#4b5563;line-height:1.7;">If you require any assistance, please contact us via live chat or our support team at <a href="mailto:help.velociglobalmarkets@gmail.com" style="color:#f05a1a;text-decoration:none;">help.velociglobalmarkets@gmail.com</a>.</p>
          <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.7;">Warm regards,<br><strong style="color:#0d1117;">Veloci Global Markets</strong><br>Client Relations Team</p>
        </td>
      </tr>
      <tr>
        <td style="background:#fff5f0;border-left:1px solid #e2e6ee;border-right:1px solid #e2e6ee;padding:20px 44px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="text-align:center;border-right:1px solid #e2e6ee;padding:0 16px 0 0;"><p style="margin:0;font-size:18px;font-weight:700;color:#0d1117;">150+</p><p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">Instruments</p></td>
            <td style="text-align:center;border-right:1px solid #e2e6ee;padding:0 16px;"><p style="margin:0;font-size:18px;font-weight:700;color:#0d1117;">1:500</p><p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">Max Leverage</p></td>
            <td style="text-align:center;padding:0 0 0 16px;"><p style="margin:0;font-size:18px;font-weight:700;color:#0d1117;">24/7</p><p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">Support</p></td>
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="background:#0a0e1a;border-radius:0 0 14px 14px;padding:28px 44px;text-align:center;">
          <p style="margin:0 0 8px;font-size:13px;color:#8b9cb3;">Veloci Global Markets Ltd &bull; International Financial Services</p>
          <p style="margin:0 0 12px;font-size:12px;"><a href="https://velociglobal.pro" style="color:#f05a1a;text-decoration:none;">velociglobal.pro</a> &nbsp;&bull;&nbsp; <a href="https://velociglobal.pro/contact-new.html" style="color:#4a5568;text-decoration:none;">Contact Support</a></p>
          <p style="margin:0;font-size:11px;color:#374151;">&copy; 2026 Veloci Global Markets. All rights reserved.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
