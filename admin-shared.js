/* admin-shared.js — Shared constants, helpers, API, search, auth for all admin pages */

const API_URL = "https://xdcscknfomlzwysczegc.supabase.co/functions/v1/admin-api";
const WALLET_API_URL = "https://xdcscknfomlzwysczegc.supabase.co/functions/v1/wallet-api";
const SITE_CONTENT_API_URL = "https://xdcscknfomlzwysczegc.supabase.co/functions/v1/site-content-api";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkY3Nja25mb21send5c2N6ZWdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MTYzMDMsImV4cCI6MjA4MzI5MjMwM30.E6o2wFFMOpK1DghLUqnxG6Ig09djy4bmDQexprhAiB4";
const SUPABASE_URL = "https://xdcscknfomlzwysczegc.supabase.co";

// Direct Supabase client for audit log (CDN loaded per-page in <head>)
(function(){
  try{
    if(window.supabase && window.supabase.createClient){
      window.VELOCI_DB = window.supabase.createClient(SUPABASE_URL, ANON_KEY);
    }
  }catch(_){}
})();

let ADMIN_SECRET = "";
let ADMIN_ID = "admin";
let ACTIVE_VIEW = "";
let AUTO_REFRESH = false;
let AUTO_TIMER = null;
// Block ghost clicks that arrive from the previous page within 400ms of load
let _clickGuard = true;
setTimeout(function(){ _clickGuard = false; }, 400);

const CACHE = {
  support: [],
  users: [],
  plans: [],
  deposits: [],
  withdrawals: [],
  wallets: [],
  kyc: [],
  wallet_links: [],
  trades: [],
  notifications: [],
  pamms: [],
  homepage_content: null
};

const USERNAME_MAP = {};
const PHONE_MAP = {};
let SEARCH_RESULTS = [];
let SEARCH_CURSOR = -1;

const PLAN_TEMPLATES = [
  { key:"silver",   label:"Silver • X10 • 5 days • Min $100",   plan_name:"Silver Plan",   amount:100,  x_times:10, duration_days:5 },
  { key:"gold",     label:"Gold • X13 • 5 days • Min $700",     plan_name:"Gold Plan",     amount:700,  x_times:13, duration_days:5 },
  { key:"diamond",  label:"Diamond • X15 • 5 days • Min $1500", plan_name:"Diamond Plan",  amount:1500, x_times:15, duration_days:5 },
  { key:"platinum", label:"Platinum • X18 • 5 days • Min $5000",plan_name:"Platinum Plan", amount:5000, x_times:18, duration_days:5 },
];

const CRYPTO_ASSETS = ["BTC","ETH","USDT","USDC","BNB","SOL","TRX","LTC","TON","DOGE","XRP","ADA","AVAX","MATIC"];
function cryptoAssetOptionsHtml(){
  return CRYPTO_ASSETS.map(s=>`<option value="${s}">${s}</option>`).join("");
}

const WALLET_PRESETS = [
  { asset_key:"BTC",        name:"Bitcoin",     network:"BTC",   address:"", memo_label:null, memo_value:null, note:"" },
  { asset_key:"ETH",        name:"Ethereum",    network:"ERC20", address:"", memo_label:null, memo_value:null, note:"" },
  { asset_key:"USDT_TRC20", name:"Tether USDT", network:"TRC20", address:"", memo_label:null, memo_value:null, note:"" },
  { asset_key:"USDT_ERC20", name:"Tether USDT", network:"ERC20", address:"", memo_label:null, memo_value:null, note:"" },
  { asset_key:"USDT_BEP20", name:"Tether USDT", network:"BEP20", address:"", memo_label:null, memo_value:null, note:"" },
  { asset_key:"USDC_ERC20", name:"USD Coin",    network:"ERC20", address:"", memo_label:null, memo_value:null, note:"" },
  { asset_key:"BNB_BEP20",  name:"BNB",         network:"BEP20", address:"", memo_label:null, memo_value:null, note:"" },
  { asset_key:"SOL",        name:"Solana",      network:"SOL",   address:"", memo_label:null, memo_value:null, note:"" },
  { asset_key:"TRX",        name:"TRON",        network:"TRC20", address:"", memo_label:null, memo_value:null, note:"" },
  { asset_key:"DOGE",       name:"Dogecoin",    network:"DOGE",  address:"", memo_label:null, memo_value:null, note:"" },
  { asset_key:"LTC",        name:"Litecoin",    network:"LTC",   address:"", memo_label:null, memo_value:null, note:"" },
];

