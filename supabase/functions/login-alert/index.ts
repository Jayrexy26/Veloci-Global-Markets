import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_ADDR  = Deno.env.get("RESEND_FROM") || "Veloci Global Markets <noreply@velociglobal.pro>";
const LOGO_URL   = "https://www.velociglobal.pro/assets/vgm-logo.png";

const ALLOWED_ORIGINS = ["https://velociglobal.pro", "https://www.velociglobal.pro"];

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const { email, event, login_time, user_agent, device_language, timezone, platform, ip_address, location: userLocation } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    /* ── Device / browser detection ── */
    const ua = user_agent || "";
    const isMobile = /Mobi|Android/i.test(ua);
    const isTablet = /Tablet|iPad/i.test(ua);
    const deviceType = isTablet ? "Tablet" : isMobile ? "Mobile" : "Desktop";
    const browser = /Edg/.test(ua) ? "Edge"
      : /Chrome/.test(ua) ? "Chrome"
      : /Firefox/.test(ua) ? "Firefox"
      : /Safari/.test(ua) ? "Safari"
      : /Opera|OPR/.test(ua) ? "Opera"
      : "Unknown";
    const os = /Windows/.test(ua) ? "Windows"
      : /Mac/.test(ua) ? "macOS"
      : /Android/.test(ua) ? "Android"
      : /iPhone|iPad/.test(ua) ? "iOS"
      : /Linux/.test(ua) ? "Linux"
      : "Unknown";

    /* Use client-supplied IP/location (already resolved by the browser) */
    const ipAddress = ip_address || "Unknown";
    const location  = userLocation || "Unknown";

    const loginTime = login_time
      ? new Date(login_time).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: timezone || "UTC" })
      : new Date().toUTCString();

    const subject = "New Login to Your Veloci Global Markets Account";
    const html    = buildLoginAlertHtml(email, loginTime, ipAddress, location, deviceType, browser, os, timezone || "UTC");

    if (!RESEND_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDR, to: [email], subject, html }),
    });
    const resendBody = await resendResp.json().catch(() => ({}));

    if (!resendResp.ok) {
      return new Response(JSON.stringify({ error: "Resend failed", status: resendResp.status, detail: resendBody }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ sent: true, id: resendBody.id }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

function buildLoginAlertHtml(
  email: string, loginTime: string, ip: string,
  location: string, device: string, browser: string, os: string, timezone: string
): string {
  const s = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const accent = "#f05a1a";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>New Login Alert</title></head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f6;padding:48px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

      <tr><td style="background:#0a0e1a;border-radius:14px 14px 0 0;padding:20px 40px;text-align:center;">
        <img src="${LOGO_URL}" alt="Veloci Global Markets" height="80" style="display:block;margin:0 auto;height:80px;">
      </td></tr>

      <tr><td style="background:linear-gradient(90deg,${accent} 0%,#d94d12 100%);height:4px;font-size:0;">&nbsp;</td></tr>

      <tr><td style="background:#ffffff;padding:44px 44px 32px;border-left:1px solid #e2e6ee;border-right:1px solid #e2e6ee;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.1em;color:${accent};text-transform:uppercase;">Security Alert</p>
        <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#0d1117;line-height:1.3;">New Login Detected</h1>
        <p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.7;">A new login was detected on your Veloci Global Markets account. If this was you, no action is needed. If you don't recognize this login, please change your password immediately.</p>

        <div style="background:#f8fafc;border:1px solid #e2e6ee;border-radius:12px;padding:24px;margin-bottom:24px;">
          <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#0d1117;text-transform:uppercase;letter-spacing:.05em;">Login Details</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #e2e6ee;font-size:13px;font-weight:600;color:#6b7280;width:40%;">Account</td>
              <td style="padding:10px 0;border-bottom:1px solid #e2e6ee;font-size:13px;color:#0d1117;">${s(email)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #e2e6ee;font-size:13px;font-weight:600;color:#6b7280;">Time</td>
              <td style="padding:10px 0;border-bottom:1px solid #e2e6ee;font-size:13px;color:#0d1117;">${s(loginTime)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #e2e6ee;font-size:13px;font-weight:600;color:#6b7280;">IP Address</td>
              <td style="padding:10px 0;border-bottom:1px solid #e2e6ee;font-size:13px;color:#0d1117;">${s(ip)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #e2e6ee;font-size:13px;font-weight:600;color:#6b7280;">Location</td>
              <td style="padding:10px 0;border-bottom:1px solid #e2e6ee;font-size:13px;color:#0d1117;">${s(location)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #e2e6ee;font-size:13px;font-weight:600;color:#6b7280;">Device</td>
              <td style="padding:10px 0;border-bottom:1px solid #e2e6ee;font-size:13px;color:#0d1117;">${s(device)} &bull; ${s(browser)} &bull; ${s(os)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;font-size:13px;font-weight:600;color:#6b7280;">Timezone</td>
              <td style="padding:10px 0;font-size:13px;color:#0d1117;">${s(timezone)}</td>
            </tr>
          </table>
        </div>

        <div style="background:#fff5f0;border:1px solid #fcd9c8;border-radius:10px;padding:16px 20px;">
          <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
            <strong>Wasn't you?</strong> Contact our support team immediately at
            <a href="mailto:help.velociglobalmarkets@gmail.com" style="color:${accent};text-decoration:none;">help.velociglobalmarkets@gmail.com</a>
            or via live chat on <a href="https://velociglobal.pro" style="color:${accent};text-decoration:none;">velociglobal.pro</a>.
          </p>
        </div>
      </td></tr>

      <tr><td style="background:#f8fafc;border-left:1px solid #e2e6ee;border-right:1px solid #e2e6ee;padding:24px 44px;">
        <p style="margin:0 0 12px;font-size:13px;color:#4b5563;line-height:1.7;">This is an automated security notification from Veloci Global Markets. Please do not reply to this email.</p>
        <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.7;">Warm regards,<br><strong style="color:#0d1117;">Veloci Global Markets</strong><br>Security Team</p>
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
        <p style="margin:0 0 12px;font-size:12px;"><a href="https://velociglobal.pro" style="color:${accent};text-decoration:none;">velociglobal.pro</a> &nbsp;&bull;&nbsp; <a href="https://velociglobal.pro/contact-new.html" style="color:#4a5568;text-decoration:none;">Contact Support</a></p>
        <p style="margin:0;font-size:11px;color:#374151;">&copy; 2026 Veloci Global Markets. All rights reserved.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}
