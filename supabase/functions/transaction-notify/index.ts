import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY")!;
const FROM_ADDR    = Deno.env.get("RESEND_FROM") || "Veloci Global Markets <noreply@velociglobal.pro>";
const WEBHOOK_SECRET = "vgm-txn-webhook-2026";
const LOGO_URL = "https://www.velociglobal.pro/assets/vgm-logo.png";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const secret = req.headers.get("x-webhook-secret");
  if (secret !== WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { type, user_id, amount, method, coin, network, new_balance } = body;
  if (!type || !user_id || amount == null) {
    return new Response(JSON.stringify({ error: "Missing fields: type, user_id, amount required" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: prof } = await db.from("profiles").select("email,first_name,last_name").eq("id", user_id).single();
  if (!prof?.email) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email;
  const s = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const greeting = name ? `Dear ${s(name)},` : "Dear Valued Client,";

  let subject: string, badgeHtml: string, bodyContent: string;

  if (type === "deposit") {
    const fmtAmt = Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtBal = new_balance != null ? Number(new_balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
    const methodStr = [coin, network].filter(Boolean).join(" / ") || "Crypto";
    subject = "Your Deposit Has Been Approved";
    badgeHtml = `<div style="display:inline-block;background:#dcfce7;border:1px solid #86efac;border-radius:6px;padding:6px 16px;margin-bottom:20px;"><span style="font-size:13px;font-weight:700;color:#166534;">DEPOSIT APPROVED</span></div>`;
    bodyContent = `
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">Your deposit has been confirmed and credited to your trading account. Your funds are now available for trading.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:#f8fafc;"><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;width:45%;">Deposit Amount</td><td style="padding:14px 18px;font-size:16px;font-weight:700;color:#166534;border:1px solid #e5e7eb;">$${s(fmtAmt)}</td></tr>
        <tr><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Method</td><td style="padding:14px 18px;font-size:14px;color:#4b5563;border:1px solid #e5e7eb;">${s(methodStr)}</td></tr>
        ${fmtBal ? `<tr style="background:#f8fafc;"><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Updated Balance</td><td style="padding:14px 18px;font-size:16px;font-weight:700;color:#0d1117;border:1px solid #e5e7eb;">$${s(fmtBal)}</td></tr>` : ""}
      </table>
      <p style="margin:0;font-size:14px;color:#6b7280;">Log in to your <a href="https://velociglobal.pro/dashboard-new.html" style="color:#f05a1a;">dashboard</a> to start trading.</p>`;
  } else {
    const fmtAmt = Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const methodStr = method || coin || null;
    subject = "Your Withdrawal Has Been Approved";
    badgeHtml = `<div style="display:inline-block;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:6px 16px;margin-bottom:20px;"><span style="font-size:13px;font-weight:700;color:#991b1b;">WITHDRAWAL APPROVED</span></div>`;
    bodyContent = `
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">Your withdrawal request has been approved and is being processed. Please allow 1–5 business days for the funds to arrive.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:#f8fafc;"><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;width:45%;">Withdrawal Amount</td><td style="padding:14px 18px;font-size:16px;font-weight:700;color:#991b1b;border:1px solid #e5e7eb;">$${s(fmtAmt)}</td></tr>
        ${methodStr ? `<tr><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Method</td><td style="padding:14px 18px;font-size:14px;color:#4b5563;border:1px solid #e5e7eb;">${s(methodStr)}</td></tr>` : ""}
      </table>
      <p style="margin:0;font-size:14px;color:#6b7280;">Questions? Contact us at <a href="mailto:help.velociglobalmarkets@gmail.com" style="color:#f05a1a;">help.velociglobalmarkets@gmail.com</a>.</p>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${s(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f6;padding:48px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
      <tr><td style="background:#0a0e1a;border-radius:14px 14px 0 0;padding:20px 40px;text-align:center;">
        <img src="${LOGO_URL}" alt="Veloci Global Markets" height="80" style="display:block;margin:0 auto;height:80px;">
      </td></tr>
      <tr><td style="background:linear-gradient(90deg,#f05a1a 0%,#f05a1abb 100%);height:4px;font-size:0;">&nbsp;</td></tr>
      <tr><td style="background:#ffffff;padding:44px 44px 32px;border-left:1px solid #e2e6ee;border-right:1px solid #e2e6ee;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.1em;color:#f05a1a;text-transform:uppercase;">Message from Veloci</p>
        <h1 style="margin:0 0 20px;font-size:26px;font-weight:700;color:#0d1117;line-height:1.3;">${s(subject)}</h1>
        <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">${greeting}</p>
        ${badgeHtml}
        ${bodyContent}
      </td></tr>
      <tr><td style="background:#f8fafc;border-left:1px solid #e2e6ee;border-right:1px solid #e2e6ee;padding:24px 44px;">
        <p style="margin:0 0 12px;font-size:13px;color:#4b5563;line-height:1.7;">If you require any assistance, contact us at <a href="mailto:help.velociglobalmarkets@gmail.com" style="color:#f05a1a;text-decoration:none;">help.velociglobalmarkets@gmail.com</a>.</p>
        <p style="margin:0;font-size:13px;color:#4b5563;">Warm regards,<br><strong style="color:#0d1117;">Veloci Global Markets</strong><br>Client Relations Team</p>
      </td></tr>
      <tr><td style="background:#0a0e1a;border-radius:0 0 14px 14px;padding:28px 44px;text-align:center;">
        <p style="margin:0 0 8px;font-size:13px;color:#8b9cb3;">Veloci Global Markets Ltd &bull; International Financial Services</p>
        <p style="margin:0;font-size:12px;"><a href="https://velociglobal.pro" style="color:#f05a1a;text-decoration:none;">velociglobal.pro</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const sendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_ADDR, to: [prof.email], subject, html }),
  });

  if (!sendRes.ok) {
    const e = await sendRes.json().catch(() => ({}));
    return new Response(JSON.stringify({ error: "Resend failed", detail: e }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ sent: true, to: prof.email }), {
    status: 200, headers: { ...cors, "Content-Type": "application/json" },
  });
});