/* ── Helpers ── */
function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}
function nowStamp(){ return new Date().toLocaleString(); }
function fmtDate(ts){ if(!ts) return "—"; return new Date(ts).toLocaleString(); }

function inferUsernameFromEmail(email){
  const e = String(email||"").trim().toLowerCase();
  if(!e || !e.includes("@")) return "";
  let u = e.split("@")[0] || "";
  u = u.replaceAll(".", " ").replaceAll("_", " ").replaceAll("-", " ").trim();
  if(!u) return "";
  return u.split(" ").map(w => w ? (w[0].toUpperCase() + w.slice(1)) : "").join(" ");
}
function usernameForEmail(email){
  const key = String(email||"").trim().toLowerCase();
  return USERNAME_MAP[key] || inferUsernameFromEmail(key) || "User";
}
function userPillHtml(email){
  const em = String(email||"").trim().toLowerCase();
  const nm = usernameForEmail(em);
  const ph = PHONE_MAP[em] || '';
  return `<span class="namePill"><span class="nm">${esc(nm)}</span><span class="em">${esc(em)}</span>${ph?`<span class="ph">${esc(ph)}</span>`:''}</span>`;
}
async function loadUserMaps(){
  const db = window.VELOCI_DB;
  if(!db) return;
  try{
    const { data } = await db.from('profiles').select('email,first_name,last_name,full_name,phone');
    (data||[]).forEach(u=>{
      const em = String(u.email||'').trim().toLowerCase();
      if(!em) return;
      const name = [u.first_name,u.last_name].filter(Boolean).join(' ') || u.full_name || '';
      if(name) USERNAME_MAP[em] = name;
      if(u.phone) PHONE_MAP[em] = u.phone;
    });
  }catch(e){}
}

function openProof(url){
  const u = String(url||"").trim();
  if(!u){ modalShow("No proof", "No URL attached."); return; }
  modalShow("Preview", "");
  const body = document.getElementById("modalBody");
  body.innerHTML = `
    <div class="proofWrap">
      <div class="proofHint">
        <span class="chip">Preview</span>
        <a href="${esc(u)}" target="_blank" rel="noopener">Open in new tab</a>
      </div>
      <div class="proofFrame">
        <iframe src="${esc(u)}" loading="lazy" referrerpolicy="no-referrer"></iframe>
      </div>
      <div class="tiny">If preview is blocked by the host, use "Open in new tab".</div>
    </div>
  `;
}

function modalShow(title, body){
  document.getElementById("modalTitle").textContent = title;
  const el = document.getElementById("modalBody");
  el.textContent = body;
  document.getElementById("modalOverlay").style.display = "flex";
}
function modalClose(){ document.getElementById("modalOverlay").style.display = "none"; }

function feed(line){
  const box = document.getElementById("feedBox");
  if(!box) return;
  const stamp = nowStamp();
  const prev = (box.textContent && box.textContent.trim() !== "No activity yet.") ? box.textContent : "";
  box.textContent = `[${stamp}] ${line}\n` + prev;
}

function setSysBox(msg){ const el = document.getElementById("sysBox"); if(el) el.textContent = msg; }
function setDebugBox(msg){ const el = document.getElementById("debugBox"); if(el) el.textContent = msg; }

function clearDebug(){
  setDebugBox("No errors yet.");
  setSysBox(ADMIN_SECRET ? "Connected." : "Not connected.");
  modalShow("Cleared", "Ops Intelligence cleared.");
}

function openSidebar(){
  if(_clickGuard) return;
  const sb = document.getElementById("sidebar");
  if(sb) sb.classList.add("open");
  const ov = document.getElementById("sideOverlay");
  if(ov) ov.classList.add("show");
}
function closeSidebar(){
  const sb = document.getElementById("sidebar");
  if(sb) sb.classList.remove("open");
  const ov = document.getElementById("sideOverlay");
  if(ov) ov.classList.remove("show");
}

