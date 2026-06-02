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
      // Accept service role JWT directly
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        if (payload.role === "service_role") authorized = true;
      } catch (_) {}

      if (!authorized) {
        const { data: { user } } = await db.auth.getUser(token);
        if (user) {
          const { count } = await db.from("admin_users").select("id", { count: "exact", head: true }).eq("id", user.id);
          authorized = (count ?? 0) > 0;
        }
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

    if (action === "notify_kyc_approved") {
      const { user_id } = body;
      if (!user_id) return err("Missing user_id");
      if (!RESEND_KEY) return err("RESEND_API_KEY not configured");
      const { data: prof } = await db.from("profiles").select("email,first_name,last_name,plan").eq("id", user_id).single();
      if (!prof?.email) return err("User not found");
      const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email;
      const subject = "Your Identity Verification Is Complete";
      const html = buildPlanEmailHtml(subject, name, "kyc_approved", { plan: prof.plan || "Starter" });
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDR, to: [prof.email], subject, html }),
      }).catch(() => {});
      return ok({ sent: true });
    }

    if (action === "notify_plan_upgraded") {
      const { user_id, plan } = body;
      if (!user_id || !plan) return err("Missing user_id or plan");
      if (!RESEND_KEY) return err("RESEND_API_KEY not configured");
      const { data: prof } = await db.from("profiles").select("email,first_name,last_name").eq("id", user_id).single();
      if (!prof?.email) return err("User not found");
      const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email;
      const subject = `Your Account Has Been Upgraded to ${plan}`;
      const html = buildPlanEmailHtml(subject, name, "plan_upgraded", { plan });
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDR, to: [prof.email], subject, html }),
      }).catch(() => {});
      return ok({ sent: true });
    }

    if (action === "notify_deposit_approved") {
      const { user_id, amount, coin, network, new_balance } = body;
      if (!user_id || !amount) return err("Missing user_id or amount");
      if (!RESEND_KEY) return err("RESEND_API_KEY not configured");
      const { data: prof } = await db.from("profiles").select("email,first_name,last_name").eq("id", user_id).single();
      if (!prof?.email) return err("User not found");
      const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email;
      const subject = "Your Deposit Has Been Approved";
      const html = buildPlanEmailHtml(subject, name, "deposit_approved", { amount, coin, network, new_balance });
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDR, to: [prof.email], subject, html }),
      }).catch(() => {});
      return ok({ sent: true });
    }

    if (action === "notify_withdrawal_approved") {
      const { user_id, amount, method } = body;
      if (!user_id || !amount) return err("Missing user_id or amount");
      if (!RESEND_KEY) return err("RESEND_API_KEY not configured");
      const { data: prof } = await db.from("profiles").select("email,first_name,last_name").eq("id", user_id).single();
      if (!prof?.email) return err("User not found");
      const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email;
      const subject = "Your Withdrawal Has Been Approved";
      const html = buildPlanEmailHtml(subject, name, "withdrawal_approved", { amount, method });
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDR, to: [prof.email], subject, html }),
      }).catch(() => {});
      return ok({ sent: true });
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

function planAccent(plan: string): string {
  const p = (plan || "").toUpperCase().trim();
  if (p === "ELITE")    return "#3b82f6";
  if (p === "PLATINUM") return "#8b5cf6";
  if (p === "GOLD")     return "#f05a1a";
  if (p === "SILVER")   return "#7eb8f7";
  return "#f05a1a";
}

