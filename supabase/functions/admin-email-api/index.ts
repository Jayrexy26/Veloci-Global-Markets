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
  let admin_authorized = ADMIN_SECRET.length > 0 && xSecret === ADMIN_SECRET;
  let authenticated_user_id: string | null = null;

  if (!admin_authorized) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        if (payload.role === "service_role") admin_authorized = true;
      } catch (_) {}

      if (!admin_authorized) {
        const { data: { user } } = await db.auth.getUser(token);
        if (user) {
          authenticated_user_id = user.id;
          const { count } = await db.from("admin_users").select("id", { count: "exact", head: true }).eq("id", user.id);
          if ((count ?? 0) > 0) admin_authorized = true;
        }
      }
    }
  }

  const body = await req.json();
  const { action } = body;

  // Users can trigger submission notifications for their own account only
  const USER_SELF_ACTIONS = ["notify_deposit_submitted", "notify_withdrawal_submitted", "notify_kyc_submitted", "notify_pin_reset", "send_pin_reset_link"];
  // Token-authenticated actions — no JWT needed, the reset token IS the auth
  const TOKEN_ONLY_ACTIONS = ["verify_pin_reset_token", "reset_pin_with_token", "notify_user_registered"];
  const authorized = admin_authorized ||
    (authenticated_user_id !== null && USER_SELF_ACTIONS.includes(action) && body.user_id === authenticated_user_id) ||
    TOKEN_ONLY_ACTIONS.includes(action);

  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

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
      const { user_id, amount, destination_type, destination_name, destination_ref, request_id, submitted_at } = body;
      if (!user_id || !amount) return err("Missing user_id or amount");
      if (!RESEND_KEY) return err("RESEND_API_KEY not configured");
      const { data: prof } = await db.from("profiles").select("email,first_name,last_name").eq("id", user_id).single();
      if (!prof?.email) return err("User not found");
      const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email;
      const subject = "Your Withdrawal Has Been Approved";
      const html = buildPlanEmailHtml(subject, name, "withdrawal_approved", { amount, destination_type, destination_name, destination_ref, request_id, submitted_at });
      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDR, to: [prof.email], subject, html }),
      });
      if (!sendRes.ok) {
        const e = await sendRes.json().catch(() => ({}));
        return err(`Resend error: ${(e as any).message ?? sendRes.status}`);
      }
      return ok({ sent: true });
    }

    if (action === "notify_deposit_submitted") {
      const { user_id, amount, coin, network } = body;
      if (!user_id || !amount) return err("Missing user_id or amount");
      if (!RESEND_KEY) return err("RESEND_API_KEY not configured");
      const { data: prof } = await db.from("profiles").select("email,first_name,last_name").eq("id", user_id).single();
      if (!prof?.email) return err("User not found");
      const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email;
      const userSubject = "Your Deposit Request Has Been Received";
      const adminSubject = `${name} Just made a deposit request`;
      const html = buildPlanEmailHtml(userSubject, name, "deposit_submitted", { amount, coin, network });
      // Email to user
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDR, to: [prof.email], subject: userSubject, html }),
      }).catch(() => {});
      // Copy to admin with custom subject
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDR, to: ["help.velociglobalmarkets@gmail.com"], subject: adminSubject, html }),
      }).catch(() => {});
      return ok({ sent: true });
    }

    if (action === "notify_withdrawal_submitted") {
      const { user_id, amount, destination_type, destination_name, destination_ref } = body;
      if (!user_id || !amount) return err("Missing user_id or amount");
      if (!RESEND_KEY) return err("RESEND_API_KEY not configured");
      const { data: prof } = await db.from("profiles").select("email,first_name,last_name").eq("id", user_id).single();
      if (!prof?.email) return err("User not found");
      const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email;
      const userSubject = "Your Withdrawal Request Has Been Received";
      const adminSubject = `${name} just made a withdrawal`;
      const html = buildPlanEmailHtml(userSubject, name, "withdrawal_submitted", { amount, destination_type, destination_name, destination_ref });
      // Email to user
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDR, to: [prof.email], subject: userSubject, html }),
      }).catch(() => {});
      // Copy to admin with custom subject
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDR, to: ["help.velociglobalmarkets@gmail.com"], subject: adminSubject, html }),
      }).catch(() => {});
      return ok({ sent: true });
    }

    if (action === "notify_user_registered") {
      const { user_id, first_name: regFname, last_name: regLname, name: regName, email: regEmail, country: regCountry, phone: regPhone } = body;
      if (!user_id || !regEmail) return err("Missing user_id or email");
      if (!RESEND_KEY) return err("RESEND_API_KEY not configured");

      // Save profile with service role (bypasses RLS — needed when session is null during email confirmation)
      await db.from("profiles").upsert({
        id: user_id,
        email: regEmail,
        first_name: regFname || regName?.split(" ")[0] || "",
        last_name: regLname || regName?.split(" ").slice(1).join(" ") || "",
        country: regCountry || null,
        phone: regPhone || null,
        account_type: "live",
        status: "active",
        kyc_status: "none",
        plan: "Starter",
      }, { onConflict: "id" }).catch(() => {});
      const adminSubject = `New Registration — ${regName || regEmail} (${regEmail})`;
      const adminHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e6ee;border-radius:12px;overflow:hidden;">
        <div style="background:#0a0e1a;padding:20px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="Veloci Global Markets" height="60" style="display:block;margin:0 auto;">
        </div>
        <div style="background:linear-gradient(90deg,#f05a1a,#f05a1abb);height:4px;"></div>
        <div style="padding:36px 44px;">
          <div style="display:inline-block;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:4px 14px;margin-bottom:18px;"><span style="font-size:12px;font-weight:700;color:#92400e;">NEW USER REGISTERED</span></div>
          <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#0d1117;">A new user has joined Veloci Global Markets</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <tr style="background:#f8fafc;"><td style="padding:12px 16px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;width:40%;">Name</td><td style="padding:12px 16px;font-size:14px;color:#0d1117;border:1px solid #e5e7eb;">${regName || "—"}</td></tr>
            <tr><td style="padding:12px 16px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Email</td><td style="padding:12px 16px;font-size:14px;color:#0d1117;border:1px solid #e5e7eb;">${regEmail}</td></tr>
            <tr style="background:#f8fafc;"><td style="padding:12px 16px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Country</td><td style="padding:12px 16px;font-size:14px;color:#4b5563;border:1px solid #e5e7eb;">${regCountry || "—"}</td></tr>
            <tr><td style="padding:12px 16px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Phone</td><td style="padding:12px 16px;font-size:14px;color:#4b5563;border:1px solid #e5e7eb;">${regPhone || "—"}</td></tr>
            <tr style="background:#f8fafc;"><td style="padding:12px 16px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">User ID</td><td style="padding:12px 16px;font-size:12px;font-family:monospace;color:#6b7280;border:1px solid #e5e7eb;">${user_id}</td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#6b7280;">Review this user in the <a href="https://velociglobal.pro/ops-new.html" style="color:#f05a1a;text-decoration:none;">admin panel</a>.</p>
        </div>
        <div style="background:#0a0e1a;padding:20px 44px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#374151;">&copy; 2026 Veloci Global Markets. All rights reserved.</p>
        </div>
      </div>`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDR, to: ["help.velociglobalmarkets@gmail.com"], subject: adminSubject, html: adminHtml }),
      }).catch(() => {});
      return ok({ sent: true });
    }

    if (action === "notify_kyc_submitted") {
      const { user_id, doc_type, country } = body;
      if (!user_id) return err("Missing user_id");
      if (!RESEND_KEY) return err("RESEND_API_KEY not configured");
      const { data: prof } = await db.from("profiles").select("email,first_name,last_name").eq("id", user_id).single();
      if (!prof?.email) return err("User not found");
      const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email;
      const userSubject = "KYC Documents Received – Under Review";
      const adminSubject = `KYC Submitted — ${name} (${prof.email})`;
      const userHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e6ee;border-radius:12px;overflow:hidden;">
        <div style="background:#0d1117;padding:28px 44px;text-align:center;">
          <img src="${LOGO_URL}" alt="Veloci Global Markets" style="height:48px;"/>
        </div>
        <div style="padding:36px 44px;">
          <span style="display:inline-block;background:#f05a1a;color:#fff;font-size:11px;font-weight:800;padding:3px 12px;border-radius:4px;letter-spacing:0.08em;margin-bottom:18px;">IDENTITY VERIFICATION</span>
          <h2 style="margin:0 0 16px;font-size:22px;color:#0d1117;">Documents Received</h2>
          <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">Hi ${name},</p>
          <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
            We have received your KYC documents and your verification is now <strong>under review</strong>. Our team typically completes reviews within 1–3 business days.
          </p>
          ${doc_type ? `<p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong>Document:</strong> ${doc_type}</p>` : ""}
          ${country ? `<p style="margin:0 0 20px;font-size:14px;color:#6b7280;"><strong>Country of Issue:</strong> ${country}</p>` : ""}
          <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
            You will receive another email once your verification is approved or if any action is required.
          </p>
        </div>
        <div style="background:#f8fafc;border-top:1px solid #e2e6ee;padding:24px 44px;">
          <p style="margin:0 0 12px;font-size:13px;color:#4b5563;line-height:1.7;">If you have any questions, contact us at <a href="mailto:help.velociglobalmarkets@gmail.com" style="color:#f05a1a;text-decoration:none;">help.velociglobalmarkets@gmail.com</a>.</p>
          <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.7;">Warm regards,<br><strong style="color:#0d1117;">Veloci Global Markets</strong><br>Compliance Team</p>
        </div>
      </div>`;
      const adminHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e6ee;border-radius:12px;overflow:hidden;padding:32px 44px;">
        <h2 style="margin:0 0 16px;font-size:20px;color:#0d1117;">New KYC Submission</h2>
        <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Name:</strong> ${name}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Email:</strong> ${prof.email}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>User ID:</strong> ${user_id}</p>
        ${doc_type ? `<p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Document Type:</strong> ${doc_type}</p>` : ""}
        ${country ? `<p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Country of Issue:</strong> ${country}</p>` : ""}
        <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">Review this submission in the admin panel under KYC.</p>
      </div>`;
      // Email to user
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDR, to: [prof.email], subject: userSubject, html: userHtml }),
      }).catch(() => {});
      // Notify admin
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDR, to: ["help.velociglobalmarkets@gmail.com"], subject: adminSubject, html: adminHtml }),
      }).catch(() => {});
      return ok({ sent: true });
    }

    if (action === "send_pin_reset_link") {
      const { user_id } = body;
      if (!user_id) return err("Missing user_id");
      if (!RESEND_KEY) return err("RESEND_API_KEY not configured");
      const { data: prof } = await db.from("profiles").select("email,first_name,last_name").eq("id", user_id).single();
      if (!prof?.email) return err("User not found");

      // Generate a random 64-hex-char token (256 bits of entropy)
      const rawToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const hashBuf  = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
      const tokenHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");

      // Delete any existing unused tokens for this user to avoid accumulation
      await db.from("pin_reset_tokens").delete().eq("user_id", user_id).eq("used", false);

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const { error: insertErr } = await db.from("pin_reset_tokens").insert({ user_id, token_hash: tokenHash, expires_at: expiresAt });
      if (insertErr) return err("Failed to create reset token");

      const resetLink = `https://velociglobal.pro/reset-pin-new.html?token=${rawToken}`;
      const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email;
      const subject = "Reset Your Veloci Security PIN";
      const html = buildPlanEmailHtml(subject, name, "pin_reset_link", { resetLink });
      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDR, to: [prof.email], subject, html }),
      });
      if (!sendRes.ok) {
        const e = await sendRes.json().catch(() => ({}));
        return err((e as any).message ?? `Resend HTTP ${sendRes.status}`);
      }
      return ok({ sent: true });
    }

    if (action === "verify_pin_reset_token") {
      const { token } = body;
      if (!token) return err("Missing token");
      const hashBuf   = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const tokenHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
      const { data: rec } = await db.from("pin_reset_tokens")
        .select("id,user_id,expires_at,used")
        .eq("token_hash", tokenHash)
        .single();
      if (!rec) return ok({ valid: false, reason: "invalid" });
      if (rec.used) return ok({ valid: false, reason: "used" });
      if (new Date(rec.expires_at) < new Date()) return ok({ valid: false, reason: "expired" });
      return ok({ valid: true, user_id: rec.user_id });
    }

    if (action === "reset_pin_with_token") {
      const { token, pin_hash } = body;
      if (!token || !pin_hash) return err("Missing token or pin_hash");
      const hashBuf   = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const tokenHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
      const { data: rec } = await db.from("pin_reset_tokens")
        .select("id,user_id,expires_at,used")
        .eq("token_hash", tokenHash)
        .single();
      if (!rec) return err("Invalid token");
      if (rec.used) return err("Token already used");
      if (new Date(rec.expires_at) < new Date()) return err("Token expired");

      // Fetch current metadata and merge the new PIN hash
      const { data: { user: existingUser } } = await db.auth.admin.getUserById(rec.user_id);
      const currentMeta = existingUser?.user_metadata || {};
      const { error: updateErr } = await db.auth.admin.updateUserById(rec.user_id, {
        user_metadata: { ...currentMeta, trading_pin: pin_hash },
      });
      if (updateErr) return err("Failed to update PIN");

      // Mark token used
      await db.from("pin_reset_tokens").update({ used: true }).eq("id", rec.id);
      return ok({ success: true });
    }

    if (action === "notify_pin_reset") {
      const { user_id } = body;
      if (!user_id) return err("Missing user_id");
      if (!RESEND_KEY) return err("RESEND_API_KEY not configured");
      const { data: prof } = await db.from("profiles").select("email,first_name,last_name").eq("id", user_id).single();
      if (!prof?.email) return err("User not found");
      const name = [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email;
      const subject = "Your Security PIN Has Been Reset";
      const html = buildPlanEmailHtml(subject, name, "pin_reset", {});
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
    const method = [data.coin, data.network].filter(Boolean).join(" / ") || "Crypto";
    const now = new Date().toLocaleString("en-US", { year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"UTC", timeZoneName:"short" });
    badge = `<div style="display:inline-block;background:#dcfce7;border:1px solid #86efac;border-radius:6px;padding:6px 16px;margin-bottom:20px;"><span style="font-size:13px;font-weight:700;color:#166534;">DEPOSIT APPROVED</span></div>`;
    content = `
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">We are pleased to inform you that your recent deposit has been successfully received and credited to your Veloci Global Markets trading account.</p>
      <p style="margin:0 0 16px;font-size:14px;font-weight:700;color:#0d1117;">Transaction Details</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:#f8fafc;"><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;width:45%;">Deposit Amount</td><td style="padding:14px 18px;font-size:16px;font-weight:700;color:#166534;border:1px solid #e5e7eb;">$${s(fmtAmt)}</td></tr>
        <tr><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Method</td><td style="padding:14px 18px;font-size:14px;color:#4b5563;border:1px solid #e5e7eb;">${s(method)}</td></tr>
        <tr><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Status</td><td style="padding:14px 18px;font-size:14px;font-weight:600;color:#166534;border:1px solid #e5e7eb;">Successfully Completed</td></tr>
      </table>
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">Your account balance has been updated accordingly, and the funds are now available for trading and investment activities.</p>
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">We appreciate your continued trust in Veloci Global Markets.</p>
      <p style="margin:0;font-size:14px;color:#6b7280;">Log in to your <a href="https://velociglobal.pro/dashboard-new.html" style="color:${accent};">dashboard</a> to start trading.</p>`;

  } else if (tmpl === "withdrawal_approved") {
    const fmtAmt = Number(data.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const isCrypto = (data.destination_type || "crypto") === "crypto";
    const submittedDate = data.submitted_at
      ? new Date(data.submitted_at).toLocaleString("en-US", { year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"UTC", timeZoneName:"short" })
      : "—";
    const ref = data.request_id ? `VGM-${s(data.request_id).slice(0,8).toUpperCase()}` : `VGM-W-${Date.now().toString(36).toUpperCase()}`;
    const td1 = `style="padding:12px 16px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;width:42%;background:#f8fafc;"`;
    const td2 = `style="padding:12px 16px;font-size:13px;color:#4b5563;border:1px solid #e5e7eb;"`;

    let detailRows = "";
    if (isCrypto) {
      const parts = (data.destination_ref || "").split(" | Memo: ");
      const walletAddr = parts[0] ? parts[0].trim() : "";
      const memo = parts[1] ? parts[1].trim() : null;
      if (data.destination_name) detailRows += `<tr><td ${td1}>Coin / Token</td><td ${td2}>${s(data.destination_name)}</td></tr>`;
      if (walletAddr) detailRows += `<tr><td ${td1}>Wallet Address</td><td style="padding:12px 16px;font-size:12px;font-family:monospace;color:#4b5563;border:1px solid #e5e7eb;word-break:break-all;">${s(walletAddr)}</td></tr>`;
      if (memo) detailRows += `<tr><td ${td1}>Memo / Tag</td><td style="padding:12px 16px;font-size:12px;font-family:monospace;color:#4b5563;border:1px solid #e5e7eb;">${s(memo)}</td></tr>`;
    } else {
      const refParts = (data.destination_ref || "").split(" | ");
      const refLabels = ["Account No.", "SWIFT / BIC", "IBAN"];
      if (data.destination_name) detailRows += `<tr><td ${td1}>Bank / Holder</td><td ${td2}>${s(data.destination_name)}</td></tr>`;
      detailRows += refParts.filter(Boolean).map((p: string, i: number) =>
        `<tr><td ${td1}>${refLabels[i] || "Detail"}</td><td style="padding:12px 16px;font-size:12px;font-family:monospace;color:#4b5563;border:1px solid #e5e7eb;">${s(p)}</td></tr>`
      ).join("");
    }

    badge = `<div style="display:inline-block;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:6px 16px;margin-bottom:20px;"><span style="font-size:13px;font-weight:700;color:#991b1b;">WITHDRAWAL APPROVED</span></div>`;
    content = `
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">We are pleased to inform you that your withdrawal request has been successfully approved and processed by our finance department.</p>
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#0d1117;">Withdrawal Details</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td ${td1}>Withdrawal Amount</td><td style="padding:12px 16px;font-size:16px;font-weight:700;color:#991b1b;border:1px solid #e5e7eb;">$${s(fmtAmt)}</td></tr>
        <tr><td ${td1}>Type</td><td ${td2}>${isCrypto ? "Crypto" : "Bank Transfer"}</td></tr>
        ${detailRows}
        <tr><td ${td1}>Reference</td><td style="padding:12px 16px;font-size:12px;font-family:monospace;color:#4b5563;border:1px solid #e5e7eb;">${s(ref)}</td></tr>
        <tr><td ${td1}>Date Submitted</td><td ${td2}>${s(submittedDate)}</td></tr>
        <tr><td ${td1}>Status</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#166534;border:1px solid #e5e7eb;">Approved and Released</td></tr>
      </table>
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">${isCrypto
        ? "The funds have been transmitted to the designated wallet address. Depending on network conditions, they should arrive shortly."
        : "The funds have been transmitted to your designated bank account. Please allow 1–5 business days for the transfer to complete."}</p>
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">You may monitor the status of your transaction through your account <a href="https://velociglobal.pro/history-new.html" style="color:${accent};">transaction history</a>.</p>
      <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.7;">Thank you for choosing Veloci Global Markets. We appreciate your continued confidence in our services.</p>`;

  } else if (tmpl === "deposit_submitted") {
    const fmtAmt = Number(data.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const method = [data.coin, data.network].filter(Boolean).join(" / ") || "Crypto";
    const now = new Date().toLocaleString("en-US", { year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"UTC", timeZoneName:"short" });
    badge = `<div style="display:inline-block;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:6px 16px;margin-bottom:20px;"><span style="font-size:13px;font-weight:700;color:#92400e;">DEPOSIT RECEIVED</span></div>`;
    content = `
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">We have received your deposit request and it is now under review by our team. You will be notified once it has been approved and credited to your account.</p>
      <p style="margin:0 0 16px;font-size:14px;font-weight:700;color:#0d1117;">Deposit Details</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:#f8fafc;"><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;width:45%;">Deposit Amount</td><td style="padding:14px 18px;font-size:16px;font-weight:700;color:#92400e;border:1px solid #e5e7eb;">$${s(fmtAmt)}</td></tr>
        <tr><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Method</td><td style="padding:14px 18px;font-size:14px;color:#4b5563;border:1px solid #e5e7eb;">${s(method)}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Date Submitted</td><td style="padding:14px 18px;font-size:14px;color:#4b5563;border:1px solid #e5e7eb;">${s(now)}</td></tr>
        <tr><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Status</td><td style="padding:14px 18px;font-size:14px;font-weight:600;color:#d97706;border:1px solid #e5e7eb;">Pending Review</td></tr>
      </table>
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">Once our team verifies your payment, your account will be credited and you will receive a confirmation email. This typically takes 1–24 hours.</p>
      <p style="margin:0;font-size:14px;color:#6b7280;">You can track the status of your deposit in your <a href="https://velociglobal.pro/history-new.html" style="color:#f05a1a;">transaction history</a>.</p>`;

  } else if (tmpl === "withdrawal_submitted") {
    const fmtAmt = Number(data.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const isCrypto = (data.destination_type || "crypto") === "crypto";
    const now = new Date().toLocaleString("en-US", { year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"UTC", timeZoneName:"short" });
    const td1 = `style="padding:12px 16px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;width:42%;background:#f8fafc;"`;
    const td2 = `style="padding:12px 16px;font-size:13px;color:#4b5563;border:1px solid #e5e7eb;"`;

    let detailRows = "";
    if (isCrypto) {
      const parts = (data.destination_ref || "").split(" | Memo: ");
      const walletAddr = parts[0] ? parts[0].trim() : "";
      const memo = parts[1] ? parts[1].trim() : null;
      if (data.destination_name) detailRows += `<tr><td ${td1}>Coin / Token</td><td ${td2}>${s(data.destination_name)}</td></tr>`;
      if (walletAddr) detailRows += `<tr><td ${td1}>Wallet Address</td><td style="padding:12px 16px;font-size:12px;font-family:monospace;color:#4b5563;border:1px solid #e5e7eb;word-break:break-all;">${s(walletAddr)}</td></tr>`;
      if (memo) detailRows += `<tr><td ${td1}>Memo / Tag</td><td style="padding:12px 16px;font-size:12px;font-family:monospace;color:#4b5563;border:1px solid #e5e7eb;">${s(memo)}</td></tr>`;
    } else {
      const refParts = (data.destination_ref || "").split(" | ");
      const refLabels = ["Account No.", "SWIFT / BIC", "IBAN"];
      if (data.destination_name) detailRows += `<tr><td ${td1}>Bank / Holder</td><td ${td2}>${s(data.destination_name)}</td></tr>`;
      detailRows += refParts.filter(Boolean).map((p: string, i: number) =>
        `<tr><td ${td1}>${refLabels[i] || "Detail"}</td><td style="padding:12px 16px;font-size:12px;font-family:monospace;color:#4b5563;border:1px solid #e5e7eb;">${s(p)}</td></tr>`
      ).join("");
    }

    badge = `<div style="display:inline-block;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:6px 16px;margin-bottom:20px;"><span style="font-size:13px;font-weight:700;color:#92400e;">WITHDRAWAL RECEIVED</span></div>`;
    content = `
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">We have received your withdrawal request and it is now under review by our finance team. You will receive a confirmation email once it has been approved and processed.</p>
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#0d1117;">Withdrawal Details</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td ${td1}>Withdrawal Amount</td><td style="padding:12px 16px;font-size:16px;font-weight:700;color:#92400e;border:1px solid #e5e7eb;">$${s(fmtAmt)}</td></tr>
        <tr><td ${td1}>Type</td><td ${td2}>${isCrypto ? "Crypto" : "Bank Transfer"}</td></tr>
        ${detailRows}
        <tr><td ${td1}>Date Submitted</td><td ${td2}>${s(now)}</td></tr>
        <tr><td ${td1}>Status</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#d97706;border:1px solid #e5e7eb;">Pending Review</td></tr>
      </table>
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">${isCrypto
        ? "Our team will verify your request and process the transfer. Please allow up to 1–3 business days for the funds to reach your wallet."
        : "Our team will verify your request and process the bank transfer. Please allow 1–5 business days for the funds to arrive."}</p>
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">If you did not initiate this request or have any concerns, please contact our support team immediately.</p>
      <p style="margin:0;font-size:14px;color:#6b7280;">Track your withdrawal in your <a href="https://velociglobal.pro/history-new.html" style="color:#f05a1a;">transaction history</a>.</p>`;

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

  } else if (tmpl === "pin_reset_link") {
    const link = s(data.resetLink || "");
    badge = `<div style="display:inline-block;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:6px 16px;margin-bottom:20px;"><span style="font-size:13px;font-weight:700;color:#c2410c;">PIN RESET REQUEST</span></div>`;
    content = `
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">We received a request to reset the Security PIN on your Veloci Global Markets account. Click the button below to set a new 4-digit PIN.</p>
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${link}" style="display:inline-block;padding:15px 40px;background:#f05a1a;color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:.3px;">Reset My PIN</a>
      </div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;"/>
      <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 20px;font-size:12px;color:#f05a1a;word-break:break-all;"><a href="${link}" style="color:#f05a1a;text-decoration:none;">${link}</a></p>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:18px 22px;margin-bottom:8px;">
        <p style="margin:0;font-size:14px;color:#92400e;line-height:1.7;"><strong>Didn't request this?</strong> If you did not request a PIN reset, please ignore this email. Your PIN will remain unchanged. You may also want to contact our support team at <a href="mailto:help.velociglobalmarkets@gmail.com" style="color:#c2410c;text-decoration:none;font-weight:600;">help.velociglobalmarkets@gmail.com</a>.</p>
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">This link expires in <strong>1 hour</strong> and can only be used once.</p>`;

  } else if (tmpl === "pin_reset") {
    const now = new Date().toLocaleString("en-US", { year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"UTC", timeZoneName:"short" });
    badge = `<div style="display:inline-block;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:6px 16px;margin-bottom:20px;"><span style="font-size:13px;font-weight:700;color:#c2410c;">SECURITY ALERT</span></div>`;
    content = `
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.7;">Your Veloci Global Markets Security PIN has been successfully reset. You will be prompted to create a new PIN the next time you log in to your account.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:#f8fafc;"><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;width:45%;">Action</td><td style="padding:14px 18px;font-size:14px;color:#4b5563;border:1px solid #e5e7eb;">Security PIN Reset</td></tr>
        <tr><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Date &amp; Time</td><td style="padding:14px 18px;font-size:14px;color:#4b5563;border:1px solid #e5e7eb;">${s(now)}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:14px 18px;font-size:13px;font-weight:600;color:#374151;border:1px solid #e5e7eb;">Status</td><td style="padding:14px 18px;font-size:14px;font-weight:600;color:#166534;border:1px solid #e5e7eb;">Completed</td></tr>
      </table>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:18px 22px;margin-bottom:24px;">
        <p style="margin:0;font-size:14px;color:#92400e;line-height:1.7;"><strong>Didn't request this?</strong> If you did not initiate this PIN reset, please contact our support team immediately at <a href="mailto:help.velociglobalmarkets@gmail.com" style="color:#c2410c;text-decoration:none;font-weight:600;">help.velociglobalmarkets@gmail.com</a> or via live chat.</p>
      </div>
      <p style="margin:0;font-size:14px;color:#6b7280;">Log in to your <a href="https://velociglobal.pro/login-new.html" style="color:#f05a1a;">account</a> to set up your new PIN.</p>`;

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