function scrollTopMain(){
  const main = document.getElementById("mainScroll");
  if(main && main.scrollTo){
    main.scrollTo({ top: 0, behavior: "smooth" });
  }else{
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

/* ── Auth ── */
function lockConsole(){
  sessionStorage.removeItem("sv_admin_secret");
  sessionStorage.removeItem("sv_admin_id");
  ADMIN_SECRET = "";
  ADMIN_ID = "admin";
  AUTO_REFRESH = false;
  if(AUTO_TIMER){ clearInterval(AUTO_TIMER); AUTO_TIMER=null; }
  Object.keys(CACHE).forEach(k=> Array.isArray(CACHE[k]) ? (CACHE[k]=[]) : (CACHE[k]=null));
  Object.keys(USERNAME_MAP).forEach(k=>delete USERNAME_MAP[k]);
  Object.keys(PHONE_MAP).forEach(k=>delete PHONE_MAP[k]);
  window.location.href = "admin-login.html";
}

function requireAuth(){
  const secret = sessionStorage.getItem("sv_admin_secret");
  const id = sessionStorage.getItem("sv_admin_id");
  if(!secret){
    window.location.href = "admin-login.html";
    return;
  }
  ADMIN_SECRET = secret;
  ADMIN_ID = id || "admin";

  const adminChip = document.getElementById("adminChip");
  if(adminChip) adminChip.textContent = "ADMIN: " + ADMIN_ID;
  const subAdmin = document.getElementById("subAdmin");
  if(subAdmin) subAdmin.textContent = "Operator • " + ADMIN_ID;
  loadUserMaps();
}

/* ── Search ── */
function normalize(s){ return String(s||"").trim().toLowerCase(); }

function buildUserIndex(){
  const map = new Map();
  (CACHE.users||[]).forEach(u=>{
    const email = normalize(u.email);
    if(!email) return;
    const name =
      normalize(u.username||u.full_name||u.name||u.display_name) ||
      normalize(USERNAME_MAP[email]) ||
      normalize(inferUsernameFromEmail(email));
    map.set(email, { email, name: name || "user" });
  });
  return Array.from(map.values());
}

function searchUsers(q){
  const query = normalize(q);
  if(!query) return [];
  const index = buildUserIndex();
  const prefix = index.filter(u => (u.name||"").startsWith(query) || (u.email||"").startsWith(query));
  const contains = index.filter(u =>
    !((u.name||"").startsWith(query) || (u.email||"").startsWith(query)) &&
    (((u.name||"").includes(query)) || ((u.email||"").includes(query)))
  );
  return prefix.concat(contains).slice(0, 24);
}

function getSearch(){ return normalize((document.getElementById("globalSearch") || {value:""}).value || ""); }

function matchSearch(obj){
  const q = getSearch();
  if(!q) return true;
  try{
    const o = obj || {};
    const email = normalize(o.email || o.user_email || "");
    const name = normalize(USERNAME_MAP[email] || inferUsernameFromEmail(email) || "");
    if(email.includes(q) || name.includes(q)) return true;
    return JSON.stringify(o).toLowerCase().includes(q);
  }catch(e){
    return true;
  }
}

function focusSearch(){ const el = document.getElementById("globalSearch"); if(el) el.focus(); }

function clearSearch(){
  const inp = document.getElementById("globalSearch");
  if(inp) inp.value = "";
  hideSuggestions();
  refreshVisibleOnly();
}

function showSuggestions(items){
  const box = document.getElementById("searchSugg");
  const list = document.getElementById("suggList");
  const title = document.getElementById("suggTitle");
  if(!box || !list || !title) return;

  SEARCH_RESULTS = items || [];
  SEARCH_CURSOR = -1;

  if(SEARCH_RESULTS.length === 0){ hideSuggestions(); return; }

  title.textContent = `Matches (${SEARCH_RESULTS.length})`;
  list.innerHTML = "";
  SEARCH_RESULTS.forEach((u, idx)=>{
    const nm = usernameForEmail(u.email);
    list.innerHTML += `
      <div class="suggItem" id="sugg-${idx}" onclick="selectSuggestion(${idx})">
        <div class="suggLeft">
          <div class="suggName">${esc(nm)}</div>
          <div class="suggEmail">${esc(u.email)}</div>
        </div>
        <div class="suggTag">OPEN</div>
      </div>
    `;
  });
  box.classList.add("show");
}

function hideSuggestions(){
  const box = document.getElementById("searchSugg");
  if(box) box.classList.remove("show");
  SEARCH_RESULTS = [];
  SEARCH_CURSOR = -1;
}

function highlightCursor(){
  for(let i=0;i<SEARCH_RESULTS.length;i++){
    const el = document.getElementById("sugg-"+i);
    if(!el) continue;
    el.style.background = (i === SEARCH_CURSOR) ? "rgba(56,189,248,.10)" : "";
  }
  if(SEARCH_CURSOR >= 0){
    const el = document.getElementById("sugg-"+SEARCH_CURSOR);
    if(el && el.scrollIntoView) el.scrollIntoView({ block:"nearest" });
  }
}

function selectSuggestion(idx){
  const u = SEARCH_RESULTS[idx];
  if(!u) return;
  const inp = document.getElementById("globalSearch");
  if(inp) inp.value = u.email;
  hideSuggestions();
  refreshVisibleOnly();
  feed("SEARCH selected -> " + u.email);
}

function onSearchInput(){
  const q = getSearch();
  refreshVisibleOnly();
  if(q.length >= 1 && (CACHE.users||[]).length > 0){
    showSuggestions(searchUsers(q));
  }else{
    hideSuggestions();
  }
}

function onSearchKeydown(e){
  const box = document.getElementById("searchSugg");
  if(!box || !box.classList.contains("show")) return;
  if(e.key === "ArrowDown"){
    e.preventDefault();
    SEARCH_CURSOR = Math.min(SEARCH_CURSOR + 1, SEARCH_RESULTS.length - 1);
    highlightCursor();
  }else if(e.key === "ArrowUp"){
    e.preventDefault();
    SEARCH_CURSOR = Math.max(SEARCH_CURSOR - 1, 0);
    highlightCursor();
  }else if(e.key === "Enter"){
    if(SEARCH_CURSOR >= 0){ e.preventDefault(); selectSuggestion(SEARCH_CURSOR); }
  }else if(e.key === "Escape"){
    hideSuggestions();
  }
}

document.addEventListener("click", (ev)=>{
  const wrap = document.querySelector(".searchWrap");
  if(!wrap) return;
  if(!wrap.contains(ev.target)) hideSuggestions();
});

/* ── Audit Log ── */
async function logAudit(action, target, details){
  const db = window.VELOCI_DB;
  if(!db) return;
  await db.from('audit_log').insert({
    admin_id: ADMIN_ID,
    admin_email: ADMIN_ID,
    action,
    target: String(target||'').slice(0,100),
    details: String(details||'').slice(0,255)
  });
}

const _LOGGABLE_ACTIONS = new Set([
  'user_credit','user_debit','user_set_balance','plan_assign','user_delete',
  'plan_approve','plan_reject','plan_complete','deposit_approve','deposit_reject',
  'withdrawal_approve','withdrawal_reject','kyc_approve','kyc_reject',
  'ticket_reply','ticket_close','manual_email_send','notification_save','notification_clear',
  'user_trade_settings_update','trades_admin_create','trades_admin_delete',
  'user_crypto_credit','user_crypto_debit','user_crypto_set'
]);

const _WALLET_LOGGABLE = new Set(['wallet_link_admin_update_status']);

/* ── API ── */
async function apiCall(action, payload={}){
  if(!ADMIN_SECRET) throw new Error("Admin not connected.");
  const res = await fetch(API_URL, {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "apikey": ANON_KEY,
      "Authorization": "Bearer " + ANON_KEY,
      "x-admin-secret": ADMIN_SECRET,
      "x-admin-id": ADMIN_ID
    },
    body: JSON.stringify({ action, payload })
  });
  const raw = await res.text();
  let data;
  try{ data = JSON.parse(raw); }catch(e){ data = { success:false, error: raw }; }
  if(!res.ok || !data.success){
    setDebugBox(`HTTP ${res.status}\nAction: ${action}\nPayload: ${JSON.stringify(payload)}\nResponse: ${raw}`);
    feed("ERROR " + action + " -> HTTP " + res.status);
    throw new Error(data.error || ("HTTP " + res.status));
  }
  if(_LOGGABLE_ACTIONS.has(action)){
    const target = payload.email||payload.user_email||payload.deposit_id||payload.withdrawal_id||payload.kyc_id||payload.plan_id||payload.ticket_id||payload.id||'';
    const details = payload.amount != null ? `Amount: ${payload.amount}` : (payload.note||payload.reply||payload.message||'');
    logAudit(action.toUpperCase(), String(target), String(details)).catch(()=>{});
  }
  return data;
}

async function walletApiCall(action, bodyPayload={}){
  if(!ADMIN_SECRET) throw new Error("Admin not connected.");
  const res = await fetch(WALLET_API_URL, {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "apikey": ANON_KEY,
      "Authorization": "Bearer " + ANON_KEY,
      "x-admin-secret": ADMIN_SECRET,
      "x-admin-id": ADMIN_ID
    },
    body: JSON.stringify({ action, ...bodyPayload })
  });
  const raw = await res.text();
  let data;
  try{ data = JSON.parse(raw); }catch(e){ data = { success:false, error: raw }; }
  if(!res.ok || !data.success){
    setDebugBox(`HTTP ${res.status}\nAction: ${action}\nPayload: ${JSON.stringify(bodyPayload)}\nResponse: ${raw}`);
    feed("ERROR wallet-api " + action + " -> HTTP " + res.status);
    throw new Error(data.error || ("HTTP " + res.status));
  }
  if(_WALLET_LOGGABLE.has(action)){
    const target = bodyPayload.id||bodyPayload.user_email||'';
    const details = bodyPayload.status ? `Status: ${bodyPayload.status}` : (bodyPayload.admin_note||'');
    logAudit(action.toUpperCase(), String(target), String(details)).catch(()=>{});
  }
  return data;
}