function buildPlanEmailHtml(subject: string, recipientName: string, tmpl: string, data: Record<string, any>): string {
  const s = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const accent = planAccent(data.plan || "Starter");
  const greeting = recipientName ? `Dear ${s(recipientName)},` : "Dear Valued Client,";

  let badge = "", content = "";

  if (tmpl === "deposit_approved") {
    const fmtAmt = Number(data.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtBal = data.new_balance != null ? Number(data.new_balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
    const method = [data.coin, data.network].filter(Boolean).join(" / ") || "Crypto";
    badge = `<div style="display:inline-block;background:#dcfce7;border:1px solid #86efac;border-radius:6px;padding:6px 16px;margin-bottom:20px;"><span style="font-size:13px;font-weight:700;color:#166534;">DEPOSIT APPROVED</span></div>`;
    content = `
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">Your deposit has been confirmed and credited to your trading account. Your funds are now available for trading.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:#f8fafc;"><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;width:45%;">Deposit Amount</td><td style="padding:14px 18px;font-size:16px;font-weight:700;color:#166534;border:1px solid #e5e7eb;">$${s(fmtAmt)}</td></tr>
        <tr><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Method</td><td style="padding:14px 18px;font-size:14px;color:#4b5563;border:1px solid #e5e7eb;">${s(method)}</td></tr>
        ${fmtBal ? `<tr style="background:#f8fafc;"><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Updated Balance</td><td style="padding:14px 18px;font-size:16px;font-weight:700;color:#0d1117;border:1px solid #e5e7eb;">$${s(fmtBal)}</td></tr>` : ""}
      </table>
      <p style="margin:0;font-size:14px;color:#6b7280;">Log in to your <a href="https://velociglobal.pro/dashboard-new.html" style="color:${accent};">dashboard</a> to start trading.</p>`;

  } else if (tmpl === "withdrawal_approved") {
    const fmtAmt = Number(data.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    badge = `<div style="display:inline-block;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:6px 16px;margin-bottom:20px;"><span style="font-size:13px;font-weight:700;color:#991b1b;">WITHDRAWAL APPROVED</span></div>`;
    content = `
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">Your withdrawal request has been approved and is being processed. Please allow 1–5 business days for the funds to arrive.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:#f8fafc;"><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;width:45%;">Withdrawal Amount</td><td style="padding:14px 18px;font-size:16px;font-weight:700;color:#991b1b;border:1px solid #e5e7eb;">$${s(fmtAmt)}</td></tr>
        ${data.method ? `<tr><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Method</td><td style="padding:14px 18px;font-size:14px;color:#4b5563;border:1px solid #e5e7eb;">${s(data.method)}</td></tr>` : ""}
      </table>
      <p style="margin:0;font-size:14px;color:#6b7280;">Questions? Contact us at <a href="mailto:help.velociglobalmarkets@gmail.com" style="color:${accent};">help.velociglobalmarkets@gmail.com</a>.</p>`;

  } else if (tmpl === "kyc_approved") {
    badge = `<div style="display:inline-block;background:#dcfce7;border:1px solid #86efac;border-radius:6px;padding:6px 16px;margin-bottom:20px;"><span style="font-size:13px;font-weight:700;color:#166534;">IDENTITY VERIFIED</span></div>`;
    content = `
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">Congratulations! Your identity has been successfully verified. You now have full access to all Veloci Global Markets features and services.</p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#166534;">What this means for you:</p>
        <ul style="margin:0;padding-left:20px;font-size:14px;color:#4b5563;line-height:2.2;">
          <li>Full withdrawal privileges unlocked</li>
          <li>Higher deposit limits available</li>
          <li>Access to all account tiers and features</li>
          <li>Enhanced account security status</li>
        </ul>
      </div>
      <p style="margin:0;font-size:14px;color:#6b7280;">Log in to your <a href="https://velociglobal.pro/dashboard-new.html" style="color:${accent};">dashboard</a> to explore all features.</p>`;

  } else if (tmpl === "plan_upgraded") {
    const planName = s(data.plan || "Silver");
    const planKey  = (data.plan || "").toUpperCase().trim();
    type PlanInfo = { minDeposit: string; leverage: string; gradient: string; features: string[] };
    const PLANS: Record<string, PlanInfo> = {
      "ELITE":    { minDeposit: "$250,000+", leverage: "125×", gradient: "linear-gradient(135deg,#1d4ed8,#3b82f6)", features: ["Personal Account Manager","Advanced AI Integration","Copy Trading Access","24/7 Priority Support","Professional Charts & Analytics","SMS & Email Trade Alerts"] },
      "PLATINUM": { minDeposit: "$50,000",   leverage: "100×", gradient: "linear-gradient(135deg,#6d28d9,#8b5cf6)", features: ["Copy Trading Access","24/7 Priority Support","Professional Charts & Analytics","SMS & Email Trade Alerts"] },
      "GOLD":     { minDeposit: "$10,000",   leverage: "50×",  gradient: "linear-gradient(135deg,#c2410c,#f05a1a)", features: ["24/7 Priority Support","Professional Charts & Analytics","Advanced Analytics Dashboard"] },
      "SILVER":   { minDeposit: "$1,000",    leverage: "25×",  gradient: "linear-gradient(135deg,#2563eb,#7eb8f7)", features: ["Priority Support","Basic Analytics Dashboard","Access to 150+ Instruments"] },
    };
    const info: PlanInfo | undefined = PLANS[planKey];
    const featuresHtml = info ? info.features.map(f =>
      `<li style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;font-size:14px;color:#374151;"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:${accent};flex-shrink:0;margin-top:1px;"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span><span>${s(f)}</span></li>`
    ).join("") : "";
    const metaBadges = info ? `<div style="display:flex;align-items:center;gap:10px;background:${accent}18;border:1px solid ${accent}44;border-radius:8px;padding:12px 16px;margin-top:20px;"><span style="font-size:13px;font-weight:700;color:${accent};">Min Deposit: ${s(info.minDeposit)} &nbsp;·&nbsp; Max Leverage: ${s(info.leverage)}</span></div>` : "";
    badge = `<div style="display:inline-block;background:${accent}18;border:1px solid ${accent}55;border-radius:6px;padding:6px 16px;margin-bottom:20px;"><span style="font-size:13px;font-weight:700;color:${accent};">ACCOUNT UPGRADED</span></div>`;
    content = `
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">Your Veloci Global Markets account has been upgraded to the <strong style="color:${accent};">${planName}</strong> tier. Welcome to an enhanced trading experience.</p>
      <div style="background:${info?.gradient ?? `linear-gradient(135deg,#0a0e1a,#1a2340)`};border-radius:12px;padding:28px;margin-bottom:24px;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.12em;color:rgba(255,255,255,0.65);text-transform:uppercase;">Your New Plan</p>
        <p style="margin:0;font-size:36px;font-weight:800;color:#fff;letter-spacing:-0.5px;">${planName}</p>
      </div>
      ${featuresHtml ? `<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px;"><p style="margin:0 0 16px;font-size:14px;font-weight:700;color:#0d1117;">What's included in your plan:</p><ul style="margin:0;padding:0;list-style:none;">${featuresHtml}</ul>${metaBadges}</div>` : ""}
      <p style="margin:0;font-size:14px;color:#6b7280;">Log in to your <a href="https://velociglobal.pro/dashboard-new.html" style="color:${accent};">dashboard</a> to explore your new benefits.</p>`;
  }

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${s(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f6;padding:48px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
      <tr><td style="background:#0a0e1a;border-radius:14px 14px 0 0;padding:20px 40px;text-align:center;">
        <img src="${LOGO_URL}" alt="Veloci Global Markets" height="80" style="display:block;margin:0 auto;height:80px;">
      </td></tr>
      <tr><td style="background:linear-gradient(90deg,${accent} 0%,${accent}bb 100%);height:4px;font-size:0;">&nbsp;</td></tr>
      <tr><td style="background:#ffffff;padding:44px 44px 32px;border-left:1px solid #e2e6ee;border-right:1px solid #e2e6ee;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.1em;color:#f05a1a;text-transform:uppercase;">Message from Veloci</p>
        <h1 style="margin:0 0 20px;font-size:26px;font-weight:700;color:#0d1117;line-height:1.3;">${s(subject)}</h1>
        <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">${greeting}</p>
        ${badge}
        ${content}
      </td></tr>
      <tr><td style="background:#f8fafc;border-left:1px solid #e2e6ee;border-right:1px solid #e2e6ee;padding:24px 44px;">
        <p style="margin:0 0 12px;font-size:13px;color:#4b5563;line-height:1.7;">If you require any assistance, please contact us via live chat or our support team at <a href="mailto:help.velociglobalmarkets@gmail.com" style="color:#f05a1a;text-decoration:none;">help.velociglobalmarkets@gmail.com</a>.</p>
        <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.7;">Warm regards,<br><strong style="color:#0d1117;">Veloci Global Markets</strong><br>Client Relations Team</p>
      </td></tr>
      <tr><td style="background:#fff5f0;border-left:1px solid #e2e6ee;border-right:1px solid #e2e6ee;padding:20px 44px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="text-align:center;border-right:1px solid #e2e6ee;padding:0 16px 0 0;"><p style="margin:0;font-size:18px;font-weight:700;color:#0d1117;">150+</p><p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">Instruments</p></td>
          <td style="text-align:center;border-right:1px solid #e2e6ee;padding:0 16px;"><p style="margin:0;font-size:18px;font-weight:700;color:#0d1117;">1:500</p><p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">Max Leverage</p></td>
          <td style="text-align:center;padding:0 0 0 16px;"><p style="margin:0;font-size:18px;font-weight:700;color:#0d1117;">24/7</p><p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">Support</p></td>
        </tr></table>
      </td></tr>
      <tr><td style="background:#0a0e1a;border-radius:0 0 14px 14px;padding:28px 44px;text-align:center;">
        <p style="margin:0 0 8px;font-size:13px;color:#8b9cb3;">Veloci Global Markets Ltd &bull; International Financial Services</p>
        <p style="margin:0 0 12px;font-size:12px;"><a href="https://velociglobal.pro" style="color:#f05a1a;text-decoration:none;">velociglobal.pro</a> &nbsp;&bull;&nbsp; <a href="https://velociglobal.pro/contact-new.html" style="color:#4a5568;text-decoration:none;">Contact Support</a></p>
        <p style="margin:0;font-size:11px;color:#374151;">&copy; 2026 Veloci Global Markets. All rights reserved.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
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