async function siteContentCall(action, payload = {}, useAdmin = true){
  const headers = {
    "Content-Type": "application/json",
    "apikey": ANON_KEY,
    "authorization": "Bearer " + ANON_KEY
  };
  if(useAdmin){
    headers["x-admin-secret"] = ADMIN_SECRET;
    headers["x-admin-id"] = ADMIN_ID;
  }
  const res = await fetch(SITE_CONTENT_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...payload }),
    cache: "no-store"
  });
  const raw = await res.text();
  let json = {};
  try{ json = raw ? JSON.parse(raw) : {}; }catch(_){ json = { success:false, error:raw || "Invalid JSON response" }; }
  if(!res.ok || json.success === false){
    throw new Error(json.error || ("HTTP " + res.status));
  }
  return json;
}

async function safeLoad(fn){
  try{
    await fn();
    const lc = document.getElementById("lastChip");
    if(lc) lc.textContent = "LAST: " + nowStamp();
    setSysBox("OK • " + nowStamp());
  }catch(e){
    setSysBox("ERROR • " + e.message);
    modalShow("Request failed", e.message);
  }
}

/* ── Refresh ── */
function refreshVisibleOnly(){
  if(typeof loadCurrentPage === "function") loadCurrentPage();
}

function refreshAll(){
  if(typeof loadCurrentPage === "function") safeLoad(loadCurrentPage);
}

function toggleAutoRefresh(){
  AUTO_REFRESH = !AUTO_REFRESH;
  const chip = document.getElementById("autoChip");
  if(chip) chip.textContent = "AUTO: " + (AUTO_REFRESH ? "ON" : "OFF");
  if(AUTO_REFRESH){
    feed("AUTO REFRESH ON");
    AUTO_TIMER = setInterval(()=>refreshAll(), 30000);
    modalShow("Auto Refresh", "Enabled. Refreshing every 30 seconds.");
  }else{
    feed("AUTO REFRESH OFF");
    if(AUTO_TIMER){ clearInterval(AUTO_TIMER); AUTO_TIMER=null; }
    modalShow("Auto Refresh", "Disabled.");
  }
}

async function ping(){
  try{
    const res = await apiCall("ping", {});
    feed("PING OK");
    modalShow("Ping OK", JSON.stringify(res.data || {}, null, 2));
  }catch(e){
    modalShow("Ping Failed", e.message);
  }
}

/* ── Scroll handler ── */
let lastScrollTop = 0;
let topbarHidden = false;

function handleScroll(currentTop){
  const topbar = document.getElementById("topbar");
  const sidebar = document.getElementById("sidebar");
  if(sidebar && sidebar.classList.contains("open")) closeSidebar();
  if(!topbar) return;
  const delta = currentTop - lastScrollTop;
  if(Math.abs(delta) < 6) return;
  if(delta > 0){
    if(!topbarHidden){ topbar.classList.add("hide"); topbarHidden = true; }
  }else{
    if(topbarHidden){ topbar.classList.remove("hide"); topbarHidden = false; }
  }
  lastScrollTop = currentTop;
}

function attachScrollHandler(){
  const main = document.getElementById("mainScroll");
  const isMobile = window.matchMedia("(max-width:1100px)").matches;
  if(!isMobile && main){
    main.addEventListener("scroll", ()=>handleScroll(main.scrollTop), { passive:true });
  }
  if(isMobile){
    window.addEventListener("scroll", ()=>handleScroll(window.scrollY || 0), { passive:true });
  }
}

window.addEventListener('pageshow', function(e){
  if(e.persisted) closeSidebar();
});

/* ── Topbar init ── */
function initTopbar(){
  attachScrollHandler();
  const connChip = document.getElementById("connChip");
  if(connChip) connChip.textContent = "CONNECTED";
  // iOS needs touchstart (not just onclick) for reliable div tap detection
  const sideOv = document.getElementById("sideOverlay");
  if(sideOv){
    sideOv.addEventListener('touchstart', function(e){
      e.preventDefault();
      closeSidebar();
    }, {passive: false});
  }
}

/* ── Live Activity + Audit Log renders ── */
async function renderActivityLive(){
  const db = window.VELOCI_DB;
  if(!db) return;
  const el = document.getElementById('activity-feed');
  if(!el) return;
  const { data } = await db.from('audit_log').select('*').order('created_at',{ascending:false}).limit(20);
  const empty = '<div style="text-align:center;color:rgba(234,240,255,.60);padding:24px;">No recent activity</div>';
  if(!data?.length){ el.innerHTML = empty; return; }
  el.innerHTML = data.map(a=>`
    <div style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07);">
      <div style="width:32px;height:32px;border-radius:50%;background:#f05a1a;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;">
        ${(a.admin_email||'A')[0].toUpperCase()}
      </div>
      <div>
        <div style="font-size:13px;font-weight:600;">${esc(a.action)}</div>
        <div style="font-size:12px;color:rgba(234,240,255,.60);">${esc(a.details||a.target||'—')}</div>
        <div style="font-size:11px;color:rgba(234,240,255,.60);">${fmtDate(a.created_at)} · ${esc(a.admin_email||'Admin')}</div>
      </div>
    </div>`).join('');
}

async function renderAuditLive(){
  const db = window.VELOCI_DB;
  if(!db) return;
  const tbody = document.getElementById('audit-tbody');
  if(!tbody) return;
  const { data } = await db.from('audit_log').select('*').order('created_at',{ascending:false}).limit(50);
  if(!data?.length){
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:rgba(234,240,255,.60);padding:24px;">No audit entries yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(a=>`
    <tr>
      <td style="font-size:12px;">${fmtDate(a.created_at)}</td>
      <td><strong>${esc(a.admin_email||'Admin')}</strong></td>
      <td style="font-weight:600;">${esc(a.action)}</td>
      <td style="font-size:12px;">${esc(a.target||'—')}</td>
      <td style="font-size:12px;color:rgba(234,240,255,.60);">${esc(a.details||'—')}</td>
      <td style="font-size:11px;color:rgba(234,240,255,.60);">${esc(a.ip_address||'—')}</td>
    </tr>`).join('');
}

/* ── Swipe gesture (mobile sidebar) ── */
(function(){
  var s = document.createElement('script');
  s.src = '/swipe-nav-ops.js';
  document.head.appendChild(s);
})();
