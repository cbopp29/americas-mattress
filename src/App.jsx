// v2.1 - PDF parser fix, 2-route import, problems tab fix
import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nmlhuufmvvqvbyoebrwe.supabase.co";
const SUPABASE_KEY = "sb_publishable_TRQCQpgnv0NDRt7eIE6t-Q_fEINezez";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── OFFLINE SUPPORT ─────────────────────────────────────────────────────────
// Drivers lose cell service in some delivery areas. These helpers let the app
// (1) show the last-loaded data with no signal and (2) queue writes (status
// changes, notes, problems, signatures) to a local outbox that replays when the
// connection returns — replacing the paper fallback.

// localStorage cache so the driver still SEES their stops offline.
function cacheSet(key, val) {
  try { localStorage.setItem("am_cache_" + key, JSON.stringify(val)); } catch (e) {}
}
function cacheGet(key, fallback) {
  try { const v = localStorage.getItem("am_cache_" + key); return v ? JSON.parse(v) : fallback; }
  catch (e) { return fallback; }
}

// Outbox: a list of {id, table, op, payload, match} write operations that
// failed (offline) and must be retried. Persisted so a refresh doesn't lose them.
const OUTBOX_KEY = "am_outbox";
function outboxRead() {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]"); } catch (e) { return []; }
}
function outboxWrite(list) {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(list)); } catch (e) {}
}
function outboxAdd(entry) {
  const list = outboxRead();
  list.push({ id: `ob-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), ...entry });
  outboxWrite(list);
  return list.length;
}

// Run a single supabase write described by an outbox entry.
async function runWrite({ table, op, payload, match }) {
  const t = sb.from(table);
  if (op === "insert") return await t.insert(payload);
  if (op === "update") return await t.update(payload).eq(match.col, match.val);
  if (op === "delete") return await t.delete().eq(match.col, match.val);
  if (op === "upsert") return await t.upsert(payload);
  throw new Error("unknown op " + op);
}

// Try a write now; if it fails (offline/network), queue it. Returns
// { queued: boolean, pending: number }. Optimistic UI updates happen at the
// call site regardless, so the driver sees the change immediately either way.
async function tryWrite(entry) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const pending = outboxAdd(entry);
    return { queued: true, pending };
  }
  try {
    const res = await runWrite(entry);
    if (res && res.error) throw res.error;
    return { queued: false, pending: outboxRead().length };
  } catch (e) {
    const pending = outboxAdd(entry);
    return { queued: true, pending };
  }
}

// Replay everything in the outbox, oldest first. Keeps any that still fail —
// EXCEPT an entry that keeps failing while we're online is a permanent
// (bad-data / rejected) write, not a signal problem. Drop it after a few tries
// so one un-syncable write can't wedge the queue forever (which previously
// showed a stuck "N waiting to sync" and drove a constant-refresh loop).
const OUTBOX_MAX_TRIES = 5;
async function flushOutbox() {
  let list = outboxRead();
  if (!list.length) return 0;
  const remaining = [];
  let sent = 0;
  for (const entry of list) {
    try {
      const res = await runWrite(entry);
      if (res && res.error) throw res.error;
      sent++;
    } catch (e) {
      const tries = (entry.tries || 0) + 1;
      const online = typeof navigator === "undefined" || navigator.onLine !== false;
      if (online && tries >= OUTBOX_MAX_TRIES) {
        // Permanent failure — log and discard so the queue can drain.
        try { console.warn("Dropping un-syncable outbox entry after", tries, "tries:", entry, e); } catch (_) {}
      } else {
        remaining.push({ ...entry, tries });
      }
    }
  }
  outboxWrite(remaining);
  return sent;
}

const ALL_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const ROLES = ["Driver","Helper","Driver/Helper","Coordinator","Loader","Manager","Warehouse","Other"];
// ─── SMS CONFIG (Conner-only, inactive until owner approves) ─────────────────
const SMS_ENABLED = true; // ACTIVE — Twilio connected
const TWILIO_ACCOUNT_SID = "AC0169331dd3d135800b4ebeea56b2c533"; // replace with your SID
const TWILIO_AUTH_TOKEN = "0ed24a0bc2862a15d725b958644fedc0"; // replace with your token
const TWILIO_PHONE = "+15059855709"; // replace with your 505 number e.g. +15055551234
const GOOGLE_REVIEW_LINK = "https://share.google/FPhPsBEOVAtNaVbD7"; // replace with your Google review URL

// Send SMS via Twilio
async function sendSMS(to, body) {
  if (!SMS_ENABLED) {
    console.log("SMS disabled:", to, body);
    return { ok: true, preview: true };
  }
  try {
    // Route through Netlify function to avoid CORS issues
    const res = await fetch("/.netlify/functions/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, body }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("SMS error:", data);
      return { ok: false, error: data.error };
    }
    return { ok: true, sid: data.sid };
  } catch(e) {
    console.error("SMS error:", e);
    return { ok: false, error: e.message };
  }
}

// SMS Templates — Conner edits these
const DEFAULT_SMS_TEMPLATES = {
  confirmed: "Hi {name}! Your delivery from America's Mattress is scheduled for {date} between {window}. We'll call when we're on our way! Questions? Call us.",
  enroute: "Hi {name}! Your America's Mattress driver is about 30 minutes away with your {items}. Please make sure someone is home!",
  delivered: "Hi {name}! Your delivery is complete. Thank you for choosing America's Mattress Albuquerque! We'd love your feedback: {review_link}",
  rescheduled: "Hi {name}! We need to reschedule your delivery. Please call us to confirm a new time. Sorry for the inconvenience! - America's Mattress",
};

const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRUFm-Pdfi79zd08mVvDwkGRli6obO0R9d1JGJQLU6jQBKBtTmUdfOGn6TZ3QH0FA/pubhtml";
const GOOGLE_SHEET_EMBED = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRUFm-Pdfi79zd08mVvDwkGRli6obO0R9d1JGJQLU6jQBKBtTmUdfOGn6TZ3QH0FA/pubhtml?widget=true&headers=false";

const STATUS_COLORS = {
  "Scheduled":   { bg:"#1e293b", text:"#94a3b8", dot:"#64748b" },
  "In Transit":  { bg:"#0c2340", text:"#60a5fa", dot:"#3b82f6" },
  "Delivered":   { bg:"#052e16", text:"#4ade80", dot:"#22c55e" },
  "Rescheduled": { bg:"#1c1500", text:"#fbbf24", dot:"#f59e0b" },
  "Transfer":    { bg:"#1a0a2e", text:"#c084fc", dot:"#a855f7" },
  "Issue":       { bg:"#2d0a0a", text:"#f87171", dot:"#ef4444" },
};

const ESCALATION = {
  customer: ["Driver", "Conner (Manager)", "Scott / Brian / Cameron"],
  product:  ["Driver", "Conner (Manager)", "Vendor"],
};

// PINs are intentionally NOT stored here — they must never ship in the browser
// bundle. This list only seeds an empty database with names/roles; PINs are set
// by the manager in the Team tab and verified server-side (verify-pin function).
const INITIAL_EMPLOYEES = [
  { id:0, name:"Conner",        role:"Manager",       avatar:"CO", lang:"en", workdays:["Mon","Tue","Wed","Thu","Fri","Sat"], is_manager:true  },
  { id:1, name:"Frank Solís",   role:"Driver",        avatar:"FS", lang:"en", workdays:["Mon","Tue","Wed","Fri"],             is_manager:false },
  { id:2, name:"Max Applegate", role:"Driver",        avatar:"MA", lang:"en", workdays:["Mon","Tue","Wed","Fri"],             is_manager:false },
  { id:3, name:"Chris Mullis",  role:"Driver",        avatar:"CM", lang:"en", workdays:["Mon","Tue","Wed","Fri"],             is_manager:false },
  { id:4, name:"Nate",          role:"Driver/Helper", avatar:"NA", lang:"en", workdays:["Fri","Sat"],                        is_manager:false },
  { id:5, name:"Ricky Torres",  role:"Helper",        avatar:"RT", lang:"es", workdays:["Mon","Tue","Wed","Fri"],             is_manager:false },
  { id:6, name:"Aariq Curtis",  role:"Helper",        avatar:"AC", lang:"en", workdays:["Mon","Tue","Wed","Fri"],             is_manager:false },
  { id:7, name:"Alberto",       role:"Helper",        avatar:"AL", lang:"es", workdays:["Fri","Sat"],                        is_manager:false },
];

const BASE_TASKS_EN = [
  { id:"b1",  text:"Pre-trip truck inspection — tires, fluids, straps", priority:"high", category:"Prep", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b2",  text:"Load truck per manifest — verify item count and stop sequence", priority:"high", category:"Prep", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b3",  text:"Call each customer 30 min before arrival", priority:"high", category:"Delivery", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b4",  text:"Photograph each item before loading and after placement", priority:"med", category:"Delivery", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b5",  text:"Collect old mattress on all removal orders", priority:"high", category:"Delivery", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b6",  text:"Obtain customer signature on every delivery", priority:"high", category:"Delivery", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b7",  text:"Log each delivery complete in app within 5 min", priority:"med", category:"Admin", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b8",  text:"Report any delivery issues to Conner same day", priority:"high", category:"Admin", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b9",  text:"Sweep truck bed and return straps and blankets to warehouse", priority:"med", category:"EOD", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b10", text:"Organize warehouse floor — put all beds in correct locations", priority:"high", category:"Warehouse", days:["Fri"] },
  { id:"b11", text:"Update master inventory list", priority:"high", category:"Admin", days:["Fri"] },
  { id:"b12", text:"Cardboard run — break down and dispose of all cardboard", priority:"high", category:"Warehouse", days:["Fri"] },
  { id:"b13", text:"Prepare warehouse for Thursday receiving — clear floor space", priority:"high", category:"Warehouse", days:["Wed"] },
  { id:"b14", text:"Receive vendor truck — check every item against manifest", priority:"high", category:"Receiving", days:["Thu"] },
  { id:"b15", text:"Photograph any damaged items immediately", priority:"high", category:"Receiving", days:["Thu"] },
  { id:"b16", text:"Organize and label all received product by SKU/category", priority:"high", category:"Warehouse", days:["Thu"] },
  { id:"b17", text:"Update inventory after receiving is complete", priority:"high", category:"Admin", days:["Thu"] },
  { id:"b18", text:"Dispose of all Thursday receiving packaging same day", priority:"med", category:"Warehouse", days:["Thu"] },
];

const BASE_TASKS_ES = [
  { id:"b1",  text:"Inspección previa del camión — llantas, fluidos, correas", priority:"high", category:"Preparación", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b2",  text:"Cargar el camión según el manifiesto — verificar cantidad y secuencia", priority:"high", category:"Preparación", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b3",  text:"Llamar a cada cliente 30 min antes de llegar", priority:"high", category:"Entrega", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b4",  text:"Fotografiar cada artículo antes de cargar y después de colocar", priority:"med", category:"Entrega", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b5",  text:"Recoger colchón viejo en pedidos con retiro solicitado", priority:"high", category:"Entrega", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b6",  text:"Obtener firma del cliente en cada entrega", priority:"high", category:"Entrega", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b7",  text:"Registrar entrega en la aplicación dentro de 5 minutos", priority:"med", category:"Admin", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b8",  text:"Reportar cualquier problema a Conner el mismo día", priority:"high", category:"Admin", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b9",  text:"Limpiar camión y devolver correas y mantas al almacén", priority:"med", category:"Fin de Turno", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b10", text:"Organizar el almacén y guardar las camas correctamente", priority:"high", category:"Almacén", days:["Fri"] },
  { id:"b11", text:"Actualizar la lista maestra de inventario", priority:"high", category:"Admin", days:["Fri"] },
  { id:"b12", text:"Corrida de cartón — desechar todo el cartón y empaque", priority:"high", category:"Almacén", days:["Fri"] },
  { id:"b13", text:"Preparar almacén para recepción del jueves", priority:"high", category:"Almacén", days:["Wed"] },
  { id:"b14", text:"Recibir camión del proveedor — verificar contra manifiesto", priority:"high", category:"Recepción", days:["Thu"] },
  { id:"b15", text:"Fotografiar artículos dañados inmediatamente", priority:"high", category:"Recepción", days:["Thu"] },
  { id:"b16", text:"Organizar y etiquetar todo el producto recibido", priority:"high", category:"Almacén", days:["Thu"] },
  { id:"b17", text:"Actualizar inventario después de la recepción", priority:"high", category:"Admin", days:["Thu"] },
  { id:"b18", text:"Desechar empaque de recepción el mismo día", priority:"med", category:"Almacén", days:["Thu"] },
];

const todayDayName = () => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date().getDay()];
const avatarBg = (emp) => (emp?.is_manager||emp?.isManager) ? "linear-gradient(135deg,#7c3aed,#4f46e5)" : emp?.lang==="es" ? "linear-gradient(135deg,#059669,#047857)" : "linear-gradient(135deg,#1d4ed8,#0ea5e9)";

const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#080d14}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0f1923}::-webkit-scrollbar-thumb{background:#334155;border-radius:2px}
  .btn{border:none;cursor:pointer;font-family:inherit;border-radius:8px;font-weight:500;transition:all .15s}
  .btn:hover{opacity:.85}.btn:active{transform:scale(.98)}.btn:disabled{opacity:.4;cursor:not-allowed}
  .badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
  .card{background:#0f1923;border:1px solid #1e2d3d;border-radius:12px}
  .input{background:#0a1628;border:1px solid #1e2d3d;border-radius:8px;padding:9px 13px;font-size:13px;color:#e2e8f0;width:100%;font-family:inherit}
  .select{background:#0a1628;border:1px solid #1e2d3d;border-radius:8px;padding:9px 12px;font-size:13px;color:#e2e8f0;width:100%;font-family:inherit}
  .pulse{animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  .fade{animation:fadeIn .3s ease}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  input,textarea,select{font-family:inherit;color:#e2e8f0}
  /* ── Mobile Polish ── */
  @media(max-width:640px){
    /* Stack ALL grids to single column */
    [style*="grid-template-columns"] { grid-template-columns:1fr!important }
    /* Exception: status buttons stay 3-col */
    .status-grid { grid-template-columns:repeat(3,1fr)!important }
    /* Exception: stats stay 3-col */
    .stats-grid { grid-template-columns:repeat(3,1fr)!important }
    /* Tasks layout stacks */
    .tasks-layout { display:flex!important; flex-direction:column!important }
    .tasks-sidebar { display:grid!important; grid-template-columns:repeat(4,1fr)!important; gap:6px!important }
    /* Nav compact - no overflow */
    .mgr-nav { flex-wrap:wrap!important; min-width:unset!important }
    .mgr-nav button { padding:8px 6px!important; font-size:10px!important; flex-shrink:0!important }
    /* All flex rows wrap */
    [style*="display:"flex""] { flex-wrap:wrap!important }
    /* Larger touch targets */
    .btn { min-height:44px!important }
    /* Prevent iOS zoom on input focus */
    input, select, textarea { font-size:16px!important }
    /* Full padding on mobile */
    .mobile-pad { padding:12px!important }
  }
  @media(max-width:400px){
    .mgr-nav button { padding:6px 4px!important; font-size:9px!important }
  }
`;

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ employees, onLogin }) {
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const emp = employees.find(e=>e.id===sel);
    if (!emp) { setErr("Please select your name."); return; }
    setBusy(true); setErr("");
    try {
      // PIN is checked on the server so the browser never holds the real PINs.
      const res = await fetch("/.netlify/functions/verify-pin", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ empId: emp.id, pin }),
      });
      const data = await res.json();
      if (data && data.ok) { onLogin(data.employee || emp); }
      else { setErr("Wrong PIN. Try again."); setPin(""); }
    } catch(e) {
      // If the server can't be reached (offline), fall back to any locally
      // cached PIN so drivers aren't locked out in a dead zone.
      if (emp.pin && pin === emp.pin) { onLogin(emp); }
      else { setErr("Can't reach server. Check your connection."); }
    }
    setBusy(false);
  };
  return (
    <div style={{background:"#080d14",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'DM Sans',sans-serif"}}>
      <style>{GLOBAL_STYLES}</style>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:52,marginBottom:10}}>🛏</div>
          <div style={{fontWeight:800,fontSize:22,color:"#f1f5f9"}}>America's Mattress</div>
          <div style={{fontSize:13,color:"#475569",marginTop:4}}>Operations Hub · Albuquerque</div>
        </div>
        <div className="card" style={{padding:24}}>
          <div style={{fontSize:12,color:"#475569",marginBottom:10,fontWeight:600,textTransform:"uppercase",letterSpacing:".08em"}}>Who are you?</div>
          <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:18}}>
            {employees.map(emp=>(
              <button key={emp.id} className="btn" onClick={()=>{setSel(emp.id);setErr("");setPin("");}}
                style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderRadius:10,border:`1.5px solid ${sel===emp.id?"#3b82f6":"#1e2d3d"}`,background:sel===emp.id?"#0c1f38":"#0a1628",cursor:"pointer",textAlign:"left"}}>
                <div style={{width:34,height:34,borderRadius:"50%",background:avatarBg(emp),display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>{emp.avatar}</div>
                <div>
                  <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9"}}>{emp.name}{(emp.is_manager)?" 👑":""}{emp.lang==="es"?" 🇲🇽":""}</div>
                  <div style={{fontSize:11,color:"#475569"}}>{emp.role}</div>
                </div>
              </button>
            ))}
          </div>
          {sel!==null&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,color:"#475569",marginBottom:7}}>Enter your PIN</div>
              <input type="password" value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()}
                placeholder="••••" maxLength={6} className="input"
                style={{textAlign:"center",letterSpacing:10,fontSize:20,padding:"12px"}}/>
            </div>
          )}
          {err&&<div style={{color:"#f87171",fontSize:12,marginBottom:10}}>{err}</div>}
          <button className="btn" onClick={go} disabled={busy} style={{width:"100%",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:14,fontSize:15,fontWeight:700,borderRadius:10,opacity:busy?0.7:1}}>
            {busy?"Checking…":"Sign In →"}
          </button>
        </div>
        <div style={{textAlign:"center",marginTop:14,fontSize:10,color:"#1e2d3d"}}>
          America's Mattress · Albuquerque
        </div>
      </div>
    </div>
  );
}

// ─── DRIVER VIEW ──────────────────────────────────────────────────────────────
function DriverView({ user, deliveries, customTasks, baseTasks, messages, problems, employees, onStatusUpdate, onLogout, onSendMessage, onLogProblem, onSaveDelivery, onSaveSignature, smsTemplates, trainingFiles=[], completions=[], setCompletions }) {
  const [tab, setTab] = useState("deliveries");
  const [openDel, setOpenDel] = useState(null);
  const [schedDay, setSchedDay] = useState(null);
  const [taskChecks, setTaskChecks] = useState({});
  const [addingDelivery, setAddingDelivery] = useState(false);
  const [newDel, setNewDel] = useState({id:"",customer:"",address:"",phone:"",items:[{qty:1,name:""}],delivery_window:"",assigned_to:user.id,status:"Scheduled",notes:"",floor:"1",elevator:false,removal_requested:false,transfer_scheduled:false,route_notes:"",stop_order:1,delivery_date:new Date().toISOString().split("T")[0],ticket_number:"",helper_id:0});
  const [prepDate, setPrepDate] = useState(()=>{ const t=new Date(); t.setDate(t.getDate()+1); return t.toISOString().split("T")[0]; });
  const [msgInput, setMsgInput] = useState("");
  const [probInput, setProbInput] = useState({ description:"", type:"customer", customer:"", ticket_number:"" });
  const fileRef = React.useRef();
  const [uploadingFor, setUploadingFor] = useState(null);
  const [signingDel, setSigningDel] = useState(null);
  const [liabilityDel, setLiabilityDel] = useState(null);
  const [liabilityType, setLiabilityType] = useState('headboard');
  const [warrantyDel, setWarrantyDel] = useState(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const lastWriteRef = useRef(0);
  const [deliveryDetails, setDeliveryDetails] = useState({});
  const [smsReplies, setSmsReplies] = useState([]);

  // Load customer SMS replies so drivers can see what customers texted back.
  useEffect(() => {
    let active = true;
    const load = async () => {
      const r = await sb.from("sms_replies").select("*").order("id",{ascending:false}).limit(200);
      if (active && r.data) setSmsReplies(r.data);
    };
    load();
    const iv = setInterval(load, 30000);
    return () => { active = false; clearInterval(iv); };
  }, []);
  const isEs = user.lang === "es";
  const today = todayDayName();
  const isDriver = user.role.toLowerCase().includes("driver");
  const todayISOd = new Date().toISOString().split("T")[0];
  const [showPastDels, setShowPastDels] = useState(false);
  const [driverDateFilter, setDriverDateFilter] = useState(new Date().toISOString().split("T")[0]);
  const [dRv, setDRv] = useState({received_date:new Date().toISOString().split("T")[0],vendor:"",received_by:user.name,quantity:1,notes:"",manufacturer:"",items:"",bol_photo_url:""});
  const [dRvUploading, setDRvUploading] = useState(false);
  const [dRvSaved, setDRvSaved] = useState(false);
  const [dReceipt, setDReceipt] = useState({reason:"",amount:"",receipt_date:new Date().toISOString().split("T")[0],photo_url:""});
  const [dReceiptUploading, setDReceiptUploading] = useState(false);
  const [dReceiptSaved, setDReceiptSaved] = useState(false);

  const activeDate = showPastDels && driverDateFilter ? driverDateFilter : todayISOd;
  const myDeliveries = [...deliveries.filter(d=>{
    const isMine = d.assigned_to===user.id||d.helper_id===user.id;
    if(!isMine) return false;
    return (d.delivery_date||todayISOd)===activeDate;
  })].sort((a,b)=>(a.stop_order||0)-(b.stop_order||0));
  const otherDeliveries = [...deliveries.filter(d=>{
    const isMine = d.assigned_to===user.id||d.helper_id===user.id;
    if(isMine) return false;
    return (d.delivery_date||todayISOd)===activeDate;
  })].sort((a,b)=>(a.stop_order||0)-(b.stop_order||0));

  const myTasks = [
    ...(isEs ? baseTasks.es : baseTasks.en).filter(t=>t.days.includes(today)||t.days.includes("All")),
    ...(customTasks[user.id]||[]).filter(t=>t.day===today||t.day==="All"),
  ];
  const cats = [...new Set(myTasks.map(t=>t.category))];

  const sendMsg = async (deliveryId) => {
    if (!msgInput.trim()) return;
    const msg = { id:Date.now(), sender_id:user.id, sender_name:user.name, text:msgInput.trim(), delivery_id:deliveryId||null, photo_url:null, created_at:new Date().toISOString() };
    await tryWrite({ table:"messages", op:"insert", payload:msg });
    onSendMessage(msg);
    setMsgInput("");
  };

  const compressPhoto = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX=800; let w=img.width,h=img.height;
        if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}
        const canvas=document.createElement("canvas"); canvas.width=w; canvas.height=h;
        canvas.getContext("2d").drawImage(img,0,0,w,h);
        canvas.toBlob((blob)=>resolve(blob),"image/jpeg",0.75);
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  const handlePhoto = async (e, deliveryId) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingFor(deliveryId);
    try {
      const compressed = await compressPhoto(file);
      const path = `deliveries/${deliveryId}/${Date.now()}.jpg`;
      const { error } = await sb.storage.from("photos").upload(path, compressed, {contentType:"image/jpeg"});
      if (!error) {
        const url = sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
        const msg = { id:Date.now(), sender_id:user.id, sender_name:user.name, text:"📷 Photo", delivery_id:deliveryId, photo_url:url, created_at:new Date().toISOString() };
        await sb.from("messages").insert(msg);
        onSendMessage(msg);
      }
    } catch(e) { console.error(e); }
    setUploadingFor(null);
  };

  const logProb = async () => {
    if (!probInput.description.trim()) return;
    const p = { id:Date.now(), emp_name:user.name, emp_id:user.id, customer:probInput.customer||"", ticket_number:probInput.ticket_number||"", description:probInput.description, type:probInput.type, escalation_step:0, time:new Date().toLocaleDateString("en-US"), resolved:false, status:"Open" };
    await tryWrite({ table:"problems", op:"insert", payload:p });
    onLogProblem(p);
    setProbInput({ description:"", type:"customer", customer:"", ticket_number:"" });
  };

  // Live GPS tracking.
  // Uses a continuous watchPosition subscription + a screen Wake Lock so that
  // briefly switching apps (change a song, take a call) and coming back resumes
  // immediately instead of silently dropping. NOTE: phone browsers (especially
  // iOS Safari) fully suspend a web page once the app is backgrounded or the
  // screen locks, so guaranteed always-on background GPS requires a native app —
  // for continuous tracking the driver should keep this screen open.
  const pushLocation = (pos, force) => {
    const now = Date.now();
    if (!force && now - lastWriteRef.current < 12000) return; // throttle DB writes
    lastWriteRef.current = now;
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: now };
    sb.from("employees").update({ last_location: loc }).eq("id", user.id).then(()=>{});
  };

  const acquireWakeLock = async () => {
    try {
      if ("wakeLock" in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        wakeLockRef.current.addEventListener("release", () => { wakeLockRef.current = null; });
      }
    } catch (e) { /* wake lock denied (e.g. low battery) — tracking still works */ }
  };

  const beginWatch = async () => {
    if (!navigator.geolocation) return;
    await acquireWakeLock();
    navigator.geolocation.getCurrentPosition(p => pushLocation(p, true), null, { enableHighAccuracy: true });
    if (watchIdRef.current == null) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        p => pushLocation(p, false),
        err => console.warn("GPS error:", err && err.message),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
      );
    }
  };

  const startTracking = async () => {
    if (!navigator.geolocation) { alert(isEs ? "Este dispositivo no soporta ubicación." : "Location is not supported on this device."); return; }
    setTrackingActive(true);
    try { localStorage.setItem("am_tracking", "1"); } catch (e) {}
    await beginWatch();
  };

  const stopTracking = () => {
    if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    if (wakeLockRef.current) { try { wakeLockRef.current.release(); } catch (e) {} wakeLockRef.current = null; }
    setTrackingActive(false);
    try { localStorage.removeItem("am_tracking"); } catch (e) {}
  };

  // Auto-resume tracking after a reload, and re-acquire location + wake lock the
  // moment the driver returns to the app (wake locks are dropped on tab hide).
  useEffect(() => {
    let resumed = false;
    try { resumed = localStorage.getItem("am_tracking") === "1"; } catch (e) {}
    if (resumed) { setTrackingActive(true); beginWatch(); }
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        let on = false;
        try { on = localStorage.getItem("am_tracking") === "1"; } catch (e) {}
        if (on) beginWatch();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      if (wakeLockRef.current) { try { wakeLockRef.current.release(); } catch (e) {} wakeLockRef.current = null; }
    };
  }, []);

  const updateDeliveryDetail = async (delId, field, value) => {
    setDeliveryDetails(prev => ({ ...prev, [delId]: { ...(prev[delId]||{}), [field]: value } }));
    await tryWrite({ table:"deliveries", op:"update", payload:{ [field]: value }, match:{col:"id", val:delId} });
  };

  const cardStyle = {background:"#0f1923",border:"1px solid #1e2d3d",borderRadius:12};
  const inputStyle = {background:"#0a1628",border:"1px solid #1e2d3d",borderRadius:8,padding:"10px 14px",fontSize:14,color:"#e2e8f0",width:"100%",fontFamily:"inherit"};

  const renderDeliveryCard = (d, isMine) => {
    const sc=STATUS_COLORS[d.status]||STATUS_COLORS["Scheduled"];
    const isOpen=openDel===d.id;
    const dMsgs=messages.filter(m=>m.delivery_id===d.id);
    const helperEmp=employees.find(e=>e.id===d.helper_id);
    const delPhone=(d.phone||"").replace(/\D/g,"");
    const dReplies=delPhone.length>9?smsReplies.filter(r=>(r.from_number||"").replace(/\D/g,"").endsWith(delPhone.slice(-10))):[];
    return (
      <div key={d.id} style={{...cardStyle,marginBottom:12,overflow:"hidden",opacity:isMine?1:0.8}}>
        <div style={{padding:"14px 16px",cursor:"pointer"}} onClick={()=>setOpenDel(isOpen?null:d.id)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:2}}>
                <div style={{fontWeight:700,fontSize:16,color:"#f1f5f9"}}>{d.customer}</div>
                {d.ticket_number&&<span style={{fontSize:10,background:"#1e3a5f",color:"#60a5fa",borderRadius:4,padding:"1px 6px"}}>#{d.ticket_number}</span>}
                {!isMine&&<span style={{fontSize:10,background:"#1e2d3d",color:"#64748b",borderRadius:4,padding:"1px 6px"}}>Team</span>}
              </div>
              <div style={{fontSize:13,color:"#64748b"}}>{d.address}</div>
              <div style={{fontSize:13,color:"#64748b"}}>{d.phone}</div>
            </div>
            <span className="badge" style={{background:sc.bg,color:sc.text,flexShrink:0,marginLeft:8}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:sc.dot,...(d.status==="In Transit"?{animation:"pulse 2s infinite"}:{})}}/>
              {d.status}
            </span>
          </div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:8}}>
            <span style={{fontSize:12,color:"#60a5fa",background:"#0c2340",borderRadius:6,padding:"3px 9px"}}>Stop #{d.stop_order}</span>
            <span style={{fontSize:12,color:"#a78bfa",background:"#1e1038",borderRadius:6,padding:"3px 9px"}}>{d.delivery_window}</span>
            {d.removal_requested&&<span style={{fontSize:12,color:"#f59e0b",background:"#1c1500",borderRadius:6,padding:"3px 9px"}}>♻️ {isEs?"Retiro":"Removal"}</span>}
            {d.floor&&d.floor!=="1"&&<span style={{fontSize:12,color:"#60a5fa",background:"#0a1628",borderRadius:6,padding:"3px 9px"}}>{d.elevator?"🛗":"🪜"} {isEs?"Piso":"Fl"} {d.floor}</span>}
            {helperEmp&&helperEmp.id!==0&&<span style={{fontSize:12,color:"#94a3b8",background:"#1e2d3d",borderRadius:6,padding:"3px 9px"}}>+ {helperEmp.name}</span>}
          </div>
          {(d.items||[]).map((item,i)=>(
            <div key={i} style={{marginBottom:6}}>
              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <span style={{background:"#1e2d3d",color:"#60a5fa",borderRadius:5,padding:"1px 7px",fontSize:12,fontWeight:700}}>{item.qty}x</span>
                <span style={{fontSize:13,color:"#e2e8f0"}}>{item.name}</span>
              </div>
              {i===0&&(d.manufacturer||d.piece_number)&&(
                <div style={{display:"flex",gap:6,marginTop:3,paddingLeft:30}}>
                  {d.manufacturer&&<span style={{fontSize:11,color:"#60a5fa"}}>{d.manufacturer}</span>}
                  {d.piece_number&&<span style={{fontSize:11,color:"#475569"}}>#{d.piece_number}</span>}
                </div>
              )}
            </div>
          ))}
          {d.notes&&<div style={{fontSize:12,color:"#f59e0b",marginTop:8,background:"#1c1500",borderRadius:6,padding:"4px 8px"}}>⚠️ {d.notes}</div>}
          <div style={{fontSize:11,color:"#475569",marginTop:8,textAlign:"right"}}>{isOpen?"▲ Collapse":"▼ Expand"}</div>
        </div>
        {isOpen&&isMine&&(
          <div style={{borderTop:"1px solid #1e2d3d"}}>
            {d.route_notes&&(
              <div style={{padding:"12px 16px",borderBottom:"1px solid #131f2e"}}>
                <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>🗺 {isEs?"Notas de Ruta":"Route Notes"}</div>
                <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.6}}>{d.route_notes}</div>
              </div>
            )}
            {d.address&&(
              <div style={{borderBottom:"1px solid #131f2e"}}>
                <iframe title={`map-${d.id}`} width="100%" height="180" style={{border:0,display:"block"}} loading="lazy"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(d.address)}&output=embed&z=15`}/>
              </div>
            )}
            {d.address&&(
              <div style={{padding:"10px 16px",borderBottom:"1px solid #131f2e"}}>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d.address)}`} target="_blank" rel="noreferrer"
                  style={{display:"block",background:"#1e3a5f",color:"#60a5fa",borderRadius:8,padding:"11px",textAlign:"center",fontSize:14,fontWeight:700,textDecoration:"none"}}>
                  📍 {isEs?"Navegar con Google Maps":"Navigate with Google Maps"}
                </a>
              </div>
            )}
            <div style={{padding:"10px 16px",borderBottom:"1px solid #131f2e"}}>
              <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:".07em",marginBottom:7}}>{isEs?"Formularios de Responsabilidad":"Liability Forms"}</div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                <button className="btn" onClick={()=>{setLiabilityType("headboard");setLiabilityDel(d);}}
                  style={{flex:1,background:"#1e3a5f",color:"#60a5fa",padding:"9px 8px",fontSize:12,fontWeight:600}}>
                  🔧 {isEs?"Perforar Cabecera":"Headboard Drilling"}
                </button>
                <button className="btn" onClick={()=>{setLiabilityType("furniture");setLiabilityDel(d);}}
                  style={{flex:1,background:"#1e1038",color:"#c084fc",padding:"9px 8px",fontSize:12,fontWeight:600}}>
                  🛋️ {isEs?"Mover Muebles":"Move Furniture"}
                </button>
              </div>
            </div>
            <div style={{padding:"12px 16px",borderBottom:"1px solid #131f2e"}}>
              <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>{isEs?"Actualizar Estado":"Update Status"}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:d.status!=="Delivered"?10:0}}>
                {Object.keys(STATUS_COLORS).map(s=>(
                  <button key={s} className="btn" onClick={()=>onStatusUpdate(d.id,s)}
                    style={{background:d.status===s?STATUS_COLORS[s].bg:"#0a1628",color:d.status===s?STATUS_COLORS[s].text:"#475569",border:`1px solid ${d.status===s?STATUS_COLORS[s].dot:"#1e2d3d"}`,padding:"9px 4px",fontSize:11}}>
                    {s}
                  </button>
                ))}
              </div>
              {d.phone&&(
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>{isEs?"Notificar Cliente":"Notify Customer"}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {[
                      {key:"confirmed",label:"✅ "+(isEs?"Confirmar Entrega":"Confirm Delivery"),bg:"linear-gradient(135deg,#059669,#047857)"},
                      {key:"enroute",label:"🚛 "+(isEs?"En Camino (30 min)":"On The Way (30 min)"),bg:"linear-gradient(135deg,#0ea5e9,#0284c7)"},
                      {key:"delivered",label:"📦 "+(isEs?"Entregado + Reseña":"Delivered + Review"),bg:"linear-gradient(135deg,#7c3aed,#4f46e5)"},
                      {key:"rescheduled",label:"📅 "+(isEs?"Reprogramar":"Reschedule"),bg:"linear-gradient(135deg,#d97706,#b45309)"},
                    ].map(btn=>(
                      <button key={btn.key} className="btn" onClick={async()=>{
                        const name=d.customer.split(" ")[0];
                        const items=(d.items||[]).map(i=>i.name).join(", ");
                        const msg=(smsTemplates?.[btn.key]||"")
                          .replace("{name}",name)
                          .replace("{items}",items)
                          .replace("{date}",d.delivery_date||"today")
                          .replace("{window}",d.delivery_window||"your scheduled window")
                          .replace("{review_link}",GOOGLE_REVIEW_LINK||"");
                        let ph = (d.phone||"").replace(/\D/g,"");
                        if(ph.length===10) ph="+1"+ph; else if(ph.length===11) ph="+"+ph; else ph="+1"+ph;
                        const r = await sendSMS(ph, msg);
                        if(r?.ok) alert("✅ SMS sent!"); else alert("❌ SMS failed: "+(r?.error||"check Twilio"));
                      }} style={{width:"100%",background:btn.bg,color:"#fff",padding:"10px",fontSize:12,fontWeight:600}}>
                        {btn.label}
                      </button>
                    ))}
                    {trackingActive&&(
                      <button className="btn" onClick={async()=>{
                        const myRoute=(myDeliveries[0]?.route_number||1);const trackUrl=`https://americasmattress.netlify.app/track/${user.id}-r${myRoute}`;
                        const msg = "Track your America's Mattress delivery live: "+trackUrl;
                        const r = await sendSMS(d.phone, msg);
                        alert(r?.ok?"✅ Tracking link sent!":"❌ SMS failed");
                      }} style={{width:"100%",background:"#0a1628",color:"#4ade80",padding:"10px",fontSize:12,fontWeight:600,border:"1px solid #22c55e"}}>
                        📍 Send Live Tracking Link
                      </button>
                    )}
                  </div>
                </div>
              )}
              {!d.signature_url?(
                <button className="btn" onClick={()=>setSigningDel(d)}
                  style={{width:"100%",background:"linear-gradient(135deg,#059669,#047857)",color:"#fff",padding:"11px",fontSize:14,fontWeight:700}}>
                  ✍️ {isEs?"Obtener Firma del Cliente":"Get Customer Signature"}
                </button>
              ):(
                <div>
                  <div style={{background:"#052e16",borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <span style={{fontSize:13,color:"#4ade80",fontWeight:600}}>✅ {isEs?"Firmado":"Signed"}</span>
                    <span style={{fontSize:11,color:"#475569"}}>{new Date(d.signed_at).toLocaleString()}</span>
                  </div>
                  <button className="btn" onClick={()=>{
                    // Generate delivery record as printable HTML page
                    const items = (d.items||[]).map(i=>`<li>${i.qty}x ${i.name}</li>`).join("");
                    const checks = d.checklist||{};
                    const html = `<!DOCTYPE html><html><head><title>Delivery Record #${d.ticket_number||d.id}</title>
                    <style>body{font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:20px;color:#111}
                    h1{font-size:20px;margin-bottom:4px}h2{font-size:15px;color:#444;margin:16px 0 6px}
                    .logo{font-size:24px;font-weight:800;margin-bottom:4px}.sub{color:#666;font-size:12px;margin-bottom:20px}
                    table{width:100%;border-collapse:collapse}td,th{padding:8px;border:1px solid #ddd;font-size:13px}
                    th{background:#f5f5f5}.sig{border:1px solid #999;padding:6px;margin-top:8px}
                    img{max-width:300px;height:80px;object-fit:contain}.footer{font-size:10px;color:#999;margin-top:30px;text-align:center}
                    </style></head><body>
                    <div class="logo">🛏 America's Mattress</div>
                    <div class="sub">Albuquerque, NM · Delivery Record</div>
                    <h2>Delivery Information</h2>
                    <table><tr><th>Customer</th><td>${d.customer}</td></tr>
                    <tr><th>Address</th><td>${d.address}</td></tr>
                    <tr><th>Phone</th><td>${d.phone||"—"}</td></tr>
                    <tr><th>Ticket #</th><td>${d.ticket_number||"—"}</td></tr>
                    <tr><th>Date</th><td>${d.delivery_date||"—"}</td></tr>
                    <tr><th>Driver</th><td>${user.name}</td></tr>
                    <tr><th>Time In</th><td>${d.driver_time_in||"—"}</td></tr>
                    <tr><th>Time Out</th><td>${d.driver_time_out||"—"}</td></tr>
                    <tr><th>Mileage</th><td>${d.mileage_start||"—"} → ${d.mileage_end||"—"}</td></tr>
                    <tr><th>Haul Offs</th><td>${d.haul_off_count||0}</td></tr>
                    <tr><th>Manufacturer</th><td>${d.manufacturer||"—"}</td></tr>
                    <tr><th>Piece #</th><td>${d.piece_number||"—"}</td></tr></table>
                    <h2>Items Delivered</h2><ul>${items}</ul>
                    <h2>Customer Checklist</h2>
                    <table><tr><th>Item</th><th>Response</th></tr>
                    <tr><td>Bed in correct spot</td><td>${checks.correct_spot||"—"}</td></tr>
                    <tr><td>Correct height</td><td>${checks.correct_height||"—"}</td></tr>
                    <tr><td>All questions answered</td><td>${checks.questions_answered||"—"}</td></tr>
                    <tr><td>Adjustable base explained</td><td>${checks.adjustable_explained||"—"}</td></tr></table>
                    <h2>Customer Signature</h2>
                    <div class="sig">${d.signature_url?`<img src="${d.signature_url}" alt="signature"/>`:"No signature"}</div>
                    <p style="font-size:12px">Signed by: ${d.signed_by||"—"} · ${d.signed_at?new Date(d.signed_at).toLocaleString():"—"}</p>
                    <div class="footer">America's Mattress Albuquerque · Generated ${new Date().toLocaleString()}</div>
                    </body></html>`;
                    const w = window.open("","_blank");
                    w.document.write(html);
                    w.document.close();
                    w.print();
                  }} style={{width:"100%",background:"#1e3a5f",color:"#60a5fa",padding:"9px",fontSize:12,fontWeight:600}}>
                    📄 {isEs?"Guardar Registro de Entrega":"Save / Print Delivery Record"}
                  </button>
                </div>
              )}
            </div>
            {dReplies.length>0&&(
              <div style={{padding:"12px 16px",borderBottom:"1px solid #131f2e"}}>
                <div style={{fontSize:11,color:"#22c55e",textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>💬 {isEs?"Respuestas del Cliente":"Customer Replies"}</div>
                {dReplies.map(r=>(
                  <div key={r.id} style={{background:"#0a1628",borderRadius:7,padding:"8px 11px",marginBottom:6,borderLeft:"3px solid #22c55e"}}>
                    <div style={{fontSize:10,color:"#475569",marginBottom:2}}>{r.from_number} · {new Date(r.received_at||r.created_at||Date.now()).toLocaleString()}</div>
                    <div style={{fontSize:13,color:"#e2e8f0"}}>{r.body}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{padding:"12px 16px",borderBottom:"1px solid #131f2e"}}>
              <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>{isEs?"Subir Foto":"Upload Photo"}</div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={e=>handlePhoto(e,d.id)} style={{display:"none"}}/>
              <button className="btn" onClick={()=>fileRef.current.click()} disabled={uploadingFor===d.id}
                style={{width:"100%",background:"#1e3a5f",color:"#60a5fa",padding:"11px",fontSize:14,fontWeight:700}}>
                {uploadingFor===d.id?"⏳ Uploading...":"📷 "+(isEs?"Tomar / Subir Foto":"Take / Upload Photo")}
              </button>
              {dMsgs.filter(m=>m.photo_url).map(m=>(
                <img key={m.id} src={m.photo_url} alt="delivery" style={{width:"100%",borderRadius:8,marginTop:8,maxHeight:220,objectFit:"cover"}}/>
              ))}
            </div>
            <div style={{padding:"12px 16px"}}>
              <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>{isEs?"Notas de Entrega":"Delivery Notes"}</div>
              {dMsgs.filter(m=>!m.photo_url).map(m=>(
                <div key={m.id} style={{background:"#0a1628",borderRadius:7,padding:"8px 11px",marginBottom:6}}>
                  <div style={{fontSize:10,color:"#475569",marginBottom:2}}>{m.sender_name} · {new Date(m.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                  <div style={{fontSize:13,color:"#e2e8f0"}}>{m.text}</div>
                </div>
              ))}
              <div style={{display:"flex",gap:8,marginTop:6}}>
                <input value={msgInput} onChange={e=>setMsgInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg(d.id)}
                  placeholder={isEs?"Añadir nota...":"Add a note..."} style={inputStyle}/>
                <button className="btn" onClick={()=>sendMsg(d.id)} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"10px 16px",fontSize:14,fontWeight:600,flexShrink:0}}>Send</button>
              </div>
            </div>

            {/* DELIVERY DETAILS — Time, Mileage, Haul Offs, Manufacturer */}
            <div style={{padding:"12px 16px",borderTop:"1px solid #1e2d3d"}}>
              <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:".07em",marginBottom:10}}>📋 {isEs?"Detalles de Entrega":"Delivery Details"}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>{isEs?"Hora de Entrada":"Time In"}</div>
                  <input type="time" defaultValue={d.driver_time_in||""} onBlur={e=>updateDeliveryDetail(d.id,"driver_time_in",e.target.value)}
                    style={{...inputStyle,colorScheme:"dark"}}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>{isEs?"Hora de Salida":"Time Out"}</div>
                  <input type="time" defaultValue={d.driver_time_out||""} onBlur={e=>updateDeliveryDetail(d.id,"driver_time_out",e.target.value)}
                    style={{...inputStyle,colorScheme:"dark"}}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>{isEs?"Millaje Inicio":"Mileage Start"}</div>
                  <input type="number" defaultValue={d.mileage_start||""} onBlur={e=>updateDeliveryDetail(d.id,"mileage_start",Number(e.target.value))}
                    placeholder="e.g. 45230" style={inputStyle}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>{isEs?"Millaje Final":"Mileage End"}</div>
                  <input type="number" defaultValue={d.mileage_end||""} onBlur={e=>updateDeliveryDetail(d.id,"mileage_end",Number(e.target.value))}
                    placeholder="e.g. 45267" style={inputStyle}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>{isEs?"# Retiros":"# Haul Offs"}</div>
                  <input type="number" min="0" defaultValue={d.haul_off_count||0} onBlur={e=>updateDeliveryDetail(d.id,"haul_off_count",Number(e.target.value))}
                    style={inputStyle}/>
                </div>
              </div>
            </div>

            {/* CUSTOMER CHECKLIST */}
            <div style={{padding:"12px 16px",borderTop:"1px solid #1e2d3d"}}>
              <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:".07em",marginBottom:10}}>✅ {isEs?"Lista de Verificación":"Customer Checklist"}</div>
              {(()=>{
                const checks = (deliveryDetails[d.id]?.checklist) || (d.checklist) || {};
                const questions = [
                  {key:"correct_spot",label:isEs?"¿Cama en el lugar correcto?":"Bed in correct spot?"},
                  {key:"correct_height",label:isEs?"¿Altura correcta?":"Correct height?"},
                  {key:"questions_answered",label:isEs?"¿Preguntas respondidas?":"All questions answered?"},
                  {key:"adjustable_explained",label:isEs?"¿Base ajustable explicada?":"Adjustable base operations explained?"},
                ];
                return questions.map(q=>(
                  <div key={q.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #131f2e"}}>
                    <span style={{fontSize:13,color:"#e2e8f0",flex:1,paddingRight:8}}>{q.label}</span>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      {["Yes","No","N/A"].map(v=>(
                        <button key={v} className="btn" onClick={async()=>{
                          const newChecks={...checks,[q.key]:v};
                          setDeliveryDetails(prev=>({...prev,[d.id]:{...(prev[d.id]||{}),checklist:newChecks}}));
                          setDeliveries(prev=>prev.map(x=>x.id===d.id?{...x,checklist:newChecks}:x));
                          await tryWrite({ table:"deliveries", op:"update", payload:{checklist:newChecks}, match:{col:"id", val:d.id} });
                        }} style={{padding:"7px 12px",fontSize:12,fontWeight:600,background:checks[q.key]===v?(v==="Yes"?"#052e16":v==="No"?"#2d0a0a":"#1e2d3d"):"#0a1628",color:checks[q.key]===v?(v==="Yes"?"#4ade80":v==="No"?"#f87171":"#94a3b8"):"#475569",border:`2px solid ${checks[q.key]===v?(v==="Yes"?"#22c55e":v==="No"?"#ef4444":"#334155"):"#1e2d3d"}`}}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* WARRANTY INSPECTION */}
            <div style={{padding:"12px 16px",borderTop:"1px solid #1e2d3d"}}>
              <div style={{fontSize:11,color:"#f59e0b",textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>🔍 {isEs?"Inspección de Garantía":"Warranty Inspection"}</div>
              <button className="btn" onClick={()=>setWarrantyDel(d)}
                style={{width:"100%",background:"linear-gradient(135deg,#d97706,#b45309)",color:"#fff",padding:"10px",fontSize:13,fontWeight:600}}>
                📸 {isEs?"Abrir Inspector de Garantía":"Open Warranty Inspector"}
              </button>
              {d.warranty_photos&&Object.keys(d.warranty_photos).length>0&&(
                <div style={{fontSize:11,color:"#4ade80",marginTop:6}}>✅ {Object.keys(d.warranty_photos).length} warranty photos saved</div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{background:"#080d14",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'DM Sans',sans-serif",maxWidth:640,margin:"0 auto"}}>
      {liabilityDel&&(
        <LiabilityPad
          delivery={liabilityDel}
          user={user}
          formType={liabilityType}
          isEs={isEs}
          onClose={()=>setLiabilityDel(null)}
          onSigned={(record)=>{
            setLiabilityDel(null);
          }}
        />
      )}
      {/* Live tracking toggle bar */}
      <div style={{background:trackingActive?"#052e16":"#0a1628",borderBottom:"1px solid #1e2d3d",padding:"8px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:11,color:trackingActive?"#4ade80":"#475569"}}>
          {trackingActive?"📍 Tracking Active — Customer can see your location":"📍 Tracking Off"}
        </div>
        <button className="btn" onClick={trackingActive?stopTracking:startTracking}
          style={{background:trackingActive?"#dc2626":"#059669",color:"#fff",padding:"5px 12px",fontSize:11,fontWeight:600}}>
          {trackingActive?"Stop Tracking":"Start Tracking"}
        </button>
      </div>

      {warrantyDel&&(
        <WarrantyInspector
          delivery={warrantyDel}
          user={user}
          onClose={()=>setWarrantyDel(null)}
          onSaved={(photos)=>{
            updateDeliveryDetail(warrantyDel.id,"warranty_photos",photos);
            setWarrantyDel(null);
          }}
          isEs={isEs}
        />
      )}
      {signingDel&&(
        <SignaturePad
          delivery={signingDel}
          user={user}
          isEs={isEs}
          onClose={()=>setSigningDel(null)}
          onSigned={(url,at,signedBy)=>{
            onStatusUpdate(signingDel.id,"Delivered");
            onSaveSignature(signingDel.id, url, at, signedBy);
            setSigningDel(null);
          }}
        />
      )}
      <style>{GLOBAL_STYLES}</style>
      <div style={{background:"#0a1628",borderBottom:"1px solid #1e2d3d",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:"50%",background:avatarBg(user),display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff"}}>{user.avatar}</div>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>{user.name}</div>
            <div style={{fontSize:11,color:"#475569"}}>{user.role}</div>
          </div>
        </div>
        <button className="btn" onClick={onLogout} style={{background:"#1e2d3d",color:"#64748b",padding:"6px 12px",fontSize:12}}>Sign Out</button>
      </div>
      <div style={{display:"flex",background:"#0a1628",borderBottom:"1px solid #1e2d3d",overflowX:"auto"}}>
        {[
          {key:"deliveries",label:isEs?"Entregas":"Deliveries",icon:"🚛"},
          {key:"tasks",label:isEs?"Tareas":"Tasks",icon:"✅"},
          {key:"messages",label:isEs?"Mensajes":"Messages",icon:"💬"},
          {key:"replies",label:isEs?"Respuestas":"Replies",icon:"📩"},
          {key:"problems",label:isEs?"Problemas":"Problems",icon:"⚠️"},
          {key:"dashboard",label:isEs?"Inicio":"Dashboard",icon:"⬛"},
          {key:"inventory",label:isEs?"Inventario":"Inventory",icon:"📦"},
          {key:"schedule",label:isEs?"Horario":"Schedule",icon:"📅"},
          {key:"prep",label:isEs?"Prep":"Prep",icon:"📋"},
          {key:"inspection",label:isEs?"Inspección":"Inspect",icon:"🔍"},
          {key:"receiving",label:isEs?"Recibir":"Receiving",icon:"📬"},
          {key:"training-view",label:isEs?"Entren.":"Training",icon:"🎬"},
          {key:"receipts-submit",label:isEs?"Recibo":"Receipt",icon:"🧾"},
        ].map(t=>(
          <button key={t.key} className="btn" onClick={()=>setTab(t.key)}
            style={{flexShrink:0,padding:"12px 10px",fontSize:11,fontWeight:600,color:tab===t.key?"#60a5fa":"#64748b",borderBottom:tab===t.key?"2px solid #3b82f6":"2px solid transparent",background:"none",borderRadius:0,textAlign:"center",minWidth:60}}>
            <div style={{fontSize:16}}>{t.icon}</div>
            <div>{t.label}</div>
          </button>
        ))}
      </div>
      <div style={{padding:14}}>

        {tab==="deliveries"&&(
          <div>
            {isDriver&&(
              <div style={{marginBottom:12}}>
                {!addingDelivery?(
                  <button className="btn" onClick={()=>setAddingDelivery(true)}
                    style={{width:"100%",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"11px",fontSize:14,fontWeight:700}}>
                    ➕ {isEs?"Añadir Entrega":"Add Delivery"}
                  </button>
                ):(
                  <div style={{...cardStyle,padding:14,borderColor:"#3b82f6"}}>
                    <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9",marginBottom:12}}>➕ {isEs?"Nueva Entrega":"New Delivery"}</div>
                    {[{l:"Ticket #",f:"ticket_number",ph:"e.g. 1042",tp:"text"},{l:isEs?"Cliente":"Customer",f:"customer",ph:"John Smith",tp:"text"},{l:isEs?"Dirección":"Address",f:"address",ph:"123 Main St",tp:"text"},{l:isEs?"Teléfono":"Phone",f:"phone",ph:"505-555-0100",tp:"text"},{l:isEs?"Ventana de Tiempo":"Time Window",f:"delivery_window",ph:"9AM-11AM",tp:"text"},{l:isEs?"Piso":"Floor",f:"floor",ph:"1",tp:"text"},{l:isEs?"Fecha":"Date",f:"delivery_date",ph:"",tp:"date"}].map(x=>(
                      <div key={x.f} style={{marginBottom:9}}>
                        <div style={{fontSize:11,color:"#475569",marginBottom:3}}>{x.l}</div>
                        <input type={x.tp} value={newDel[x.f]||""} onChange={e=>setNewDel(p=>({...p,[x.f]:e.target.value}))} placeholder={x.ph} style={{...inputStyle,colorScheme:"dark"}}/>
                      </div>
                    ))}
                    <div style={{marginBottom:9}}>
                      <div style={{fontSize:11,color:"#475569",marginBottom:5}}>{isEs?"Artículos":"Items"}</div>
                      {(newDel.items||[]).map((item,idx)=>(
                        <div key={idx} style={{display:"flex",gap:7,marginBottom:7}}>
                          <input type="number" min="1" value={item.qty} onChange={e=>{const items=[...newDel.items];items[idx]={...items[idx],qty:Number(e.target.value)};setNewDel(p=>({...p,items}));}} style={{...inputStyle,width:60,textAlign:"center"}}/>
                          <input value={item.name} onChange={e=>{const items=[...newDel.items];items[idx]={...items[idx],name:e.target.value};setNewDel(p=>({...p,items}));}} placeholder={isEs?"Nombre":"Item name"} style={{...inputStyle,flex:1}}/>
                          {newDel.items.length>1&&<button className="btn" onClick={()=>setNewDel(p=>({...p,items:p.items.filter((_,i)=>i!==idx)}))} style={{background:"#2d0a0a",color:"#f87171",padding:"7px 9px",fontSize:12}}>✕</button>}
                        </div>
                      ))}
                      <button className="btn" onClick={()=>setNewDel(p=>({...p,items:[...p.items,{qty:1,name:""}]}))} style={{background:"#1e2d3d",color:"#60a5fa",padding:"5px 11px",fontSize:11}}>➕ {isEs?"Añadir":"Add Item"}</button>
                    </div>
                    <div style={{marginBottom:9}}>
                      <div style={{fontSize:11,color:"#475569",marginBottom:3}}>{isEs?"Notas de Ruta":"Route Notes"}</div>
                      <textarea value={newDel.route_notes||""} onChange={e=>setNewDel(p=>({...p,route_notes:e.target.value}))} rows={2} style={{...inputStyle,resize:"vertical"}}/>
                    </div>
                    <div style={{display:"flex",gap:14,marginBottom:12,flexWrap:"wrap"}}>
                      {[{l:isEs?"Elevador":"Elevator",f:"elevator"},{l:isEs?"Retiro":"Removal",f:"removal_requested"}].map(x=>(
                        <label key={x.f} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13,color:"#94a3b8"}}>
                          <input type="checkbox" checked={!!newDel[x.f]} onChange={e=>setNewDel(p=>({...p,[x.f]:e.target.checked}))} style={{width:16,height:16}}/>{x.l}
                        </label>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button className="btn" onClick={async()=>{
                        await onSaveDelivery(newDel);
                        setAddingDelivery(false);
                        setNewDel({id:"",customer:"",address:"",phone:"",items:[{qty:1,name:""}],delivery_window:"",assigned_to:user.id,status:"Scheduled",notes:"",floor:"1",elevator:false,removal_requested:false,transfer_scheduled:false,route_notes:"",stop_order:1,delivery_date:new Date().toISOString().split("T")[0],ticket_number:"",helper_id:0});
                      }} style={{flex:1,background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"11px",fontSize:14,fontWeight:700}}>
                        💾 {isEs?"Guardar":"Save"}
                      </button>
                      <button className="btn" onClick={()=>setAddingDelivery(false)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"11px 16px",fontSize:13}}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
              <div style={{fontSize:11,color:"#22c55e",fontWeight:700,letterSpacing:".07em",textTransform:"uppercase"}}>
                ✅ {isEs?"Mis Entregas":"My Deliveries"} ({myDeliveries.length})
              </div>
              <div style={{display:"flex",gap:5,alignItems:"center"}}>
                <input type="date" value={showPastDels&&driverDateFilter?driverDateFilter:todayISOd}
                  onChange={e=>{setDriverDateFilter(e.target.value);setShowPastDels(e.target.value!==todayISOd);}}
                  style={{background:"#1e2d3d",color:"#94a3b8",border:"1px solid #1e2d3d",borderRadius:6,padding:"3px 7px",fontSize:11,colorScheme:"dark"}}/>
                {showPastDels&&<button className="btn" onClick={()=>{setShowPastDels(false);setDriverDateFilter(todayISOd);}} style={{background:"#1e2d3d",color:"#60a5fa",padding:"3px 8px",fontSize:10}}>Today</button>}
              </div>
            </div>
            {myDeliveries.map(d=>renderDeliveryCard(d,true))}
            {otherDeliveries.length>0&&(
              <div style={{marginTop:16}}>
                <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:".07em",textTransform:"uppercase",marginBottom:8}}>👥 {isEs?"Entregas del Equipo":"Team Deliveries"} ({otherDeliveries.length})</div>
                {otherDeliveries.map(d=>renderDeliveryCard(d,false))}
              </div>
            )}
            {myDeliveries.length===0&&otherDeliveries.length===0&&(
              <div style={{...cardStyle,padding:40,textAlign:"center",color:"#475569",marginTop:16}}>
                <div style={{fontSize:36,marginBottom:8}}>🚛</div>
                <div>{isEs?"No hay entregas hoy.":"No deliveries today."}</div>
              </div>
            )}
          </div>
        )}

        {tab==="tasks"&&(
          <div>
            {cats.length===0?(
              <div style={{...cardStyle,padding:40,textAlign:"center",color:"#475569"}}>
                <div style={{fontSize:36,marginBottom:8}}>✅</div>
                <div>{isEs?"No hay tareas para hoy.":"No tasks for today."}</div>
              </div>
            ):(
              cats.map(cat=>(
                <div key={cat} style={{...cardStyle,marginBottom:12,overflow:"hidden"}}>
                  <div style={{padding:"9px 16px",background:"#0a1628",fontSize:10,fontWeight:700,letterSpacing:".1em",color:"#475569",textTransform:"uppercase"}}>{cat}</div>
                  {myTasks.filter(t=>t.category===cat).map((task,i)=>(
                    <div key={task.id||i} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"13px 16px",borderTop:"1px solid #131f2e"}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:task.priority==="high"?"#ef4444":task.priority==="med"?"#f59e0b":"#475569",marginTop:6,flexShrink:0}}/>
                      <div style={{fontSize:14,color:"#e2e8f0",lineHeight:1.5}}>{task.text}</div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {tab==="messages"&&(
          <div style={{...cardStyle,padding:14}}>
            <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9",marginBottom:12}}>💬 {isEs?"Canal del Equipo":"Team Channel"}</div>
            <div style={{maxHeight:420,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
              {messages.filter(m=>!m.delivery_id).length===0&&(
                <div style={{color:"#475569",fontSize:13,textAlign:"center",padding:24}}>{isEs?"Sin mensajes todavía.":"No messages yet."}</div>
              )}
              {messages.filter(m=>!m.delivery_id).map(m=>(
                <div key={m.id} style={{background:m.sender_id===user.id?"#0c1f38":"#0a1628",borderRadius:8,padding:"10px 13px",maxWidth:"85%",alignSelf:m.sender_id===user.id?"flex-end":"flex-start"}}>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>{m.sender_name} · {new Date(m.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                  {m.photo_url&&<img src={m.photo_url} alt="" style={{width:"100%",borderRadius:6,marginBottom:4,maxHeight:150,objectFit:"cover"}}/>}
                  <div style={{fontSize:14,color:"#e2e8f0"}}>{m.text}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <input value={msgInput} onChange={e=>setMsgInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg(null)}
                placeholder={isEs?"Mensaje al equipo...":"Message the team..."} style={inputStyle}/>
              <button className="btn" onClick={()=>sendMsg(null)} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"10px 16px",fontSize:14,fontWeight:600,flexShrink:0}}>Send</button>
            </div>
          </div>
        )}

        {tab==="replies"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>📩 {isEs?"Respuestas de Clientes":"Customer Replies"}</div>
                <div style={{fontSize:12,color:"#475569",marginTop:2}}>{smsReplies.length} {smsReplies.length===1?(isEs?"respuesta":"reply"):(isEs?"respuestas":"replies")}</div>
              </div>
              <button className="btn" onClick={async()=>{
                const r=await sb.from("sms_replies").select("*").order("id",{ascending:false}).limit(200);
                if(r.data)setSmsReplies(r.data);
              }} style={{background:"#1e2d3d",color:"#60a5fa",padding:"7px 13px",fontSize:12,fontWeight:600,flexShrink:0}}>🔄 {isEs?"Actualizar":"Refresh"}</button>
            </div>
            {smsReplies.length===0?(
              <div style={{...cardStyle,padding:32,textAlign:"center",color:"#475569"}}>
                <div style={{fontSize:32,marginBottom:8}}>📩</div>
                <div>{isEs?"No hay respuestas de clientes todavía.":"No customer replies yet."}</div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {smsReplies.map(r=>{
                  const from=(r.from_number||"").replace(/\D/g,"");
                  const matchedDel=deliveries.find(d=>{
                    const phone=(d.phone||"").replace(/\D/g,"");
                    return phone.length>9&&from.endsWith(phone.slice(-10));
                  });
                  const mine=matchedDel&&(matchedDel.assigned_to===user.id||matchedDel.helper_id===user.id);
                  return(
                    <div key={r.id} style={{...cardStyle,padding:"13px 15px",borderLeft:mine?"3px solid #22c55e":cardStyle.border}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6,flexWrap:"wrap",gap:6}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:13,color:"#f1f5f9"}}>{matchedDel?matchedDel.customer:(r.customer_name||r.from_number)}{mine&&<span style={{fontSize:10,background:"#052e16",color:"#4ade80",borderRadius:4,padding:"1px 6px",marginLeft:6}}>{isEs?"Tu entrega":"Your stop"}</span>}</div>
                          <div style={{fontSize:11,color:"#475569"}}>{r.from_number}</div>
                        </div>
                        <span style={{fontSize:11,color:"#475569"}}>{new Date(r.received_at||r.created_at||Date.now()).toLocaleString()}</span>
                      </div>
                      <div style={{fontSize:14,color:"#e2e8f0",background:"#0a1628",borderRadius:8,padding:"10px 12px",lineHeight:1.5}}>{r.body}</div>
                      {matchedDel&&<div style={{fontSize:11,color:"#60a5fa",marginTop:6}}>📦 {matchedDel.address}{matchedDel.ticket_number?" — #"+matchedDel.ticket_number:""}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab==="problems"&&(
          <div>
            <div style={{...cardStyle,padding:14,marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:14,color:"#f87171",marginBottom:12}}>⚠️ {isEs?"Reportar un Problema":"Report a Problem"}</div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:11,color:"#475569",marginBottom:4}}>{isEs?"Cliente (opcional)":"Customer (optional)"}</div>
                <input value={probInput.customer||""} onChange={e=>setProbInput(p=>({...p,customer:e.target.value}))} placeholder="Customer name" style={inputStyle}/>
              </div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:11,color:"#475569",marginBottom:4}}>{isEs?"Ticket # (opcional)":"Ticket # (optional)"}</div>
                <input value={probInput.ticket_number||""} onChange={e=>setProbInput(p=>({...p,ticket_number:e.target.value}))} placeholder="e.g. 30503" style={inputStyle}/>
              </div>
              <select value={probInput.type} onChange={e=>setProbInput(p=>({...p,type:e.target.value}))} style={{...inputStyle,marginBottom:8}}>
                <option value="customer">{isEs?"Problema con Cliente":"Customer Issue"}</option>
                <option value="product">{isEs?"Problema con Producto":"Product / Vendor"}</option>
                <option value="delivery">{isEs?"Problema de Entrega":"Delivery Issue"}</option>
                <option value="warranty">{isEs?"Garantía":"Warranty"}</option>
              </select>
              <textarea value={probInput.description} onChange={e=>setProbInput(p=>({...p,description:e.target.value}))}
                placeholder={isEs?"Describe el problema...":"Describe the problem in detail..."} rows={3} style={{...inputStyle,resize:"vertical",marginBottom:10}}/>
              <button className="btn" onClick={logProb} style={{width:"100%",background:"linear-gradient(135deg,#dc2626,#b91c1c)",color:"#fff",padding:13,fontSize:14,fontWeight:700}}>
                ⚠️ {isEs?"Reportar":"Submit to Manager"}
              </button>
              <div style={{fontSize:11,color:"#475569",textAlign:"center",marginTop:8}}>{isEs?"El gerente revisará esto.":"Manager will review this in the Challenge Log."}</div>
            </div>
            {problems.filter(p=>p.emp_name===user.name||p.emp_id===user.id).length===0?(
              <div style={{...cardStyle,padding:24,textAlign:"center",color:"#475569",fontSize:13,marginTop:8}}>
                {isEs?"No has reportado problemas.":"No problems submitted yet."}
              </div>
            ):problems.filter(p=>p.emp_name===user.name||p.emp_id===user.id).map(p=>(
              <div key={p.id} style={{...cardStyle,padding:"13px 15px",marginBottom:10,borderColor:p.resolved?"#1e3a20":"#3d1515"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:12,color:p.type==="customer"?"#60a5fa":"#c084fc"}}>{p.type==="customer"?"👤":"📦"} {p.type}</span>
                  <span style={{fontSize:11,color:p.resolved?"#4ade80":"#f87171"}}>{p.resolved?"✅ Resolved":"Pending"}</span>
                </div>
                <div style={{fontSize:13,color:"#e2e8f0"}}>{p.description}</div>
                <div style={{fontSize:10,color:"#475569",marginTop:3}}>{p.time}</div>
              </div>
            ))}
          </div>
        )}

        {tab==="dashboard"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:9,marginBottom:14}}>
              {[
                {l:isEs?"Total":"Total",v:deliveries.length,c:"#3b82f6",i:"📦"},
                {l:isEs?"Entregado":"Delivered",v:deliveries.filter(d=>d.status==="Delivered").length,c:"#22c55e",i:"✅"},
                {l:isEs?"En Camino":"In Transit",v:deliveries.filter(d=>d.status==="In Transit").length,c:"#60a5fa",i:"🚛"},
              ].map(s=>(
                <div key={s.l} style={{...cardStyle,padding:"13px 12px",textAlign:"center"}}>
                  <div style={{fontSize:20,marginBottom:4}}>{s.i}</div>
                  <div style={{fontSize:24,fontWeight:700,color:s.c,fontFamily:"monospace"}}>{s.v}</div>
                  <div style={{fontSize:11,color:"#475569",marginTop:3}}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={{...cardStyle,overflow:"hidden"}}>
              <div style={{padding:"10px 14px",background:"#0a1628",fontSize:10,fontWeight:700,letterSpacing:".1em",color:"#475569",textTransform:"uppercase"}}>{isEs?"Todas las Entregas de Hoy":"All Today's Deliveries"}</div>
              {deliveries.length===0?(
                <div style={{padding:24,textAlign:"center",color:"#475569",fontSize:13}}>{isEs?"No hay entregas.":"No deliveries today."}</div>
              ):(
                [...deliveries].sort((a,b)=>(a.stop_order||0)-(b.stop_order||0)).map((d,i)=>{
                  const emp=employees.find(e=>e.id===d.assigned_to);
                  const sc=STATUS_COLORS[d.status]||STATUS_COLORS["Scheduled"];
                  return(
                    <div key={d.id} style={{display:"flex",alignItems:"center",padding:"11px 14px",borderTop:i>0?"1px solid #131f2e":"none",gap:10,flexWrap:"wrap"}}>
                      <span style={{fontSize:10,color:"#64748b",fontFamily:"monospace",width:20}}>#{d.stop_order}</span>
                      <div style={{flex:1,minWidth:100}}>
                        <div style={{fontWeight:600,fontSize:13,color:"#e2e8f0"}}>{d.customer}</div>
                        <div style={{fontSize:11,color:"#475569"}}>{(d.items||[]).map(x=>`${x.qty}x ${x.name}`).join(", ")}</div>
                      </div>
                      <div style={{fontSize:11,color:"#64748b"}}>{emp?.name}</div>
                      <span className="badge" style={{background:sc.bg,color:sc.text}}>
                        <span style={{width:5,height:5,borderRadius:"50%",background:sc.dot,...(d.status==="In Transit"?{animation:"pulse 2s infinite"}:{})}}/>
                        {d.status}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {tab==="inventory"&&(
          <div>
            <div style={{marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>📦 {isEs?"Inventario":"Inventory"}</div>
              <a href={GOOGLE_SHEET_URL} target="_blank" rel="noreferrer" style={{background:"#1e2d3d",color:"#60a5fa",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,textDecoration:"none"}}>🔗 {isEs?"Abrir":"Open"}</a>
            </div>
            <div style={{...cardStyle,overflow:"hidden"}}>
              {GOOGLE_SHEET_URL==="YOUR_SHEET_URL_HERE"?(
                <div style={{padding:40,textAlign:"center",color:"#475569",fontSize:13}}>{isEs?"Hoja no conectada aún.":"Sheet not connected yet."}</div>
              ):(
                <iframe src={GOOGLE_SHEET_EMBED} width="100%" height="500" style={{border:0,display:"block"}} title="Inventory"/>
              )}
            </div>
          </div>
        )}

        {tab==="schedule"&&(()=>{
          const days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
          const dayFull={Mon:"Monday",Tue:"Tuesday",Wed:"Wednesday",Thu:"Thursday",Fri:"Friday",Sat:"Saturday",Sun:"Sunday"};
          return(
            <div>
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:12}}>📅 {isEs?"Horario Semanal":"Weekly Team Schedule"}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
                {days.map(d=>(
                  <button key={d} className="btn" onClick={()=>setSchedDay(schedDay===d?null:d)}
                    style={{padding:"7px 13px",fontSize:12,fontWeight:600,background:schedDay===d?"linear-gradient(135deg,#2563eb,#1d4ed8)":"#1e2d3d",color:schedDay===d?"#fff":"#94a3b8"}}>
                    {d}
                  </button>
                ))}
              </div>
              {days.filter(d=>!schedDay||d===schedDay).map(day=>{
                const working=employees.filter(e=>e.is_manager||(e.workdays||[]).includes(day));
                const off=employees.filter(e=>!e.is_manager&&!(e.workdays||[]).includes(day));
                return(
                  <div key={day} style={{...cardStyle,marginBottom:10,overflow:"hidden"}}>
                    <div style={{padding:"10px 16px",background:"#0a1628",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>{dayFull[day]}</div>
                      <span style={{fontSize:11,color:"#22c55e"}}>{working.length} working</span>
                    </div>
                    <div style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:off.length>0?8:0}}>
                        {working.map(emp=>(
                          <div key={emp.id} style={{display:"flex",alignItems:"center",gap:6,background:"#0c1f38",borderRadius:8,padding:"6px 10px",border:"1px solid #1e3a5f"}}>
                            <div style={{width:26,height:26,borderRadius:"50%",background:avatarBg(emp),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff"}}>{emp.avatar}</div>
                            <div>
                              <div style={{fontSize:12,fontWeight:600,color:"#f1f5f9"}}>{emp.name}{emp.is_manager?" 👑":""}</div>
                              <div style={{fontSize:10,color:"#475569"}}>{emp.role}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {off.length>0&&<div style={{fontSize:11,color:"#475569"}}>Off: {off.map(e=>e.name).join(", ")}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {tab==="prep"&&(()=>{
          const prepDateObj=new Date(prepDate+"T12:00:00");
          const prepDay=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][prepDateObj.getDay()];
          const prepDels=deliveries.filter(d=>d.delivery_date===prepDate);
          const allItems={};
          prepDels.forEach(d=>{(d.items||[]).forEach(item=>{const k=item.name.trim();if(!allItems[k])allItems[k]=0;allItems[k]+=item.qty;});});
          const removalDels=prepDels.filter(d=>d.removal_requested);
          const prepTasks=[
            ...(isEs?baseTasks.es:baseTasks.en).filter(t=>t.days.includes(prepDay)||t.days.includes("All")),
            ...(customTasks[user.id]||[]).filter(t=>t.day===prepDay||t.day==="All"),
          ];
          const isTomorrow=prepDate===(()=>{const t=new Date();t.setDate(t.getDate()+1);return t.toISOString().split("T")[0];})();
          return(
            <div>
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:8}}>📋 {isEs?"Prep — Selecciona un Día":"Prep — Select a Day"}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {[0,1,2,3,4,5,6].map(offset=>{
                  const d=new Date();d.setDate(d.getDate()+offset);
                  const iso=d.toISOString().split("T")[0];
                  const label=offset===0?(isEs?"Hoy":"Today"):offset===1?(isEs?"Mañana":"Tomorrow"):d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
                  const hasDels=deliveries.filter(x=>x.delivery_date===iso).length;
                  return(
                    <button key={iso} className="btn" onClick={()=>setPrepDate(iso)}
                      style={{padding:"7px 12px",fontSize:11,fontWeight:600,background:prepDate===iso?"linear-gradient(135deg,#2563eb,#1d4ed8)":"#1e2d3d",color:prepDate===iso?"#fff":"#94a3b8",position:"relative"}}>
                      {label}
                      {hasDels>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#22c55e",color:"#fff",borderRadius:"50%",width:14,height:14,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{hasDels}</span>}
                    </button>
                  );
                })}
              </div>
              <div style={{fontSize:12,color:"#475569",marginBottom:14}}>
                {prepDateObj.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
                {isTomorrow&&<span style={{marginLeft:8,color:"#22c55e",fontWeight:600}}>· {isEs?"Mañana":"Tomorrow"}</span>}
              </div>
              <div style={{...cardStyle,marginBottom:12,overflow:"hidden"}}>
                <div style={{padding:"10px 16px",background:"#0a1628",fontSize:11,fontWeight:700,letterSpacing:".08em",color:"#60a5fa",textTransform:"uppercase"}}>
                  📦 {isEs?"Lista de Productos":"Product Pull List"} ({prepDels.length})
                </div>
                {Object.keys(allItems).length===0?(
                  <div style={{padding:"20px 16px",color:"#475569",fontSize:13,textAlign:"center"}}>{isEs?"No hay entregas para este día.":"No deliveries scheduled for this day yet."}</div>
                ):(
                  Object.entries(allItems).map(([name,qty],i)=>(
                    <div key={name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px",borderTop:i>0?"1px solid #131f2e":"none"}}>
                      <div style={{fontSize:14,color:"#e2e8f0",fontWeight:500}}>{name}</div>
                      <span style={{background:"#1e3a5f",color:"#60a5fa",borderRadius:8,padding:"4px 12px",fontSize:14,fontWeight:700}}>{qty}x</span>
                    </div>
                  ))
                )}
                {removalDels.length>0&&<div style={{padding:"10px 16px",borderTop:"1px solid #131f2e",background:"#1c1500"}}><div style={{fontSize:11,color:"#f59e0b",fontWeight:600}}>♻️ {removalDels.length} {isEs?"retiro(s) programado(s)":"removal(s) scheduled"}</div></div>}
              </div>
              <div style={{...cardStyle,marginBottom:12,overflow:"hidden"}}>
                <div style={{padding:"10px 16px",background:"#0a1628",fontSize:11,fontWeight:700,letterSpacing:".08em",color:"#475569",textTransform:"uppercase"}}>🚛 {isEs?"Entregas de Mañana":"Delivery Schedule"}</div>
                {prepDels.length===0?(
                  <div style={{padding:"20px 16px",color:"#475569",fontSize:13,textAlign:"center"}}>{isEs?"No hay entregas.":"No deliveries yet."}</div>
                ):(
                  [...prepDels].sort((a,b)=>(a.stop_order||0)-(b.stop_order||0)).map((d,i)=>{
                    const emp=employees.find(e=>e.id===d.assigned_to);
                    return(
                      <div key={d.id} style={{padding:"11px 16px",borderTop:i>0?"1px solid #131f2e":"none"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                          <div style={{display:"flex",alignItems:"center",gap:7}}>
                            <span style={{fontSize:10,color:"#64748b",fontFamily:"monospace"}}>#{d.stop_order}</span>
                            <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9"}}>{d.customer}</div>
                            {d.ticket_number&&<span style={{fontSize:10,background:"#1e3a5f",color:"#60a5fa",borderRadius:4,padding:"1px 6px"}}>#{d.ticket_number}</span>}
                          </div>
                          <div style={{fontSize:11,color:"#a78bfa"}}>{d.delivery_window}</div>
                        </div>
                        <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>{d.address} · {emp?.name}</div>
                        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                          {(d.items||[]).map((item,ii)=>(
                            <span key={ii} style={{fontSize:11,background:"#1e2d3d",color:"#94a3b8",borderRadius:5,padding:"2px 7px"}}>{item.qty}x {item.name}</span>
                          ))}
                          {d.removal_requested&&<span style={{fontSize:11,background:"#1c1500",color:"#f59e0b",borderRadius:5,padding:"2px 7px"}}>♻️ Removal</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div style={{...cardStyle,overflow:"hidden"}}>
                <div style={{padding:"10px 16px",background:"#0a1628",fontSize:11,fontWeight:700,letterSpacing:".08em",color:"#475569",textTransform:"uppercase"}}>✅ {isEs?"Lista de Tareas":"Task Checklist"}</div>
                {prepTasks.length===0?(
                  <div style={{padding:"20px 16px",color:"#475569",fontSize:13,textAlign:"center"}}>{isEs?"No hay tareas.":"No tasks."}</div>
                ):(
                  prepTasks.map((task,i)=>{
                    const checkKey=`${user.id}-${prepDate}-${task.id||i}`;
                    const checked=!!taskChecks[checkKey];
                    return(
                      <div key={task.id||i} onClick={()=>setTaskChecks(prev=>({...prev,[checkKey]:!prev[checkKey]}))}
                        style={{display:"flex",alignItems:"flex-start",gap:12,padding:"13px 16px",borderTop:i>0?"1px solid #131f2e":"none",cursor:"pointer",background:checked?"#052e16":"transparent"}}>
                        <div style={{width:20,height:20,borderRadius:5,border:`2px solid ${checked?"#22c55e":"#334155"}`,background:checked?"#22c55e":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                          {checked&&<span style={{color:"#fff",fontSize:13,fontWeight:700}}>✓</span>}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,color:checked?"#4ade80":"#e2e8f0",textDecoration:checked?"line-through":"none"}}>{task.text}</div>
                          <div style={{fontSize:10,color:"#475569",marginTop:2}}>{task.category}</div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div style={{padding:"10px 16px",borderTop:"1px solid #131f2e",background:"#0a1628",fontSize:11,color:"#475569"}}>
                  {prepTasks.filter((_,i)=>!!taskChecks[`${user.id}-${prepDate}-${prepTasks[i]?.id||i}`]).length}/{prepTasks.length} {isEs?"completadas":"completed"}
                </div>
              </div>
            </div>
          );
        })()}

        {tab==="inspection"&&(
          <div>
            <div style={{...cardStyle,padding:14,marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9",marginBottom:8}}>🔍 {isEs?"Inspección del Camión":"Truck Inspection"}</div>
              <div style={{fontSize:12,color:"#94a3b8",marginBottom:12}}>{isEs?"Sube fotos de la inspección previa al viaje.":"Upload photos of your pre-trip inspection."}</div>
              <DriverInspectionUpload user={user} onUploaded={()=>{}} isEs={isEs}/>
            </div>
          </div>
        )}

        {tab==="receiving"&&(
          <div>
            <div style={{...cardStyle,padding:14}}>
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:12}}>📬 {isEs?"Log de Recepción":"Log Received Shipment"}</div>
              {dRvSaved?(
                <div style={{textAlign:"center",padding:24,color:"#4ade80",fontWeight:700,fontSize:16}}>✅ {isEs?"¡Guardado!":"Shipment Logged!"}</div>
              ):(
                <div>
                  <div style={{marginBottom:10}}><div style={{fontSize:12,color:"#475569",marginBottom:4}}>{isEs?"Proveedor":"Vendor"} *</div><input value={dRv.vendor} onChange={e=>setDRv(p=>({...p,vendor:e.target.value}))} placeholder="e.g. Serta, Simmons" style={inputStyle}/></div>
                  <div style={{marginBottom:10}}><div style={{fontSize:12,color:"#475569",marginBottom:4}}>{isEs?"Fabricante":"Manufacturer"}</div><input value={dRv.manufacturer} onChange={e=>setDRv(p=>({...p,manufacturer:e.target.value}))} placeholder="e.g. SERTA" style={inputStyle}/></div>
                  <div style={{marginBottom:10}}><div style={{fontSize:12,color:"#475569",marginBottom:4}}>{isEs?"Artículos":"Items"}</div><input value={dRv.items} onChange={e=>setDRv(p=>({...p,items:e.target.value}))} placeholder="e.g. 2x Knox Queen" style={inputStyle}/></div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                    <div><div style={{fontSize:12,color:"#475569",marginBottom:4}}>{isEs?"Cantidad":"Qty"}</div><input type="number" min="1" value={dRv.quantity} onChange={e=>setDRv(p=>({...p,quantity:Number(e.target.value)}))} style={inputStyle}/></div>
                    <div><div style={{fontSize:12,color:"#475569",marginBottom:4}}>{isEs?"Fecha":"Date"}</div><input type="date" value={dRv.received_date} onChange={e=>setDRv(p=>({...p,received_date:e.target.value}))} style={{...inputStyle,colorScheme:"dark"}}/></div>
                  </div>
                  <div style={{marginBottom:10}}><div style={{fontSize:12,color:"#475569",marginBottom:4}}>{isEs?"Notas":"Notes / Problems"}</div><textarea value={dRv.notes} onChange={e=>setDRv(p=>({...p,notes:e.target.value}))} rows={2} style={{...inputStyle,resize:"vertical"}} placeholder={isEs?"Daños o problemas...":"Damage, missing items..."}/></div>
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:12,color:"#475569",marginBottom:4}}>📄 BOL Photo</div>
                    <input type="file" accept="image/*" onChange={async(e)=>{
                      const file=e.target.files[0];if(!file)return;
                      setDRvUploading(true);
                      try{
                        const blob=await new Promise(res=>{const r=new FileReader();r.onload=ev=>{const img=new Image();img.onload=()=>{const MAX=1600;let w=img.width,h=img.height;if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);c.toBlob(b=>res(b),"image/jpeg",0.9);};img.src=ev.target.result;};r.readAsDataURL(file);});
                        const path=`bol/${Date.now()}.jpg`;
                        const {error}=await sb.storage.from("photos").upload(path,blob,{contentType:"image/jpeg"});
                        if(!error){const url=sb.storage.from("photos").getPublicUrl(path).data.publicUrl;setDRv(p=>({...p,bol_photo_url:url}));}
                        else alert("Upload error: "+error.message);
                      }catch(err){alert("Error: "+err.message);}
                      setDRvUploading(false);e.target.value="";
                    }} style={{...inputStyle,padding:8}}/>
                    {dRvUploading&&<div style={{fontSize:12,color:"#60a5fa",marginTop:4}}>⏳ Uploading...</div>}
                    {dRv.bol_photo_url&&<img src={dRv.bol_photo_url} onClick={()=>window.open(dRv.bol_photo_url,"_blank")} alt="BOL" style={{width:120,height:80,objectFit:"cover",borderRadius:8,marginTop:6,cursor:"pointer",border:"2px solid #22c55e"}}/>}
                  </div>
                  <button className="btn" onClick={async()=>{
                    if(!dRv.vendor)return alert("Please enter a vendor.");
                    const r={id:Date.now(),received_date:dRv.received_date,vendor:dRv.vendor,manufacturer:dRv.manufacturer||"",received_by:user.name,quantity:dRv.quantity||1,items:dRv.items||"",notes:dRv.notes||"",bol_photo_url:dRv.bol_photo_url||"",created_at:new Date().toISOString()};
                    const {error}=await sb.from("receiving_log").insert(r);
                    if(error){alert("Save failed: "+error.message);return;}
                    setDRvSaved(true);
                    setDRv({received_date:new Date().toISOString().split("T")[0],vendor:"",received_by:user.name,quantity:1,notes:"",manufacturer:"",items:"",bol_photo_url:""});
                    setTimeout(()=>setDRvSaved(false),3000);
                  }} style={{width:"100%",background:"linear-gradient(135deg,#059669,#047857)",color:"#fff",padding:14,fontSize:14,fontWeight:700}}>
                    📬 {isEs?"Guardar":"Log Shipment"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab==="receipts-submit"&&(
          <div>
            <div style={{...cardStyle,padding:14}}>
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:4}}>🧾 {isEs?"Enviar Recibo":"Submit Receipt"}</div>
              <div style={{fontSize:12,color:"#475569",marginBottom:12}}>{isEs?"Registra gastos del día.":"Log expenses — fuel, supplies, etc."}</div>
              {dReceiptSaved?(
                <div style={{textAlign:"center",padding:24,color:"#4ade80",fontWeight:700,fontSize:16}}>✅ {isEs?"¡Recibo enviado!":"Receipt submitted!"}</div>
              ):(
                <div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:12,color:"#475569",marginBottom:4}}>{isEs?"Razón / Descripción":"Reason / Description"} *</div>
                    <input value={dReceipt.reason} onChange={e=>setDReceipt(p=>({...p,reason:e.target.value}))} placeholder={isEs?"ej. Gasolina, suministros...":"e.g. Fuel, supplies, lunch..."} style={inputStyle}/>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                    <div>
                      <div style={{fontSize:12,color:"#475569",marginBottom:4}}>{isEs?"Monto ($)":"Amount ($)"} *</div>
                      <input type="number" step="0.01" value={dReceipt.amount} onChange={e=>setDReceipt(p=>({...p,amount:e.target.value}))} placeholder="0.00" style={inputStyle}/>
                    </div>
                    <div>
                      <div style={{fontSize:12,color:"#475569",marginBottom:4}}>{isEs?"Fecha":"Date"}</div>
                      <input type="date" value={dReceipt.receipt_date} onChange={e=>setDReceipt(p=>({...p,receipt_date:e.target.value}))} style={{...inputStyle,colorScheme:"dark"}}/>
                    </div>
                  </div>
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:12,color:"#475569",marginBottom:4}}>📸 {isEs?"Foto del Recibo":"Receipt Photo"}</div>
                    <input type="file" accept="image/*" onChange={async(e)=>{
                      const file=e.target.files[0];if(!file)return;
                      setDReceiptUploading(true);
                      try{
                        const blob=await new Promise(res=>{const r=new FileReader();r.onload=ev=>{const img=new Image();img.onload=()=>{const MAX=1200;let w=img.width,h=img.height;if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);c.toBlob(b=>res(b),"image/jpeg",0.85);};img.src=ev.target.result;};r.readAsDataURL(file);});
                        const path=`receipts/${Date.now()}.jpg`;
                        const {error}=await sb.storage.from("photos").upload(path,blob,{contentType:"image/jpeg"});
                        if(!error){const url=sb.storage.from("photos").getPublicUrl(path).data.publicUrl;setDReceipt(p=>({...p,photo_url:url}));}
                        else alert("Upload error: "+error.message);
                      }catch(err){alert("Error: "+err.message);}
                      setDReceiptUploading(false);e.target.value="";
                    }} style={{...inputStyle,padding:8}}/>
                    {dReceiptUploading&&<div style={{fontSize:12,color:"#60a5fa",marginTop:4}}>⏳ {isEs?"Subiendo...":"Uploading..."}</div>}
                    {dReceipt.photo_url&&<img src={dReceipt.photo_url} onClick={()=>window.open(dReceipt.photo_url,"_blank")} alt="receipt" style={{width:120,height:80,objectFit:"cover",borderRadius:8,marginTop:6,cursor:"pointer",border:"2px solid #22c55e"}}/>}
                  </div>
                  <button className="btn" onClick={async()=>{
                    if(!dReceipt.reason||!dReceipt.amount)return alert(isEs?"Ingresa razón y monto.":"Please enter reason and amount.");
                    const r={id:Date.now(),reason:dReceipt.reason,amount:parseFloat(dReceipt.amount),receipt_date:dReceipt.receipt_date,photo_url:dReceipt.photo_url||"",submitted_by:user.name,created_at:new Date().toISOString()};
                    const {error}=await sb.from("receipts").insert(r);
                    if(error){alert("Save failed: "+error.message);return;}
                    setDReceiptSaved(true);
                    setDReceipt({reason:"",amount:"",receipt_date:new Date().toISOString().split("T")[0],photo_url:""});
                    setTimeout(()=>setDReceiptSaved(false),3000);
                  }} style={{width:"100%",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:14,fontSize:14,fontWeight:700}}>
                    💾 {isEs?"Enviar Recibo":"Submit Receipt"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab==="training-view"&&(
          <div>
            {(!trainingFiles||trainingFiles.length===0)?(
              <div style={{...cardStyle,padding:40,textAlign:"center",color:"#475569"}}>
                <div style={{fontSize:32,marginBottom:8}}>🎬</div>
                <div>{isEs?"No hay materiales.":"No training materials yet."}</div>
              </div>
            ):([...new Set(trainingFiles.map(t=>t.category))].map(cat=>(
              <div key={cat} style={{marginBottom:14}}>
                <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",marginBottom:8}}>{cat}</div>
                {trainingFiles.filter(t=>t.category===cat).map(t=>{
                  const signed=(completions||[]).find(c=>c.training_id===t.id&&c.emp_id===user.id);
                  const getEmbed=url=>{if(!url)return null;const yt=url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);if(yt)return`https://www.youtube.com/embed/${yt[1]}`;const vi=url.match(/vimeo\.com\/(\d+)/);if(vi)return`https://player.vimeo.com/video/${vi[1]}`;return url;};
                  const embed=getEmbed(t.video_url);
                  return(<TrainingCard key={t.id} t={t} embed={embed} signed={signed} user={user} isEs={isEs} sb={sb} completions={completions||[]} setCompletions={setCompletions} cardStyle={cardStyle}/>);
                })}
              </div>
            )))}
          </div>
        )}

      </div>
    </div>
  );
}
function TrainingCard({ t, embed, signed, user, isEs, sb, completions, setCompletions, cardStyle }) {
  const [open, setOpen] = React.useState(false);
  return(
    <div style={{...cardStyle,marginBottom:10,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9",marginBottom:4}}>{t.title}</div>
          {t.content&&<div style={{fontSize:11,color:"#475569"}}>{t.content.substring(0,80)}{t.content.length>80?"...":""}</div>}
          <div style={{display:"flex",gap:5,marginTop:4,flexWrap:"wrap"}}>
            {signed&&<span style={{fontSize:10,background:"#052e16",color:"#4ade80",borderRadius:4,padding:"2px 6px"}}>✅ Completed</span>}
            {t.requires_signature&&!signed&&<span style={{fontSize:10,background:"#1c1500",color:"#f59e0b",borderRadius:4,padding:"2px 6px"}}>✍️ Sign-off required</span>}
            {t.video_url&&<span style={{fontSize:10,background:"#0c2340",color:"#60a5fa",borderRadius:4,padding:"2px 6px"}}>🎬 Video</span>}
          </div>
        </div>
        <button className="btn" onClick={()=>setOpen(p=>!p)} style={{background:"#1e2d3d",color:"#60a5fa",padding:"5px 10px",fontSize:11,flexShrink:0}}>{open?"▲":"▼"}</button>
      </div>
      {open&&(
        <div style={{borderTop:"1px solid #1e2d3d"}}>
          {embed&&<div style={{position:"relative",paddingBottom:"56.25%",height:0}}><iframe src={embed} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",border:0}} allowFullScreen title={t.title}/></div>}
          {t.content&&<div style={{padding:"12px 16px",fontSize:13,color:"#94a3b8",lineHeight:1.6}}>{t.content}</div>}
          {t.requires_signature&&!signed&&(
            <div style={{padding:"12px 16px",borderTop:"1px solid #1e2d3d"}}>
              <button className="btn" onClick={async()=>{
                const c={id:Date.now(),training_id:t.id,emp_id:user.id,emp_name:user.name,completed_at:new Date().toISOString(),signature_url:""};
                await sb.from("training_completions").insert(c);
                setCompletions(prev=>[...prev,c]);
              }} style={{width:"100%",background:"linear-gradient(135deg,#059669,#047857)",color:"#fff",padding:"11px",fontSize:13,fontWeight:700}}>
                ✅ {isEs?"Marcar como Completado":"I Have Watched This — Mark Complete"}
              </button>
            </div>
          )}
          {signed&&<div style={{padding:"10px 16px",borderTop:"1px solid #1e2d3d",textAlign:"center",color:"#4ade80",fontSize:13,fontWeight:600}}>✅ Completed {new Date(signed.completed_at).toLocaleDateString()}</div>}
        </div>
      )}
    </div>
  );
}

function DriverInspectionUpload({ user, onUploaded, isEs }) {
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef();

  const compressPhoto = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800; let w=img.width, h=img.height;
        if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}
        const canvas=document.createElement("canvas"); canvas.width=w; canvas.height=h;
        canvas.getContext("2d").drawImage(img,0,0,w,h);
        canvas.toBlob((blob)=>resolve(blob),"image/jpeg",0.75);
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressPhoto(file);
      const path = `inspections/${user.id}/${Date.now()}.jpg`;
      const { error } = await sb.storage.from("photos").upload(path, compressed, {contentType:"image/jpeg"});
      if (!error) {
        const url = sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
        const ins = { id:Date.now(), emp_id:user.id, emp_name:user.name, photo_url:url, notes:notes.trim(), inspection_date:new Date().toISOString().split("T")[0], created_at:new Date().toISOString() };
        await sb.from("inspections").insert(ins);
        onUploaded(ins);
        setDone(true);
        setNotes("");
        setTimeout(()=>setDone(false),3000);
      }
    } catch(e) { console.error(e); }
    setUploading(false);
  };

  const inputStyle = {background:"#0a1628",border:"1px solid #1e2d3d",borderRadius:8,padding:"10px 14px",fontSize:14,color:"#e2e8f0",width:"100%",fontFamily:"inherit"};

  return (
    <div>
      <textarea value={notes} onChange={e=>setNotes(e.target.value)}
        placeholder={isEs?"Notas de inspección (defectos, problemas...)":"Inspection notes (defects, issues...)"}
        rows={3} style={{...inputStyle,resize:"vertical",marginBottom:10}}/>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleUpload} style={{display:"none"}}/>
      <button className="btn" onClick={()=>fileRef.current.click()} disabled={uploading}
        style={{width:"100%",background:done?"linear-gradient(135deg,#059669,#047857)":"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:13,fontSize:14,fontWeight:700,marginBottom:8}}>
        {uploading?"⏳ Uploading...":done?"✅ Submitted!":"📷 "+ (isEs?"Tomar Foto de Inspección":"Take Inspection Photo")}
      </button>
      <div style={{fontSize:11,color:"#475569",textAlign:"center"}}>{isEs?"Conner puede ver todas las fotos de inspección.":"Conner can review all inspection photos."}</div>
    </div>
  );
}

// ─── WARRANTY INSPECTOR ──────────────────────────────────────────────────────
function WarrantyInspector({ delivery, user, onClose, onSaved, isEs }) {
  const [photos, setPhotos] = useState(delivery.warranty_photos||{});
  const [uploading, setUploading] = useState(null);
  const fileRefs = {
    flat: React.useRef(), angle: React.useRef(), closeup: React.useRef(),
    foundation: React.useRef(), frame: React.useRef(), lawtag: React.useRef()
  };

  const STEPS = [
    {key:"flat", label:"1. Flat Broomstick Across Mattress", desc:"Place broomstick flat across mattress surface", icon:"🧹"},
    {key:"angle", label:"2. Far Angle — Tape Measure Into Dip", desc:"Far angle shot measuring dip. DO NOT measure in quilting", icon:"📏"},
    {key:"closeup", label:"3. Close Up of Tape Measure", desc:"Close up showing measurement clearly", icon:"🔍"},
    {key:"foundation", label:"4. Foundation — Broomstick & Tape Measure", desc:"Foundation with flat broomstick and tape measure", icon:"🛏"},
    {key:"frame", label:"5. Frame Underneath", desc:"Photo of frame underneath the foundation", icon:"🔩"},
    {key:"lawtag", label:"6. Law Tag", desc:"Clear photo of the law tag", icon:"🏷️"},
  ];

  const compressPhoto = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX=1200; let w=img.width,h=img.height;
        if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}
        const canvas=document.createElement("canvas"); canvas.width=w; canvas.height=h;
        canvas.getContext("2d").drawImage(img,0,0,w,h);
        canvas.toBlob((blob)=>resolve(blob),"image/jpeg",0.85);
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  const handleUpload = async (e, key) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(key);
    try {
      const compressed = await compressPhoto(file);
      const path = `warranty/${delivery.id}/${key}-${Date.now()}.jpg`;
      const { error } = await sb.storage.from("photos").upload(path, compressed, {contentType:"image/jpeg"});
      if (!error) {
        const url = sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
        const newPhotos = { ...photos, [key]: url };
        setPhotos(newPhotos);
        await sb.from("deliveries").update({ warranty_photos: newPhotos }).eq("id", delivery.id);
      }
    } catch(e) { console.error(e); }
    setUploading(null);
  };

  const allDone = STEPS.every(s => photos[s.key]);
  const completed = STEPS.filter(s => photos[s.key]).length;

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"#080d14",zIndex:999,overflowY:"auto",fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{background:"#0a1628",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10,borderBottom:"1px solid #1e2d3d"}}>
        <div>
          <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>🔍 Warranty Inspection</div>
          <div style={{fontSize:11,color:"#475569"}}>{delivery.customer} · {completed}/{STEPS.length} photos</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {allDone&&(
            <button className="btn" onClick={()=>onSaved(photos)} style={{background:"linear-gradient(135deg,#059669,#047857)",color:"#fff",padding:"7px 14px",fontSize:12,fontWeight:700}}>
              ✅ Save & Close
            </button>
          )}
          <button className="btn" onClick={onClose} style={{background:"#1e2d3d",color:"#94a3b8",padding:"7px 12px",fontSize:12}}>✕</button>
        </div>
      </div>

      {/* Progress */}
      <div style={{padding:"10px 16px",background:"#0a1628",borderBottom:"1px solid #1e2d3d"}}>
        <div style={{height:6,background:"#1e2d3d",borderRadius:3,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${(completed/STEPS.length)*100}%`,background:"linear-gradient(90deg,#f59e0b,#22c55e)",borderRadius:3,transition:"width .3s"}}/>
        </div>
        <div style={{fontSize:11,color:"#475569",marginTop:4,textAlign:"right"}}>{completed} of {STEPS.length} photos taken</div>
      </div>

      <div style={{padding:14}}>
        {/* Important note */}
        <div style={{background:"#1c1500",border:"1px solid #f59e0b",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
          <div style={{fontSize:12,color:"#f59e0b",fontWeight:600,marginBottom:4}}>⚠️ Important</div>
          <div style={{fontSize:12,color:"#fbbf24",lineHeight:1.5}}>Step 2: Measure into the DIP only. DO NOT measure in the quilting. This is critical for warranty claims.</div>
        </div>

        {STEPS.map((step,i)=>(
          <div key={step.key} style={{background:"#0f1923",border:`1px solid ${photos[step.key]?"#22c55e":"#1e2d3d"}`,borderRadius:12,marginBottom:12,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:photos[step.key]?"#052e16":"#1e2d3d",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>
                {photos[step.key]?"✅":step.icon}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9"}}>{step.label}</div>
                <div style={{fontSize:11,color:"#475569",marginTop:2}}>{step.desc}</div>
              </div>
            </div>
            {photos[step.key]?(
              <div style={{padding:"0 14px 12px"}}>
                <img src={photos[step.key]} alt={step.label} style={{width:"100%",borderRadius:8,maxHeight:200,objectFit:"cover"}}/>
                <button className="btn" onClick={()=>fileRefs[step.key].current.click()} style={{width:"100%",background:"#1e2d3d",color:"#60a5fa",padding:"8px",fontSize:12,marginTop:8}}>
                  🔄 Retake Photo
                </button>
              </div>
            ):(
              <div style={{padding:"0 14px 12px"}}>
                <button className="btn" onClick={()=>fileRefs[step.key].current.click()} disabled={uploading===step.key}
                  style={{width:"100%",background:"linear-gradient(135deg,#d97706,#b45309)",color:"#fff",padding:"12px",fontSize:14,fontWeight:700}}>
                  {uploading===step.key?"⏳ Uploading...":"📷 Take Photo"}
                </button>
              </div>
            )}
            <input ref={fileRefs[step.key]} type="file" accept="image/*" capture="environment"
              onChange={e=>handleUpload(e,step.key)} style={{display:"none"}}/>
          </div>
        ))}

        {allDone&&(
          <button className="btn" onClick={()=>onSaved(photos)} style={{width:"100%",background:"linear-gradient(135deg,#059669,#047857)",color:"#fff",padding:"14px",fontSize:15,fontWeight:700,borderRadius:12}}>
            ✅ All Photos Saved — Complete Warranty Inspection
          </button>
        )}
      </div>
    </div>
  );
}

// ─── TRAINING SIGN PAD ───────────────────────────────────────────────────────
function TrainingSignPad({ emp, session, onSigned, onClose }) {
  const canvasRef = React.useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [saving, setSaving] = useState(false);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };
  const startDraw=(e)=>{e.preventDefault();const c=canvasRef.current;const ctx=c.getContext("2d");const pos=getPos(e,c);ctx.beginPath();ctx.moveTo(pos.x,pos.y);setDrawing(true);setHasStrokes(true);};
  const draw=(e)=>{e.preventDefault();if(!drawing)return;const c=canvasRef.current;const ctx=c.getContext("2d");ctx.strokeStyle="#1a1a2e";ctx.lineWidth=2.5;ctx.lineCap="round";ctx.lineJoin="round";const pos=getPos(e,c);ctx.lineTo(pos.x,pos.y);ctx.stroke();};
  const endDraw=(e)=>{e.preventDefault();setDrawing(false);};
  const clear=()=>{canvasRef.current.getContext("2d").clearRect(0,0,canvasRef.current.width,canvasRef.current.height);setHasStrokes(false);};

  const save = async () => {
    if (!hasStrokes) return;
    setSaving(true);
    try {
      canvasRef.current.toBlob(async(blob)=>{
        const path = `trainings/${session.id}/${emp.id}-${Date.now()}.png`;
        const { error } = await sb.storage.from("photos").upload(path, blob, {contentType:"image/png"});
        if (!error) {
          const url = sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
          onSigned(url);
        }
        setSaving(false);
      }, "image/png");
    } catch(e) { console.error(e); setSaving(false); }
  };

  const signDate = new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  const topics = session.topics||[];

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.92)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:12,overflowY:"auto"}}>
      <div style={{background:"#fff",borderRadius:16,padding:20,width:"100%",maxWidth:480,color:"#1a1a2e"}}>
        <div style={{textAlign:"center",marginBottom:12,borderBottom:"2px solid #e5e7eb",paddingBottom:10}}>
          <div style={{fontSize:16,fontWeight:800}}>🛏 America's Mattress</div>
          <div style={{fontSize:13,fontWeight:700,color:"#2563eb",marginTop:2}}>Training Sign-In</div>
          <div style={{fontSize:11,color:"#6b7280",marginTop:2}}>{signDate}</div>
        </div>
        <div style={{background:"#f9fafb",borderRadius:8,padding:"10px 12px",marginBottom:12,border:"1px solid #e5e7eb"}}>
          <div style={{fontWeight:700,fontSize:14,color:"#1a1a2e",marginBottom:4}}>{session.title}</div>
          {topics.length>0&&(
            <div>
              <div style={{fontSize:11,fontWeight:600,color:"#374151",marginBottom:4}}>Topics covered:</div>
              {topics.map((t,i)=><div key={i} style={{fontSize:12,color:"#6b7280",paddingLeft:8}}>• {t}</div>)}
            </div>
          )}
        </div>
        <div style={{background:"#eff6ff",borderRadius:8,padding:"10px 12px",marginBottom:12,border:"1px solid #bfdbfe",fontSize:12,color:"#1e40af",lineHeight:1.6}}>
          I, <strong>{emp.name}</strong>, confirm that I attended and participated in the above training session on {signDate} at America's Mattress Albuquerque.
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:5}}>Signature:</div>
          <div style={{border:"2px solid #d1d5db",borderRadius:8,background:"#fafafa",cursor:"crosshair",touchAction:"none",position:"relative"}}>
            <canvas ref={canvasRef} width={440} height={130} style={{width:"100%",height:130,borderRadius:8,display:"block",touchAction:"none"}}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}/>
            {!hasStrokes&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:12,color:"#9ca3af",pointerEvents:"none",whiteSpace:"nowrap"}}>Sign here</div>}
          </div>
          <div style={{borderTop:"2px solid #374151",paddingTop:2,fontSize:10,color:"#9ca3af",textAlign:"center"}}>x — {emp.name}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn" onClick={save} disabled={!hasStrokes||saving}
            style={{flex:1,background:hasStrokes?"#059669":"#d1d5db",color:hasStrokes?"#fff":"#9ca3af",padding:"13px",fontSize:14,fontWeight:700,borderRadius:10}}>
            {saving?"⏳ Saving...":"✅ Sign Training Log"}
          </button>
          <button className="btn" onClick={clear} style={{background:"#f3f4f6",color:"#6b7280",padding:"13px 14px",borderRadius:10}}>🗑️</button>
          <button className="btn" onClick={onClose} style={{background:"#fee2e2",color:"#dc2626",padding:"13px 14px",borderRadius:10}}>✕</button>
        </div>
      </div>
    </div>
  );
}

// ─── ADD BASE TASK ROW ────────────────────────────────────────────────────────
// ─── LIABILITY FORM PAD ──────────────────────────────────────────────────────
function LiabilityPad({ delivery, user, formType, onSigned, onClose, isEs }) {
  const canvasRef = React.useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printedName, setPrintedName] = useState("");
  const [details, setDetails] = useState("");

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };
  const startDraw=(e)=>{e.preventDefault();const canvas=canvasRef.current;const ctx=canvas.getContext("2d");const pos=getPos(e,canvas);ctx.beginPath();ctx.moveTo(pos.x,pos.y);setDrawing(true);setHasStrokes(true);};
  const draw=(e)=>{e.preventDefault();if(!drawing)return;const canvas=canvasRef.current;const ctx=canvas.getContext("2d");ctx.strokeStyle="#1a1a2e";ctx.lineWidth=2.5;ctx.lineCap="round";ctx.lineJoin="round";const pos=getPos(e,canvas);ctx.lineTo(pos.x,pos.y);ctx.stroke();};
  const endDraw=(e)=>{e.preventDefault();setDrawing(false);};
  const clear=()=>{const canvas=canvasRef.current;canvas.getContext("2d").clearRect(0,0,canvas.width,canvas.height);setHasStrokes(false);};

  const save = async () => {
    if (!hasStrokes || !printedName.trim()) return;
    setSaving(true);
    try {
      const canvas = canvasRef.current;
      canvas.toBlob(async (blob) => {
        const path = `liability/${delivery.id}/${formType}-${Date.now()}.png`;
        const { error } = await sb.storage.from("photos").upload(path, blob, { contentType:"image/png" });
        if (!error) {
          const url = sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
          const record = {
            id: Date.now(),
            form_type: formType,
            customer: delivery.customer,
            address: delivery.address,
            delivery_id: delivery.id,
            ticket_number: delivery.ticket_number||"",
            driver_name: user.name,
            details: details.trim(),
            signature_url: url,
            printed_name: printedName.trim(),
            signed_at: new Date().toISOString(),
          };
          await sb.from("liability_forms").insert(record);
          onSigned(record);
        }
        setSaving(false);
      }, "image/png");
    } catch(e) { console.error(e); setSaving(false); }
  };

  const isHeadboard = formType === "headboard";
  const canSubmit = hasStrokes && printedName.trim().length > 1;
  const signDate = new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.92)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:12,overflowY:"auto"}}>
      <div style={{background:"#fff",borderRadius:16,padding:20,width:"100%",maxWidth:480,color:"#1a1a2e"}}>
        <div style={{textAlign:"center",marginBottom:12,borderBottom:"2px solid #e5e7eb",paddingBottom:10}}>
          <div style={{fontSize:16,fontWeight:800,color:"#1a1a2e"}}>🛏 America's Mattress</div>
          <div style={{fontSize:13,fontWeight:700,color:isHeadboard?"#2563eb":"#7c3aed",marginTop:2}}>
            {isHeadboard?"🔧 Headboard Drilling Authorization":"🛋️ Furniture Moving Authorization"}
          </div>
          <div style={{fontSize:11,color:"#6b7280",marginTop:2}}>{signDate}</div>
        </div>
        <div style={{background:"#f9fafb",borderRadius:8,padding:"10px 12px",marginBottom:12,border:"1px solid #e5e7eb",fontSize:12,color:"#374151"}}>
          <div style={{fontWeight:700,marginBottom:2}}>{delivery.customer}</div>
          <div style={{color:"#6b7280"}}>{delivery.address}</div>
          {delivery.ticket_number&&<div style={{color:"#6b7280"}}>Order #{delivery.ticket_number}</div>}
        </div>
        <div style={{background:"#eff6ff",borderRadius:8,padding:"10px 12px",marginBottom:12,border:"1px solid #bfdbfe",fontSize:12,color:"#1e40af",lineHeight:1.6}}>
          {isHeadboard
            ? `I, the undersigned, authorize America's Mattress Albuquerque to drill into my headboard for bed frame assembly on ${signDate}. I understand this is permanent and America's Mattress is not liable for any damage resulting from this authorized drilling.`
            : `I, the undersigned, authorize America's Mattress Albuquerque to move existing furniture in my home to complete today's delivery on ${signDate}. I understand America's Mattress will take reasonable care but is not liable for any pre-existing damage or damage resulting from this authorized furniture moving.`
          }
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:5}}>
            {isEs?"Detalles adicionales (opcional):":"Additional details (optional):"}
          </div>
          <input value={details} onChange={e=>setDetails(e.target.value)} placeholder={isHeadboard?"e.g. King headboard, bedroom 1":"e.g. Moving dresser and nightstands"} style={{width:"100%",border:"1.5px solid #d1d5db",borderRadius:7,padding:"9px 11px",fontSize:14,color:"#1a1a2e",fontFamily:"sans-serif"}}/>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:5}}>{isEs?"Nombre en letra de molde:":"Print Full Name (required):"}</div>
          <input value={printedName} onChange={e=>setPrintedName(e.target.value)} placeholder={isEs?"Su nombre completo":"Your full name"} style={{width:"100%",border:"2px solid #d1d5db",borderRadius:8,padding:"10px 12px",fontSize:14,color:"#1a1a2e",fontFamily:"sans-serif"}}/>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:5}}>{isEs?"Firma:":"Signature (required):"}</div>
          <div style={{border:"2px solid #d1d5db",borderRadius:8,background:"#fafafa",cursor:"crosshair",touchAction:"none",position:"relative"}}>
            <canvas ref={canvasRef} width={440} height={130} style={{width:"100%",height:130,borderRadius:8,display:"block",touchAction:"none"}}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}/>
            {!hasStrokes&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:12,color:"#9ca3af",pointerEvents:"none",whiteSpace:"nowrap"}}>Sign here</div>}
          </div>
          <div style={{borderTop:"2px solid #374151",paddingTop:2,fontSize:10,color:"#9ca3af",textAlign:"center"}}>x</div>
        </div>
        {!printedName.trim()&&hasStrokes&&<div style={{fontSize:11,color:"#dc2626",marginBottom:8,textAlign:"center"}}>⚠️ Please enter your printed name</div>}
        <div style={{display:"flex",gap:8}}>
          <button className="btn" onClick={save} disabled={!canSubmit||saving}
            style={{flex:1,background:canSubmit?"#059669":"#d1d5db",color:canSubmit?"#fff":"#9ca3af",padding:"13px",fontSize:14,fontWeight:700,borderRadius:10}}>
            {saving?"⏳ Saving...":"✅ Sign & Authorize"}
          </button>
          <button className="btn" onClick={clear} style={{background:"#f3f4f6",color:"#6b7280",padding:"13px 14px",fontSize:13,borderRadius:10}}>🗑️</button>
          <button className="btn" onClick={onClose} style={{background:"#fee2e2",color:"#dc2626",padding:"13px 14px",fontSize:13,borderRadius:10}}>✕</button>
        </div>
        <div style={{fontSize:10,color:"#9ca3af",textAlign:"center",marginTop:8}}>Permanently recorded · America's Mattress Albuquerque</div>
      </div>
    </div>
  );
}

// ─── SIGNATURE PAD ────────────────────────────────────────────────────────────
function SignaturePad({ delivery, user, onSigned, onClose, isEs }) {
  const canvasRef = React.useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printedName, setPrintedName] = useState("");

  const itemList = (delivery.items||[]).map(i=>`${i.qty}x ${i.name}`).join(", ");
  const signDate = new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  const signTime = new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
    setHasStrokes(true);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = (e) => { e.preventDefault(); setDrawing(false); };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const save = async () => {
    if (!hasStrokes || !printedName.trim()) return;
    setSaving(true);
    try {
      const canvas = canvasRef.current;
      const now = new Date().toISOString();
      const name = printedName.trim();
      // Always have a base64 copy as the offline fallback — it renders as an
      // <img> src anywhere, so a captured signature is never lost when there's
      // no signal. We try to upload to storage first when online for a smaller
      // DB footprint, but fall back to the data URL on any failure.
      const dataUrl = canvas.toDataURL("image/png");
      let url = dataUrl;
      if (navigator.onLine) {
        try {
          const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
          const path = `signatures/${delivery.id}/${Date.now()}.png`;
          const { error } = await sb.storage.from("photos").upload(path, blob, { contentType:"image/png" });
          if (!error) url = sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
        } catch(e) { /* keep data URL fallback */ }
      }
      await tryWrite({ table:"deliveries", op:"update", payload:{ signature_url:url, signed_by:name, signed_at:now, status:"Delivered" }, match:{col:"id", val:delivery.id} });
      const sigRecord = {
        id: Date.now(),
        ticket_number: delivery.ticket_number||"",
        customer: delivery.customer,
        address: delivery.address,
        phone: delivery.phone,
        delivery_date: delivery.delivery_date||new Date().toISOString().split("T")[0],
        signed_by: name,
        signed_at: now,
        signature_url: url,
        driver_name: user.name,
        items: delivery.items||[],
      };
      await tryWrite({ table:"signatures", op:"insert", payload:sigRecord });
      onSigned(url, now, name);
      setSaving(false);
    } catch(e) { console.error(e); setSaving(false); }
  };

  const canSubmit = hasStrokes && printedName.trim().length > 1;

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.92)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:12,overflowY:"auto"}}>
      <div style={{background:"#fff",borderRadius:16,padding:20,width:"100%",maxWidth:480,color:"#1a1a2e"}}>
        {/* Header */}
        <div style={{textAlign:"center",marginBottom:14,borderBottom:"2px solid #e5e7eb",paddingBottom:12}}>
          <div style={{fontSize:18,fontWeight:800,color:"#1a1a2e",fontFamily:"sans-serif"}}>🛏 America's Mattress</div>
          <div style={{fontSize:11,color:"#6b7280",marginTop:2}}>Delivery Confirmation — {signDate} {signTime}</div>
        </div>

        {/* Delivery details */}
        <div style={{background:"#f9fafb",borderRadius:10,padding:"12px 14px",marginBottom:14,border:"1px solid #e5e7eb"}}>
          <div style={{fontWeight:700,fontSize:14,color:"#1a1a2e",marginBottom:4}}>{delivery.customer}</div>
          <div style={{fontSize:12,color:"#6b7280",marginBottom:2}}>{delivery.address}</div>
          {delivery.ticket_number&&<div style={{fontSize:11,color:"#6b7280"}}>Order #{delivery.ticket_number}</div>}
          <div style={{marginTop:8,fontSize:12,color:"#374151",fontWeight:600}}>Items Delivered:</div>
          {(delivery.items||[]).map((item,i)=>(
            <div key={i} style={{fontSize:12,color:"#374151",paddingLeft:8}}>• {item.qty}x {item.name}</div>
          ))}
        </div>

        {/* Agreement text */}
        <div style={{background:"#eff6ff",borderRadius:8,padding:"10px 12px",marginBottom:14,border:"1px solid #bfdbfe",fontSize:12,color:"#1e40af",lineHeight:1.6}}>
          {isEs
            ? `Al firmar a continuación, confirmo que recibí los artículos enumerados arriba en buenas condiciones en la dirección indicada el ${signDate}. Entregado por ${user.name} de America's Mattress.`
            : `By signing below, I confirm that I received the items listed above in good condition at the address listed on ${signDate}. Delivered by ${user.name} from America's Mattress Albuquerque.`
          }
        </div>

        {/* Printed name */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:5}}>
            {isEs?"Nombre en letra de molde (requerido):":"Print Your Full Name (required):"}
          </div>
          <input
            value={printedName}
            onChange={e=>setPrintedName(e.target.value)}
            placeholder={isEs?"Su nombre completo":"Your full name"}
            style={{width:"100%",border:"2px solid #d1d5db",borderRadius:8,padding:"10px 12px",fontSize:14,color:"#1a1a2e",fontFamily:"sans-serif",background:"#fff"}}
          />
        </div>

        {/* Signature area */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:5}}>
            {isEs?"Firma (requerida):":"Signature (required):"}
          </div>
          <div style={{border:"2px solid #d1d5db",borderRadius:8,background:"#fafafa",cursor:"crosshair",touchAction:"none",position:"relative"}}>
            <canvas ref={canvasRef} width={440} height={150}
              style={{width:"100%",height:150,borderRadius:8,display:"block",touchAction:"none"}}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}/>
            {!hasStrokes&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:12,color:"#9ca3af",pointerEvents:"none",whiteSpace:"nowrap"}}>{isEs?"Firme aquí":"Sign here"}</div>}
          </div>
          <div style={{borderTop:"2px solid #374151",marginTop:0,paddingTop:2,fontSize:10,color:"#9ca3af",textAlign:"center"}}>x</div>
        </div>

        {!printedName.trim()&&hasStrokes&&<div style={{fontSize:11,color:"#dc2626",marginBottom:8,textAlign:"center"}}>⚠️ {isEs?"Por favor ingrese su nombre":"Please enter your printed name"}</div>}

        <div style={{display:"flex",gap:8}}>
          <button className="btn" onClick={save} disabled={!canSubmit||saving}
            style={{flex:1,background:canSubmit?"#059669":"#d1d5db",color:canSubmit?"#fff":"#9ca3af",padding:"13px",fontSize:14,fontWeight:700,borderRadius:10}}>
            {saving?"⏳ Saving...":"✅ "+ (isEs?"Confirmar y Guardar":"Confirm & Save")}
          </button>
          <button className="btn" onClick={clear} style={{background:"#f3f4f6",color:"#6b7280",padding:"13px 14px",fontSize:13,borderRadius:10}}>🗑️</button>
          <button className="btn" onClick={onClose} style={{background:"#fee2e2",color:"#dc2626",padding:"13px 14px",fontSize:13,borderRadius:10}}>✕</button>
        </div>
        <div style={{fontSize:10,color:"#9ca3af",textAlign:"center",marginTop:8}}>
          {isEs?"Registrado permanentemente con marca de tiempo · America's Mattress Albuquerque":"Permanently recorded with timestamp · America's Mattress Albuquerque"}
        </div>
      </div>
    </div>
  );
}

function AddBaseTaskRow({ lang, setBaseTasks }) {
  const [t, setT] = useState({ text:"", priority:"high", category:"Delivery", days:["Mon","Tue","Wed","Fri","Sat"] });
  const add = () => {
    if (!t.text.trim()) return;
    setBaseTasks(prev => ({ ...prev, [lang]: [...prev[lang], { id:`bt-${Date.now()}`, ...t }] }));
    setT({ text:"", priority:"high", category:"Delivery", days:["Mon","Tue","Wed","Fri","Sat"] });
  };
  return (
    <div style={{background:"#0f1923",border:"1px solid #1e3a5f",borderRadius:12,padding:"14px 16px"}}>
      <div style={{fontSize:11,color:"#60a5fa",fontWeight:700,marginBottom:10}}>➕ Add {lang==="en"?"English":"Spanish"} Template</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 90px 110px",gap:8,marginBottom:8}}>
        <input value={t.text} onChange={e=>setT(p=>({...p,text:e.target.value}))} placeholder="Task description..." className="input"/>
        <select value={t.priority} onChange={e=>setT(p=>({...p,priority:e.target.value}))} className="select"><option value="high">High</option><option value="med">Med</option><option value="low">Low</option></select>
        <input value={t.category} onChange={e=>setT(p=>({...p,category:e.target.value}))} placeholder="Category" className="input"/>
      </div>
      <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap"}}>
        {ALL_DAYS.map(d=>(
          <label key={d} style={{fontSize:11,cursor:"pointer",padding:"3px 8px",borderRadius:5,background:t.days.includes(d)?"#0c2340":"#1e2d3d",color:t.days.includes(d)?"#60a5fa":"#64748b",border:`1px solid ${t.days.includes(d)?"#3b82f6":"#1e2d3d"}`}}>
            <input type="checkbox" checked={t.days.includes(d)} onChange={e=>setT(p=>({...p,days:e.target.checked?[...p.days,d]:p.days.filter(x=>x!==d)}))} style={{display:"none"}}/>{d}
          </label>
        ))}
      </div>
      <button className="btn" onClick={add} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"7px 14px",fontSize:12,border:"none"}}>➕ Add Template</button>
    </div>
  );
}

// ─── MAIN APP (MANAGER VIEW) ──────────────────────────────────────────────────
// ─── CUSTOMER TRACKING PAGE ──────────────────────────────────────────────────
function CustomerTrackingPage({ driverId, employees, deliveries }) {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  // Tracking links look like /track/<empId>-r<route> (e.g. "8-r1"). The
  // employees.id column is an integer, so passing the whole "8-r1" string to
  // the DB query threw a type error and tracking ALWAYS showed "not active".
  // Extract just the numeric employee id (works for legacy "/track/8" links too).
  const empId = parseInt(String(driverId).split("-")[0], 10);
  const driver = employees.find(e=>e.id===empId);

  useEffect(()=>{
    if (!Number.isFinite(empId)) { setLoading(false); return; }
    const load = async () => {
      const {data} = await sb.from("employees").select("last_location,name").eq("id",empId).single();
      if(data?.last_location) setLocation(data.last_location);
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 15000);
    return ()=>clearInterval(interval);
  },[empId]);

  const driverDels = deliveries.filter(d=>d.assigned_to===empId&&d.status!=="Delivered")
    .sort((a,b)=>(a.stop_order||0)-(b.stop_order||0));
  const completedCount = deliveries.filter(d=>d.assigned_to===empId&&d.status==="Delivered").length;

  return (
    <div style={{background:"#080d14",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'DM Sans',sans-serif",maxWidth:500,margin:"0 auto",padding:20}}>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{fontSize:36,marginBottom:8}}>🛏</div>
        <div style={{fontWeight:800,fontSize:20,color:"#f1f5f9"}}>America's Mattress</div>
        <div style={{fontSize:13,color:"#475569"}}>Live Delivery Tracking</div>
      </div>
      {loading?(
        <div style={{textAlign:"center",color:"#475569",padding:40}}>Loading driver location...</div>
      ):!location?(
        <div style={{textAlign:"center",color:"#475569",padding:40,background:"#0f1923",borderRadius:12}}>
          <div style={{fontSize:32,marginBottom:8}}>📍</div>
          <div>Driver tracking is not active yet. Check back when your driver is on the way!</div>
        </div>
      ):(
        <div>
          <div style={{background:"#052e16",borderRadius:10,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>🟢</span>
            <div>
              <div style={{fontWeight:700,color:"#4ade80"}}>{driver?.name||"Your Driver"} is on the way</div>
              <div style={{fontSize:11,color:"#475569"}}>Updated {new Date(location.ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
            </div>
          </div>
          {driverDels.length>0&&(
            <div style={{background:"#0f1923",borderRadius:10,padding:"12px 16px",marginBottom:14,border:"1px solid #1e2d3d"}}>
              <div style={{fontSize:12,color:"#475569",marginBottom:8}}>📦 {completedCount} delivered · {driverDels.length} remaining</div>
              {driverDels.slice(0,3).map((d,i)=>(
                <div key={d.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{fontSize:11,color:"#60a5fa",background:"#0c2340",borderRadius:4,padding:"2px 7px",flexShrink:0}}>Stop {d.stop_order}</span>
                  <span style={{fontSize:12,color:"#94a3b8"}}>{d.customer}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{borderRadius:10,overflow:"hidden",border:"1px solid #1e2d3d"}}>
            <iframe
              title="driver-location"
              width="100%" height="300"
              style={{border:0,display:"block"}}
              src={`https://maps.google.com/maps?q=${location.lat},${location.lng}&output=embed&z=13`}/>
          </div>
          <div style={{textAlign:"center",marginTop:14,fontSize:11,color:"#334155"}}>Map updates every 15 seconds</div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(()=>cacheGet("session", null));
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [selectedDay, setSelectedDay] = useState(todayDayName());
  const [employees, setEmployees] = useState(()=>cacheGet("employees", INITIAL_EMPLOYEES));
  const [deliveries, setDeliveries] = useState(()=>cacheGet("deliveries", []));
  const [customTasks, setCustomTasks] = useState(()=>cacheGet("customTasks", {}));
  const [baseTasks, setBaseTasks] = useState({ en: BASE_TASKS_EN, es: BASE_TASKS_ES });
  const [notes, setNotes] = useState(()=>cacheGet("notes", {}));
  const [problems, setProblems] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [noteInput, setNoteInput] = useState("");
  const [problemInput, setProblemInput] = useState({ empId:"", description:"", type:"customer" });
  const [customerMsg, setCustomerMsg] = useState({});
  const [sendingMsg, setSendingMsg] = useState(null);
  const [msgSent, setMsgSent] = useState({});
  const [newEmp, setNewEmp] = useState({ name:"", role:"Driver", lang:"en", workdays:["Mon","Tue","Wed","Fri"], pin:"" });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingEmp, setEditingEmp] = useState(null);
  const [editEmpVals, setEditEmpVals] = useState({});
  const [editingDelivery, setEditingDelivery] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editTaskVal, setEditTaskVal] = useState("");
  const [editingBaseTask, setEditingBaseTask] = useState(null);
  const [editBaseTaskVal, setEditBaseTaskVal] = useState("");
  const [newTaskInput, setNewTaskInput] = useState({ text:"", priority:"high", category:"Delivery", day:"All" });
  const [teamMsg, setTeamMsg] = useState("");
  const [mgrTaskChecks, setMgrTaskChecks] = useState({});
  const [mgrSchedDay, setMgrSchedDay] = useState(null);
  const [csvText, setCsvText] = useState("");
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfRoute, setPdfRoute] = useState(1);
  const [pdfResult, setPdfResult] = useState(null);
  const [signatures, setSignatures] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [liabilityForms, setLiabilityForms] = useState([]);
  const [smsTemplates, setSmsTemplates] = useState(DEFAULT_SMS_TEMPLATES);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editTemplateVal, setEditTemplateVal] = useState("");
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [showLiabilityPad, setShowLiabilityPad] = useState(null);
  const [driverMode, setDriverMode] = useState(false);
  const [smsReplies, setSmsReplies] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [receivingLog, setReceivingLog] = useState([]);
  const [trainingFiles, setTrainingFiles] = useState([]);
  const [newReceipt, setNewReceipt] = useState({reason:"",amount:"",receipt_date:new Date().toISOString().split("T")[0],photo_url:""});
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [newReceiving, setNewReceiving] = useState({received_date:new Date().toISOString().split("T")[0],vendor:"",received_by:"",quantity:1,notes:"",manufacturer:"",items:""});
  const [receivingSearch, setReceivingSearch] = useState("");
  const [bolUploading, setBolUploading] = useState(false);
  const [receiptMonth, setReceiptMonth] = useState(new Date().toISOString().slice(0,7));
  const [newTrainingFile, setNewTrainingFile] = useState({title:"",content:"",category:"New Hire",video_url:"",requires_signature:false});
  const [showAddTraining, setShowAddTraining] = useState(false);
  const [viewingTraining, setViewingTraining] = useState(null);
  const [probFilter, setProbFilter] = useState("open");
  const [editingProb, setEditingProb] = useState(null);
  const [newProb, setNewProb] = useState({customer:"",ticket_number:"",eta:"",description:"",what_to_do:"",type:"customer",status:"Open"});
  const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split("T")[0]);
  const [bouncieKey, setBouncieKey] = useState(()=>localStorage.getItem("bouncie_key")||"");
  const [bouncieVehicles, setBouncieVehicles] = useState([]);
  const [bouncieLoading, setBouncieLoading] = useState(false);
  const [reportWeek, setReportWeek] = useState(()=>{const d=new Date();d.setDate(d.getDate()-d.getDay());return d.toISOString().split("T")[0];});
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [pendingSync, setPendingSync] = useState(()=>outboxRead().length);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [sigSearch, setSigSearch] = useState("");
  const [trainingSession, setTrainingSession] = useState(null);
  const [trainingSigningEmp, setTrainingSigningEmp] = useState(null);
  const [trainingSubTab, setTrainingSubTab] = useState("log");
  const [editingFile, setEditingFile] = useState(null);
  const [newFileTitle, setNewFileTitle] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [newFileCategory, setNewFileCategory] = useState("New Hire");
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvDone, setCsvDone] = useState(false);
  const [mgrPrepDate, setMgrPrepDate] = useState(()=>{ const t=new Date(); t.setDate(t.getDate()+1); return t.toISOString().split("T")[0]; });
  const [todayDate] = useState(new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}));
  const [dateFilter, setDateFilter] = useState("today");
  const [inspections, setInspections] = useState([]);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");

  const todayStr = new Date().toISOString().split("T")[0]; const EMPTY_DEL = { id:"", customer:"", address:"", phone:"", items:[{qty:1,name:""}], delivery_window:"", assigned_to:1, status:"Scheduled", notes:"", floor:"1", elevator:false, removal_requested:false, transfer_scheduled:false, route_notes:"", stop_order:(deliveries.filter(d=>d.delivery_date===todayStr).length)+1, delivery_date:todayStr, ticket_number:"", helper_id:0 };

  // Load data
  useEffect(()=>{
    async function load() {
      setLoading(true);
      try {
        const [eR,dR,ctR,nR,pR,mR,sigR,insR,trR,tcR,lfR] = await Promise.all([
          sb.from("employees").select("id,name,role,avatar,lang,workdays,is_manager,last_location"),
          sb.from("deliveries").select("*"),
          sb.from("custom_tasks").select("*"),
          sb.from("notes").select("*"),
          sb.from("problems").select("*"),
          sb.from("messages").select("*").order("created_at",{ascending:true}),
          sb.from("signatures").select("*").order("signed_at",{ascending:false}),
          sb.from("inspections").select("*").order("created_at",{ascending:false}),
          sb.from("trainings").select("*").order("created_at",{ascending:false}),
          sb.from("training_completions").select("*"),
          sb.from("liability_forms").select("*").order("signed_at",{ascending:false}),
        ]);
        if (eR.data&&eR.data.length>0) { setEmployees(eR.data); cacheSet("employees", eR.data); }
        else { await sb.from("employees").upsert(INITIAL_EMPLOYEES); }
        if (dR.data) { setDeliveries(dR.data); cacheSet("deliveries", dR.data); }
        if (ctR.data) { const g={}; ctR.data.forEach(t=>{if(!g[t.emp_id])g[t.emp_id]=[];g[t.emp_id].push(t);}); setCustomTasks(g); cacheSet("customTasks", g); }
        if (nR.data) { const g={}; nR.data.forEach(n=>{if(!g[n.emp_id])g[n.emp_id]=[];g[n.emp_id].push(n);}); setNotes(g); cacheSet("notes", g); }
        if (pR.data) setProblems(pR.data);
        if (mR.data) setMessages(mR.data);
        if (sigR.data) setSignatures(sigR.data);
        if (insR.data) setInspections(insR.data);
        // Load receipts, receiving log, training files
        const [recRes, rvRes, tfRes, smsRes] = await Promise.all([
          sb.from("receipts").select("*").order("receipt_date",{ascending:false}),
          sb.from("receiving_log").select("*").order("received_date",{ascending:false}),
          sb.from("training_files").select("*").order("created_at",{ascending:false}),
          sb.from("sms_replies").select("*").order("id",{ascending:false}).limit(200),
        ]);
        if(recRes.data) setReceipts(recRes.data);
        if(rvRes.data) setReceivingLog(rvRes.data);
        if(tfRes.data) setTrainingFiles(tfRes.data);
        if(smsRes.data) setSmsReplies(smsRes.data);
        if (trR.data) setTrainings(trR.data);
        if (tcR.data) setCompletions(tcR.data);
        if (lfR.data) setLiabilityForms(lfR.data);
      } catch(e) { console.error(e); }
      setLoading(false);
    }
    load();
    const ds = sb.channel("d-ch").on("postgres_changes",{event:"*",schema:"public",table:"deliveries"},()=>{sb.from("deliveries").select("*").then(({data})=>{if(data)setDeliveries(data);});}).subscribe();
    const ms = sb.channel("m-ch").on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},(p)=>{setMessages(prev=>[...prev,p.new]);}).subscribe();
    const ps = sb.channel("p-ch").on("postgres_changes",{event:"*",schema:"public",table:"problems"},()=>{sb.from("problems").select("*").then(({data})=>{if(data)setProblems(data);});}).subscribe();
    // Silent refresh: home-screen apps get suspended (not reloaded) and their
    // realtime socket dies while backgrounded, so on resume they'd show stale
    // deliveries. Refetch the key data quietly (NO loading screen) whenever the
    // app returns to the front, regains focus, or reconnects. Defined BEFORE
    // syncNow so syncNow can reuse it.
    const refresh = async () => {
      if (!navigator.onLine) return;
      try {
        const [eR,dR,mR,pR] = await Promise.all([
          sb.from("employees").select("id,name,role,avatar,lang,workdays,is_manager,last_location"),
          sb.from("deliveries").select("*"),
          sb.from("messages").select("*").order("created_at",{ascending:true}),
          sb.from("problems").select("*"),
        ]);
        if (eR.data&&eR.data.length>0) { setEmployees(eR.data); cacheSet("employees", eR.data); }
        if (dR.data) { setDeliveries(dR.data); cacheSet("deliveries", dR.data); }
        if (mR.data) setMessages(mR.data);
        if (pR.data) setProblems(pR.data);
      } catch(e) {}
    };

    // Online/offline detection + outbox replay. When the connection returns,
    // push any queued offline writes then SILENTLY refetch. IMPORTANT: never
    // call load() here — load() shows the full-screen loading state, and if an
    // un-syncable ("poison") entry sits in the queue this fires every 20s and
    // makes the whole app appear to "constantly refresh." Only refetch when
    // something actually synced.
    const syncNow = async () => {
      if (!navigator.onLine) return;
      const before = outboxRead().length;
      if (before === 0) { setPendingSync(0); return; }
      setSyncing(true);
      const sent = await flushOutbox();
      setPendingSync(outboxRead().length);
      setSyncing(false);
      if (sent > 0) refresh();
    };
    const goOnline = () => { setIsOnline(true); syncNow(); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // Also retry on a timer in case the 'online' event is missed (flaky signal).
    const flushIv = setInterval(syncNow, 20000);
    syncNow();

    const onVisible = () => { if (document.visibilityState === 'visible') { syncNow(); refresh(); } };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);

    return ()=>{sb.removeChannel(ds);sb.removeChannel(ms);sb.removeChannel(ps);window.removeEventListener('online',goOnline);window.removeEventListener('offline',goOffline);clearInterval(flushIv);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('focus',refresh);};
  },[]);

  // Keep the signed-in user on this device so a reload in a dead zone doesn't
  // log them out (they verified their PIN online; no need to re-check offline).
  useEffect(()=>{
    if (currentUser) cacheSet("session", currentUser);
    else { try { localStorage.removeItem("am_cache_session"); } catch(e) {} }
  },[currentUser]);

  const getEmpDels = (id) => deliveries.filter(d=>d.assigned_to===id);
  const working = (emp,day) => emp.is_manager||emp.isManager||(emp.workdays||[]).includes(day);
  const getTasksForDay = (empId,day) => {
    const emp = employees.find(e=>e.id===empId);
    if (!emp||!working(emp,day)) return [];
    const base = (emp.lang==="es"?baseTasks.es:baseTasks.en).filter(t=>t.days.includes(day)||t.days.includes("All"));
    const custom = (customTasks[empId]||[]).filter(t=>t.day===day||t.day==="All");
    return [...base,...custom];
  };

  const saveDelivery = async (d) => {
    setSyncing(true);
    const today = new Date().toISOString().split('T')[0]; const row = { customer:d.customer,address:d.address,phone:d.phone,items:d.items||[],delivery_window:d.delivery_window||"",assigned_to:(d.assigned_to==null||d.assigned_to==="")?1:Number(d.assigned_to),status:d.status,notes:d.notes||"",floor:d.floor||"1",elevator:!!d.elevator,removal_requested:!!d.removal_requested,transfer_scheduled:!!d.transfer_scheduled,route_notes:d.route_notes||"",stop_order:Number(d.stop_order)||1,delivery_date:d.delivery_date||today,ticket_number:d.ticket_number||"",helper_id:Number(d.helper_id)||0,manufacturer:d.manufacturer||"",piece_number:d.piece_number||"" };
    if (!d.id) {
      const nid = `D-${String(deliveries.length+1).padStart(3,"0")}-${Date.now()}`;
      const newRow = {...row,id:nid};
      setDeliveries(prev=>{ const next=[...prev,newRow]; cacheSet("deliveries", next); return next; });
      const r = await tryWrite({ table:"deliveries", op:"insert", payload:newRow });
      setPendingSync(r.pending);
    } else {
      setDeliveries(prev=>{ const next=prev.map(x=>x.id===d.id?{...row,id:d.id}:x); cacheSet("deliveries", next); return next; });
      const r = await tryWrite({ table:"deliveries", op:"update", payload:row, match:{col:"id", val:d.id} });
      setPendingSync(r.pending);
    }
    setSyncing(false);
    setEditingDelivery(null);
  };

  const delDelivery = async (id) => { await sb.from("deliveries").delete().eq("id",id); setDeliveries(prev=>prev.filter(d=>d.id!==id)); };
  const updStatus = async (id,status) => {
    setDeliveries(prev=>{ const next=prev.map(d=>d.id===id?{...d,status}:d); cacheSet("deliveries", next); return next; });
    const r = await tryWrite({ table:"deliveries", op:"update", payload:{status}, match:{col:"id", val:id} });
    setPendingSync(r.pending);
  };

  const addTask = async (empId) => {
    if (!newTaskInput.text.trim()) return;
    const t = { id:`ct-${empId}-${Date.now()}`, emp_id:empId, text:newTaskInput.text.trim(), priority:newTaskInput.priority, category:newTaskInput.category, day:newTaskInput.day };
    await sb.from("custom_tasks").insert(t);
    setCustomTasks(prev=>({...prev,[empId]:[...(prev[empId]||[]),t]}));
    setNewTaskInput({text:"",priority:"high",category:"Delivery",day:"All"});
  };

  const delTask = async (empId,taskId) => { await sb.from("custom_tasks").delete().eq("id",taskId); setCustomTasks(prev=>({...prev,[empId]:(prev[empId]||[]).filter(t=>t.id!==taskId)})); };

  const addNote = async (empId) => {
    if (!noteInput.trim()) return;
    const n = { id:Date.now(), emp_id:empId, text:noteInput.trim(), time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) };
    await sb.from("notes").insert(n);
    setNotes(prev=>({...prev,[empId]:[...(prev[empId]||[]),n]}));
    setNoteInput("");
  };

  const logProblem = async () => {
    if (!problemInput.description.trim()||!problemInput.empId) return;
    const emp = employees.find(e=>e.id===Number(problemInput.empId));
    const p = { id:Date.now(), emp_name:emp?.name, description:problemInput.description, type:problemInput.type, escalation_step:0, time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}), resolved:false };
    await sb.from("problems").insert(p);
    setProblems(prev=>[...prev,p]);
    setProblemInput({empId:"",description:"",type:"customer"});
  };

  const escalate = async (id) => {
    const p = problems.find(x=>x.id===id);
    if (!p) return;
    const chain = ESCALATION[p.type];
    const next = Math.min((p.escalation_step||0)+1,chain.length-1);
    const resolved = next===chain.length-1;
    await sb.from("problems").update({escalation_step:next,resolved}).eq("id",id);
    setProblems(prev=>prev.map(x=>x.id===id?{...x,escalation_step:next,resolved}:x));
  };

  const genSMS = async (d) => {
    setSendingMsg(d.id);
    const items = (d.items||[]).map(i=>`${i.qty}x ${i.name}`).join(", ");
    try {
      const r = await fetch("/.netlify/functions/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:160,messages:[{role:"user",content:`Write a friendly SMS under 160 chars for America's Mattress. No payment info. Customer: ${d.customer}, Items: ${items}, Window: ${d.delivery_window}, Status: ${d.status}. Return ONLY the SMS text.`}]})});
      const data = await r.json();
      setCustomerMsg(prev=>({...prev,[d.id]:data.content.map(b=>b.text||"").join("").trim()}));
    } catch {
      setCustomerMsg(prev=>({...prev,[d.id]:`Hi ${d.customer.split(" ")[0]}! Your delivery is set for ${d.delivery_window}. We'll call 30 min before arrival! – America's Mattress`}));
    }
    setSendingMsg(null);
    setMsgSent(prev=>({...prev,[d.id]:true}));
    setTimeout(()=>setMsgSent(prev=>({...prev,[d.id]:false})),3000);
  };

  const sendCustomerSMS = async (delivery, type) => {
    if (!delivery.phone) return { ok: false, error: "No phone number" };
    // Format phone to E.164 (+1XXXXXXXXXX)
    let phone = delivery.phone.replace(/\D/g,"");
    if (phone.length===10) phone = "+1"+phone;
    else if (phone.length===11&&phone.startsWith("1")) phone = "+"+phone;
    else phone = "+"+phone;
    const name = delivery.customer.split(" ")[0];
    const items = (delivery.items||[]).map(i=>i.name).join(", ");
    let body = smsTemplates[type] || "";
    body = body.replace("{name}", name)
               .replace("{date}", delivery.delivery_date||"today")
               .replace("{window}", delivery.delivery_window||"your scheduled window")
               .replace("{items}", items)
               .replace("{review_link}", GOOGLE_REVIEW_LINK||"");
    const result = await sendSMS(phone, body);
    return result;
  };

  const sendTeamMsg = async () => {
    if (!teamMsg.trim()) return;
    const m = { id:Date.now(), sender_id:0, sender_name:"Conner", text:teamMsg.trim(), delivery_id:null, photo_url:null, created_at:new Date().toISOString() };
    try { await sb.from("messages").insert(m); } catch(e) {}
    setMessages(prev=>[...prev,m]);
    setTeamMsg("");
  };

  const addEmp = async () => {
    if (!newEmp.name.trim()) return;
    const initials = newEmp.name.trim().split(" ").map(w=>w[0].toUpperCase()).join("").slice(0,2);
    const nextId = Math.max(...employees.map(e=>e.id))+1;
    const emp = {id:nextId,name:newEmp.name.trim(),role:newEmp.role,avatar:initials,lang:newEmp.lang,workdays:newEmp.workdays,is_manager:false,pin:newEmp.pin||String(nextId).padStart(4,"0")};
    await sb.from("employees").insert(emp);
    setEmployees(prev=>[...prev,emp]);
    setNewEmp({name:"",role:"Driver",lang:"en",workdays:["Mon","Tue","Wed","Fri"],pin:""});
  };

  // Date filtering
  const getFilteredDeliveries = () => {
    const now = new Date();
    const todayISO = now.toISOString().split("T")[0];
    if (dateFilter==="today") return deliveries.filter(d=>(d.delivery_date||todayISO)===todayISO);
    if (dateFilter==="week") {
      const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate()-7);
      return deliveries.filter(d=>new Date(d.delivery_date||todayISO)>=weekAgo);
    }
    if (dateFilter==="month") {
      const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate()-30);
      return deliveries.filter(d=>new Date(d.delivery_date||todayISO)>=monthAgo);
    }
    if (dateFilter==="custom" && customDateFrom) {
      return deliveries.filter(d=>{
        const dd = d.delivery_date||todayISO;
        return dd>=customDateFrom && (!customDateTo||dd<=customDateTo);
      });
    }
    return deliveries;
  };
  const filteredDeliveries = getFilteredDeliveries();

  const stats = {
    total:deliveries.length,
    delivered:deliveries.filter(d=>d.status==="Delivered").length,
    inTransit:deliveries.filter(d=>d.status==="In Transit").length,
    scheduled:deliveries.filter(d=>d.status==="Scheduled").length,
    issues:deliveries.filter(d=>["Issue","Rescheduled"].includes(d.status)).length,
  };

  // Customer tracking page route
  const trackMatch = window.location.pathname.match(/^\/track\/(.+)$/);
  if (trackMatch) return (
    <CustomerTrackingPage
      driverId={trackMatch[1]}
      employees={employees}
      deliveries={deliveries}
    />
  );

  // Global offline / pending-sync banner. Shows when there's no connection or
  // when there are queued writes waiting to sync. Lets drivers trust the app
  // instead of falling back to paper when service drops.
  const offlineBanner = (!isOnline || pendingSync>0) ? (
    <div style={{position:"sticky",top:0,zIndex:900,padding:"7px 14px",textAlign:"center",fontSize:12.5,fontWeight:700,
      background:!isOnline?"#7c2d12":"#1e3a2f",color:!isOnline?"#fed7aa":"#86efac",borderBottom:`1px solid ${!isOnline?"#9a3412":"#166534"}`}}>
      {!isOnline
        ? `📴 Offline — your work is saved on this device${pendingSync>0?` (${pendingSync} change${pendingSync>1?"s":""} waiting to sync)`:""}`
        : (syncing ? `🔄 Syncing ${pendingSync} change${pendingSync>1?"s":""}…` : `⏳ ${pendingSync} change${pendingSync>1?"s":""} waiting to sync`)}
    </div>
  ) : null;

  if (loading) return (
    <div style={{background:"#080d14",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:14,fontFamily:"'DM Sans',sans-serif"}}>
      <style>{GLOBAL_STYLES}</style>
      <div style={{fontSize:48}}>🛏</div>
      <div style={{color:"#60a5fa",fontSize:16}}>Loading America's Mattress...</div>
    </div>
  );

  if (!currentUser) return <LoginScreen employees={employees} onLogin={setCurrentUser}/>;

  if (driverMode) return (
    <div>
      {offlineBanner}
      <div style={{background:"#7c3aed",padding:"8px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{color:"#fff",fontSize:12,fontWeight:600}}>👑 Conner — Driver Mode</span>
        <button className="btn" onClick={()=>setDriverMode(false)} style={{background:"rgba(255,255,255,0.2)",color:"#fff",padding:"5px 12px",fontSize:12}}>← Back to Manager</button>
      </div>
      <DriverView
        user={currentUser} deliveries={deliveries} customTasks={customTasks} baseTasks={baseTasks}
        messages={messages} problems={problems} employees={employees}
        onStatusUpdate={updStatus} onLogout={()=>setCurrentUser(null)}
        onSendMessage={(m)=>setMessages(prev=>[...prev,m])}
        onLogProblem={(p)=>setProblems(prev=>[...prev,p])}
        onSaveDelivery={saveDelivery}
        smsTemplates={smsTemplates}
      trainingFiles={trainingFiles}
      completions={completions}
      setCompletions={setCompletions}
        onSaveSignature={(delId, url, at)=>{
          setDeliveries(prev=>prev.map(d=>d.id===delId?{...d,signature_url:url,signed_at:at,status:"Delivered"}:d));
          sb.from("signatures").select("*").order("signed_at",{ascending:false}).then(({data})=>{if(data)setSignatures(data);});
        }}
      />
    </div>
  );

  if (!currentUser.is_manager&&!currentUser.isManager&&currentUser.role!=='Manager') return (
    <div>
      {offlineBanner}
      <DriverView
        user={currentUser} deliveries={deliveries} customTasks={customTasks} baseTasks={baseTasks}
        messages={messages} problems={problems} employees={employees}
        onStatusUpdate={updStatus} onLogout={()=>setCurrentUser(null)}
        onSendMessage={(m)=>setMessages(prev=>[...prev,m])}
        onLogProblem={(p)=>setProblems(prev=>[...prev,p])}
        onSaveDelivery={saveDelivery}
        smsTemplates={smsTemplates}
        onSaveSignature={(delId, url, at, signedBy)=>{
          setDeliveries(prev=>prev.map(d=>d.id===delId?{...d,signature_url:url,signed_at:at,signed_by:signedBy,status:"Delivered"}:d));
          sb.from("signatures").select("*").order("signed_at",{ascending:false}).then(({data})=>{if(data)setSignatures(data);});
        }}
      />
    </div>
  );

  // ── MANAGER LAYOUT ──
  const C = {
    card: {background:"#0f1923",border:"1px solid #1e2d3d",borderRadius:12},
    inp: {background:"#0a1628",border:"1px solid #1e2d3d",borderRadius:8,padding:"9px 12px",fontSize:13,color:"#e2e8f0",width:"100%",fontFamily:"inherit"},
    sel: {background:"#0a1628",border:"1px solid #1e2d3d",borderRadius:8,padding:"9px 12px",fontSize:13,color:"#e2e8f0",width:"100%",fontFamily:"inherit"},
  };

  return (
    <div style={{fontFamily:"'DM Sans','Segoe UI',sans-serif",background:"#080d14",minHeight:"100vh",color:"#e2e8f0"}}>
      <style>{GLOBAL_STYLES}</style>
      {offlineBanner}

      {/* Header */}
      <div style={{background:"#0a1628",borderBottom:"1px solid #1e2d3d"}}>
        <div style={{maxWidth:1180,margin:"0 auto",padding:"0 16px",display:"flex",alignItems:"center",justifyContent:"space-between",height:58}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,background:"linear-gradient(135deg,#2563eb,#1d4ed8)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🛏</div>
            <div>
              <div style={{fontWeight:800,fontSize:14,color:"#f1f5f9"}}>America's Mattress</div>
              <div style={{fontSize:10,color:"#475569",fontFamily:"'DM Mono',monospace"}}>{syncing?"● Saving...":isOnline?"● Live":"🔴 Offline"} · {todayDate}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#4f46e5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#fff"}}>CO</div>
            <button className="btn" onClick={()=>setDriverMode(true)} style={{background:"linear-gradient(135deg,#059669,#047857)",color:"#fff",padding:"5px 10px",fontSize:11,marginRight:4}}>🚛 Driver Mode</button>
            <button className="btn" onClick={()=>setCurrentUser(null)} style={{background:"#1e2d3d",color:"#64748b",padding:"5px 10px",fontSize:11}}>Sign Out</button>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{background:"#0a1628",borderBottom:"1px solid #1e2d3d",overflowX:"auto"}}>
        <div className="mgr-nav" style={{display:"flex",minWidth:"max-content",padding:"0 8px"}}>
          {[
            {key:"dashboard",label:"Dashboard",icon:"⬛"},
            {key:"tasks",label:"Tasks",icon:"✅"},
            {key:"deliveries",label:"Deliveries",icon:"🚛"},
            {key:"messages",label:"Messages",icon:"💬"},
            {key:"problems",label:"Problems",icon:"⚠️"},
            {key:"comms",label:"SMS",icon:"📱"},
            {key:"inventory",label:"Inventory",icon:"📦"},
            {key:"team",label:"Team",icon:"👥"},
            {key:"basetasks",label:"Templates",icon:"✏️"},
            {key:"inspections",label:"Inspections",icon:"🔍"},
            {key:"mgr-schedule",label:"Schedule",icon:"📅"},
            {key:"mgr-prep",label:"Prep",icon:"📋"},
            {key:"import",label:"Import",icon:"📥"},
            {key:"signatures",label:"Signatures",icon:"✍️"},
            {key:"trainings",label:"Trainings",icon:"🎓"},
            {key:"liability",label:"Liability",icon:"📝"},
            {key:"sms-setup",label:"SMS Setup",icon:"📱"},
            
            {key:"sms-replies",label:"Replies",icon:"💬"},
            {key:"weekly-report",label:"Weekly",icon:"📊"},
            {key:"daily-summary",label:"Daily",icon:"🖨️"},
            {key:"receipts",label:"Receipts",icon:"🧾"},
            {key:"receiving",label:"Receiving",icon:"📬"},
            {key:"training-files",label:"Training",icon:"🎬"},
            {key:"bouncie",label:"Trucks",icon:"🛰️"},
          ].map(t=>(
            <button key={t.key} className="btn" onClick={()=>setTab(t.key)}
              style={{padding:"12px 13px",fontSize:12,fontWeight:500,whiteSpace:"nowrap",color:tab===t.key?"#60a5fa":"#64748b",borderBottom:tab===t.key?"2px solid #3b82f6":"2px solid transparent",background:"none",borderRadius:0}}>
              {t.icon} {t.label}
              {t.key==="problems"&&problems.filter(p=>!p.resolved).length>0&&<span style={{marginLeft:4,background:"#ef4444",color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:10}}>{problems.filter(p=>!p.resolved).length}</span>}
              {t.key==="messages"&&messages.filter(m=>!m.delivery_id).length>0&&<span style={{marginLeft:4,background:"#2563eb",color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:10}}>{messages.filter(m=>!m.delivery_id).length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:1180,margin:"0 auto",padding:"16px"}}>

        {/* DASHBOARD */}
        {tab==="dashboard"&&(
          <div className="fade">
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:10,marginBottom:18}} /* responsive */>
              {[{l:"Total",v:stats.total,c:"#3b82f6",i:"📦"},{l:"Scheduled",v:stats.scheduled,c:"#64748b",i:"🕐"},{l:"In Transit",v:stats.inTransit,c:"#3b82f6",i:"🚛"},{l:"Delivered",v:stats.delivered,c:"#22c55e",i:"✅"},{l:"Issues",v:stats.issues,c:"#ef4444",i:"⚠️"}].map(s=>(
                <div key={s.l} style={{...C.card,padding:"13px 15px"}}>
                  <div style={{fontSize:18,marginBottom:4}}>{s.i}</div>
                  <div style={{fontSize:26,fontWeight:700,color:s.c,fontFamily:"'DM Mono',monospace",lineHeight:1}}>{s.v}</div>
                  <div style={{fontSize:10,color:"#475569",marginTop:4}}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:11,color:"#475569"}}>Day:</span>
              {ALL_DAYS.map(d=>(
                <button key={d} className="btn" onClick={()=>setSelectedDay(d)} style={{padding:"4px 11px",fontSize:11,background:selectedDay===d?"linear-gradient(135deg,#2563eb,#1d4ed8)":"#1e2d3d",color:selectedDay===d?"#fff":"#94a3b8"}}>{d}</button>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:9,marginBottom:18}} /* responsive */>
              {employees.map(emp=>{
                const w=working(emp,selectedDay);
                const eds=getEmpDels(emp.id);
                const done=eds.filter(d=>d.status==="Delivered").length;
                const pct=eds.length?Math.round(done/eds.length*100):0;
                return(
                  <div key={emp.id} style={{...C.card,padding:"13px 15px",cursor:"pointer",opacity:w?1:.35}} className="fade"
                    onClick={()=>{setTab("tasks");setSelectedEmployee(emp.id);}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                      <div style={{width:30,height:30,borderRadius:"50%",background:avatarBg(emp),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0}}>{emp.avatar}</div>
                      <div>
                        <div style={{fontWeight:600,fontSize:12,color:"#f1f5f9"}}>{emp.name}{emp.is_manager?" 👑":""}{emp.lang==="es"?" 🇲🇽":""}</div>
                        <div style={{fontSize:10,color:w?"#22c55e":"#475569"}}>{w?"Working":"Off"}</div>
                      </div>
                    </div>
                    {w&&<>
                      <div style={{height:3,background:"#1e2d3d",borderRadius:2,overflow:"hidden",marginBottom:4}}>
                        <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#2563eb,#22c55e)",borderRadius:2}}/>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#475569"}}>
                        <span>{done}/{eds.length} del</span>
                        <span style={{color:pct===100?"#22c55e":"#60a5fa",fontWeight:600}}>{pct}%</span>
                      </div>
                    </>}
                  </div>
                );
              })}
            </div>
            {deliveries.length>0&&(
              <div style={{...C.card,overflow:"hidden"}}>
                {[...deliveries].sort((a,b)=>(a.stop_order||0)-(b.stop_order||0)).map((d,i)=>{
                  const emp=employees.find(e=>e.id===d.assigned_to);
                  const sc=STATUS_COLORS[d.status]||STATUS_COLORS["Scheduled"];
                  return(
                    <div key={d.id} style={{display:"flex",alignItems:"center",padding:"10px 16px",borderBottom:i<deliveries.length-1?"1px solid #131f2e":"none",gap:10,flexWrap:"wrap"}}>
                      <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#64748b",width:22}}>#{d.stop_order}</span>
                      <div style={{flex:1,minWidth:100}}>
                        <div style={{fontWeight:600,fontSize:12,color:"#e2e8f0"}}>{d.customer}</div>
                        <div style={{fontSize:10,color:"#475569"}}>{(d.items||[]).map(i=>`${i.qty}x ${i.name}`).join(", ")}</div>
                      </div>
                      <div style={{fontSize:11,color:"#64748b"}}>{d.delivery_window}</div>
                      <div style={{fontSize:11,color:"#64748b",width:80}}>{emp?.name}</div>
                      <span className="badge" style={{background:sc.bg,color:sc.text}}>
                        <span style={{width:5,height:5,borderRadius:"50%",background:sc.dot,...(d.status==="In Transit"?{animation:"pulse 2s infinite"}:{})}}/>
                        {d.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TASKS */}
        {tab==="tasks"&&(
          <div className="fade">
            <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:11,color:"#475569"}}>Day:</span>
              {ALL_DAYS.map(d=>(
                <button key={d} className="btn" onClick={()=>setSelectedDay(d)} style={{padding:"4px 11px",fontSize:11,background:selectedDay===d?"linear-gradient(135deg,#2563eb,#1d4ed8)":"#1e2d3d",color:selectedDay===d?"#fff":"#94a3b8"}}>{d}</button>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"min(190px,30%) 1fr",gap:14}} /* responsive */>
              <div className="tasks-sidebar" style={{display:"flex",flexDirection:"column",gap:6,overflowY:"auto",maxHeight:"70vh"}}>
                {employees.map(emp=>{
                  const w=working(emp,selectedDay);
                  return(
                    <button key={emp.id} className="btn" onClick={()=>setSelectedEmployee(emp.id)}
                      style={{...C.card,padding:"9px 12px",textAlign:"left",display:"flex",alignItems:"center",gap:8,opacity:w?1:.4,borderColor:selectedEmployee===emp.id?"#3b82f6":"#1e2d3d",background:selectedEmployee===emp.id?"#0c1f38":"#0f1923"}}>
                      <div style={{width:26,height:26,borderRadius:"50%",background:avatarBg(emp),display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff",flexShrink:0}}>{emp.avatar}</div>
                      <div>
                        <div style={{fontWeight:600,fontSize:11,color:"#f1f5f9"}}>{emp.name}</div>
                        <div style={{fontSize:9,color:w?"#22c55e":"#475569"}}>{w?"Working":"Off"}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div>
                {!selectedEmployee?(
                  <div style={{...C.card,padding:40,textAlign:"center",color:"#475569"}}><div style={{fontSize:28,marginBottom:6}}>👈</div><div>Select an employee</div></div>
                ):(()=>{
                  const emp=employees.find(e=>e.id===selectedEmployee);
                  if(!emp) return null;
                  const tasks=getTasksForDay(emp.id,selectedDay);
                  const cats=[...new Set(tasks.map(t=>t.category))];
                  const isEs=emp.lang==="es";
                  return(
                    <div>
                      <div style={{...C.card,padding:"13px 16px",marginBottom:10}}>
                        <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>{emp.name} — {selectedDay}</div>
                        <div style={{fontSize:11,color:"#475569",marginTop:2}}>{emp.role} · {tasks.length} tasks · {getEmpDels(emp.id).length} deliveries</div>
                      </div>
                      {!working(emp,selectedDay)&&<div style={{...C.card,padding:"9px 14px",marginBottom:10,borderColor:"#1c1500",color:"#f59e0b",fontSize:12}}>⚠️ {emp.name} is not scheduled on {selectedDay}.</div>}
                      {cats.length>0&&(
                        <div style={{...C.card,marginBottom:10}}>
                          {cats.map(cat=>(
                            <div key={cat}>
                              <div style={{padding:"7px 14px",background:"#0a1628",fontSize:10,fontWeight:700,letterSpacing:".1em",color:"#475569",textTransform:"uppercase",borderBottom:"1px solid #131f2e"}}>{cat}</div>
                              {tasks.filter(t=>t.category===cat).map((task,i)=>(
                                <div key={task.id||i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"9px 14px",borderBottom:"1px solid #0f1923"}}>
                                  <div style={{width:6,height:6,borderRadius:"50%",background:task.priority==="high"?"#ef4444":task.priority==="med"?"#f59e0b":"#475569",marginTop:5,flexShrink:0}}/>
                                  <div style={{flex:1}}>
                                    {editingTask===task.id?(
                                      <div style={{display:"flex",gap:6}}>
                                        <input value={editTaskVal} onChange={e=>setEditTaskVal(e.target.value)} style={{flex:1,...C.inp,border:"1px solid #3b82f6"}}/>
                                        <button className="btn" onClick={async()=>{await sb.from("custom_tasks").update({text:editTaskVal}).eq("id",task.id);setCustomTasks(prev=>({...prev,[emp.id]:(prev[emp.id]||[]).map(t=>t.id===task.id?{...t,text:editTaskVal}:t)}));setEditingTask(null);}} style={{background:"#1d4ed8",color:"#fff",padding:"4px 10px",fontSize:11}}>Save</button>
                                        <button className="btn" onClick={()=>setEditingTask(null)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"4px 8px",fontSize:11}}>✕</button>
                                      </div>
                                    ):(
                                      <div style={{fontSize:12,color:"#e2e8f0"}}>{task.text}</div>
                                    )}
                                  </div>
                                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                                    <div onClick={()=>{const k=`mgr-${selectedEmployee}-${selectedDay}-${task.id||i}`;setMgrTaskChecks(prev=>({...prev,[k]:!prev[k]}));}}
                                      style={{width:18,height:18,borderRadius:4,border:`2px solid ${mgrTaskChecks[`mgr-${selectedEmployee}-${selectedDay}-${task.id||i}`]?"#22c55e":"#334155"}`,background:mgrTaskChecks[`mgr-${selectedEmployee}-${selectedDay}-${task.id||i}`]?"#22c55e":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
                                      {mgrTaskChecks[`mgr-${selectedEmployee}-${selectedDay}-${task.id||i}`]&&<span style={{color:"#fff",fontSize:11,fontWeight:700}}>✓</span>}
                                    </div>
                                  </div>
                                  {String(task.id||"").startsWith("ct")&&(
                                    <div style={{display:"flex",gap:4}}>
                                      <button className="btn" onClick={()=>{setEditingTask(task.id);setEditTaskVal(task.text);}} style={{background:"#1e2d3d",color:"#60a5fa",padding:"3px 7px",fontSize:10}}>Edit</button>
                                      <button className="btn" onClick={()=>delTask(emp.id,task.id)} style={{background:"#2d0a0a",color:"#f87171",padding:"3px 7px",fontSize:10}}>✕</button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{...C.card,padding:"13px 16px",marginBottom:10}}>
                        <div style={{fontWeight:600,fontSize:12,color:"#f1f5f9",marginBottom:8}}>➕ Add Task for {emp.name}</div>
                        <div className="task-add-grid" style={{display:"grid",gridTemplateColumns:"1fr 85px",gap:8,marginBottom:8}}>
                          <input value={newTaskInput.text} onChange={e=>setNewTaskInput(p=>({...p,text:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addTask(emp.id)} placeholder="Task..." style={C.inp}/>
                          <select value={newTaskInput.priority} onChange={e=>setNewTaskInput(p=>({...p,priority:e.target.value}))} style={C.sel}><option value="high">High</option><option value="med">Med</option><option value="low">Low</option></select>
                          <input value={newTaskInput.category} onChange={e=>setNewTaskInput(p=>({...p,category:e.target.value}))} placeholder="Category" style={C.inp}/>
                          <select value={newTaskInput.day} onChange={e=>setNewTaskInput(p=>({...p,day:e.target.value}))} style={C.sel}><option value="All">All Days</option>{ALL_DAYS.map(d=><option key={d} value={d}>{d}</option>)}</select>
                        </div>
                        <button className="btn" onClick={()=>addTask(emp.id)} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"7px 15px",fontSize:12}}>➕ Add</button>
                      </div>
                      <div style={{...C.card,padding:"13px 16px"}}>
                        <div style={{fontWeight:600,fontSize:12,color:"#f1f5f9",marginBottom:8}}>💬 {isEs?"Notas":"Manager Notes"}</div>
                        {(notes[selectedEmployee]||[]).map(n=>(
                          <div key={n.id} style={{background:"#0a1628",borderRadius:6,padding:"6px 10px",marginBottom:5,display:"flex",justifyContent:"space-between"}}>
                            <span style={{fontSize:12,color:"#cbd5e1"}}>{n.text}</span>
                            <span style={{fontSize:10,color:"#475569",marginLeft:8,flexShrink:0}}>{n.time}</span>
                          </div>
                        ))}
                        <div style={{display:"flex",gap:6,marginTop:6}}>
                          <input value={noteInput} onChange={e=>setNoteInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addNote(selectedEmployee)} placeholder={isEs?"Añadir nota...":"Add a note..."} style={{flex:1,...C.inp}}/>
                          <button className="btn" onClick={()=>addNote(selectedEmployee)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"7px 12px",fontSize:12}}>Add</button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* DELIVERIES */}
        {tab==="deliveries"&&(
          <div className="fade">
            {/* Date filter */}
            <div style={{display:"flex",gap:7,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:11,color:"#475569"}}>Show:</span>
              {[{v:"today",l:"Today"},{v:"week",l:"Last 7 Days"},{v:"month",l:"Last 30 Days"},{v:"all",l:"All (90 days)"},{v:"custom",l:"Custom"}].map(f=>(
                <button key={f.v} className="btn" onClick={()=>setDateFilter(f.v)}
                  style={{padding:"4px 12px",fontSize:11,background:dateFilter===f.v?"linear-gradient(135deg,#2563eb,#1d4ed8)":"#1e2d3d",color:dateFilter===f.v?"#fff":"#94a3b8"}}>
                  {f.l}
                </button>
              ))}
              {dateFilter==="custom"&&(
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                  <input type="date" value={customDateFrom} onChange={e=>setCustomDateFrom(e.target.value)} style={{background:"#0a1628",border:"1px solid #1e2d3d",borderRadius:7,padding:"4px 9px",fontSize:12,color:"#e2e8f0",fontFamily:"inherit"}}/>
                  <span style={{color:"#475569",fontSize:11}}>to</span>
                  <input type="date" value={customDateTo} onChange={e=>setCustomDateTo(e.target.value)} style={{background:"#0a1628",border:"1px solid #1e2d3d",borderRadius:7,padding:"4px 9px",fontSize:12,color:"#e2e8f0",fontFamily:"inherit"}}/>
                </div>
              )}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {Object.entries(STATUS_COLORS).map(([s,c])=>(
                  <span key={s} className="badge" style={{background:c.bg,color:c.text,padding:"4px 10px"}}>
                    <span style={{width:5,height:5,borderRadius:"50%",background:c.dot}}/>{s} — {filteredDeliveries.filter(d=>d.status===s).length}
                  </span>
                ))}
              </div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                <button className="btn" onClick={async()=>{
                  if(!window.confirm("Reset all stop numbers to start from 1? Do this at the start of each new day.")) return;
                  const today = new Date().toISOString().split("T")[0];
                  const todayDels = deliveries.filter(d=>(d.delivery_date||today)===today).sort((a,b)=>(a.stop_order||0)-(b.stop_order||0));
                  let stop = 1;
                  for(const d of todayDels){
                    await sb.from("deliveries").update({stop_order:stop}).eq("id",d.id);
                    stop++;
                  }
                  const {data} = await sb.from("deliveries").select("*");
                  if(data) setDeliveries(data);
                  alert("✅ Stop numbers reset to 1-"+todayDels.length+" for today!");
                }} style={{background:"#1c1500",color:"#f59e0b",padding:"7px 13px",fontSize:12,fontWeight:600}}>
                  🔄 New Day Reset
                </button>
                <button className="btn" onClick={()=>setEditingDelivery({id:"",customer:"",address:"",phone:"",items:[{qty:1,name:""}],delivery_window:"",assigned_to:0,status:"Scheduled",notes:"",floor:"1",elevator:false,removal_requested:false,transfer_scheduled:false,route_notes:"",stop_order:(deliveries.filter(d=>d.delivery_date===new Date().toISOString().split("T")[0]).length)+1,delivery_date:new Date().toISOString().split("T")[0],ticket_number:"",helper_id:0})} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"7px 15px",fontSize:13}}>➕ Add Delivery</button>
              </div>
            </div>
            {editingDelivery&&(
              <div style={{...C.card,padding:"16px 18px",marginBottom:14,borderColor:"#3b82f6"}}>
                <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9",marginBottom:12}}>{editingDelivery.id?"✏️ Edit":"➕ New Delivery"}</div>
                <div className="del-form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:9}}>
                  {[{l:"Ticket #",f:"ticket_number",ph:"e.g. 1042"},{l:"Customer",f:"customer",ph:"John Smith"},{l:"Address",f:"address",ph:"123 Main St"},{l:"Phone",f:"phone",ph:"505-555-0100"},{l:"Time Window",f:"delivery_window",ph:"9AM–11AM"},{l:"Floor",f:"floor",ph:"1"},{l:"Delivery Date",f:"delivery_date",ph:"",type:"date"}].map(x=>(
                    <div key={x.f}><div style={{fontSize:10,color:"#475569",marginBottom:3}}>{x.l}</div><input type={x.type||"text"} value={editingDelivery[x.f]||""} onChange={e=>setEditingDelivery(p=>({...p,[x.f]:e.target.value}))} placeholder={x.ph} style={{...C.inp,colorScheme:"dark"}}/></div>
                  ))}
                </div>
                <div style={{marginBottom:9}}>
                  <div style={{fontSize:10,color:"#475569",marginBottom:5}}>Items</div>
                  {(editingDelivery.items||[{qty:1,name:""}]).map((item,idx)=>(
                    <div key={idx} style={{background:"#0a1628",borderRadius:8,padding:"10px 12px",marginBottom:8,border:"1px solid #1e2d3d"}}>
                      <div style={{display:"flex",gap:6,marginBottom:6}}>
                        <input type="number" min="1" value={item.qty} onChange={e=>{const items=[...(editingDelivery.items||[])];items[idx]={...items[idx],qty:Number(e.target.value)};setEditingDelivery(p=>({...p,items}));}} style={{...C.inp,width:60,textAlign:"center"}}/>
                        <input value={item.name} onChange={e=>{const items=[...(editingDelivery.items||[])];items[idx]={...items[idx],name:e.target.value};setEditingDelivery(p=>({...p,items}));}} placeholder="Item name" style={{...C.inp,flex:1}}/>
                        {(editingDelivery.items||[]).length>1&&<button className="btn" onClick={()=>setEditingDelivery(p=>({...p,items:p.items.filter((_,i)=>i!==idx)}))} style={{background:"#2d0a0a",color:"#f87171",padding:"7px 9px",fontSize:12}}>✕</button>}
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:10,color:"#475569",marginBottom:2}}>Manufacturer</div>
                          <input value={item.manufacturer||""} onChange={e=>{const items=[...(editingDelivery.items||[])];items[idx]={...items[idx],manufacturer:e.target.value};setEditingDelivery(p=>({...p,items}));}} placeholder="e.g. Serta" style={{...C.inp,fontSize:12}}/>
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:10,color:"#475569",marginBottom:2}}>Piece #</div>
                          <input value={item.piece_number||""} onChange={e=>{const items=[...(editingDelivery.items||[])];items[idx]={...items[idx],piece_number:e.target.value};setEditingDelivery(p=>({...p,items}));}} placeholder="e.g. 500833819-7550" style={{...C.inp,fontSize:12}}/>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button className="btn" onClick={()=>setEditingDelivery(p=>({...p,items:[...(p.items||[]),{qty:1,name:""}]}))} style={{background:"#1e2d3d",color:"#60a5fa",padding:"5px 11px",fontSize:11}}>➕ Add Item</button>
                </div>
                <div className="del-form-3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:9,marginBottom:9}}>
                  <div><div style={{fontSize:10,color:"#475569",marginBottom:3}}>Driver</div><select value={editingDelivery.assigned_to ?? 1} onChange={e=>setEditingDelivery(p=>({...p,assigned_to:Number(e.target.value)}))} style={C.sel}>{employees.map(e=><option key={e.id} value={e.id}>{e.name}{e.is_manager?" 👑":""}</option>)}</select></div>
                  <div><div style={{fontSize:10,color:"#475569",marginBottom:3}}>Helper (optional)</div><select value={editingDelivery.helper_id||0} onChange={e=>setEditingDelivery(p=>({...p,helper_id:Number(e.target.value)}))} style={C.sel}><option value={0}>None</option>{employees.filter(e=>e.id!==0).map(e=><option key={e.id} value={e.id}>{e.name}{e.is_manager?" 👑":""}</option>)}</select></div>

                  <div><div style={{fontSize:10,color:"#475569",marginBottom:3}}>Status</div><select value={editingDelivery.status} onChange={e=>setEditingDelivery(p=>({...p,status:e.target.value}))} style={C.sel}>{Object.keys(STATUS_COLORS).map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                  <div><div style={{fontSize:10,color:"#475569",marginBottom:3}}>Stop #</div><input type="number" value={editingDelivery.stop_order||1} onChange={e=>setEditingDelivery(p=>({...p,stop_order:Number(e.target.value)}))} style={C.inp}/></div>
                </div>
                <div style={{marginBottom:9}}><div style={{fontSize:10,color:"#475569",marginBottom:3}}>Route Notes</div><textarea value={editingDelivery.route_notes||""} onChange={e=>setEditingDelivery(p=>({...p,route_notes:e.target.value}))} placeholder="Directions, gate codes..." rows={2} style={{...C.inp,resize:"vertical"}}/></div>
                <div style={{marginBottom:10}}><div style={{fontSize:10,color:"#475569",marginBottom:3}}>Delivery Notes</div><input value={editingDelivery.notes||""} onChange={e=>setEditingDelivery(p=>({...p,notes:e.target.value}))} placeholder="e.g. 3rd floor no elevator" style={C.inp}/></div>
                <div style={{display:"flex",gap:14,marginBottom:12,flexWrap:"wrap"}}>
                  {[{l:"Elevator",f:"elevator"},{l:"Old Mattress Removal",f:"removal_requested"},{l:"Transfer",f:"transfer_scheduled"}].map(x=>(
                    <label key={x.f} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,color:"#94a3b8"}}>
                      <input type="checkbox" checked={!!editingDelivery[x.f]} onChange={e=>setEditingDelivery(p=>({...p,[x.f]:e.target.checked}))} style={{width:14,height:14}}/>{x.l}
                    </label>
                  ))}
                </div>
                <div style={{display:"flex",gap:7}}>
                  <button className="btn" onClick={()=>saveDelivery(editingDelivery)} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"8px 17px",fontSize:13}}>💾 Save</button>
                  <button className="btn" onClick={()=>setEditingDelivery(null)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"8px 13px",fontSize:13}}>Cancel</button>
                </div>
              </div>
            )}
            {filteredDeliveries.length===0?(
              <div style={{...C.card,padding:40,textAlign:"center",color:"#475569"}}><div style={{fontSize:32,marginBottom:8}}>🚛</div><div>{dateFilter==="today"?"No deliveries today.":"No deliveries for this period."}</div></div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[...filteredDeliveries].sort((a,b)=>(a.stop_order||0)-(b.stop_order||0)).map(d=>{
                  const emp=employees.find(e=>e.id===d.assigned_to);
                  const sc=STATUS_COLORS[d.status]||STATUS_COLORS["Scheduled"];
                  const dMsgs=messages.filter(m=>m.delivery_id===d.id);
                  return(
                    <div key={d.id} style={{...C.card,padding:"15px 16px"}}>
                      <div className="del-card-inner" style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                        <div style={{flex:1,minWidth:140}}>
                          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                            <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#64748b"}}>#{d.stop_order}</span>
                            <span className="badge" style={{background:sc.bg,color:sc.text}}>
                              <span style={{width:5,height:5,borderRadius:"50%",background:sc.dot,...(d.status==="In Transit"?{animation:"pulse 2s infinite"}:{})}}/>
                              {d.status}
                            </span>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>{d.customer}</div>
                            {d.ticket_number&&<span style={{fontSize:11,background:"#1e3a5f",color:"#60a5fa",borderRadius:5,padding:"2px 7px",fontWeight:700}}>#{d.ticket_number}</span>}
                          </div>
                          <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{d.address} · {d.phone}</div>
                          <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
                            {d.removal_requested&&<span style={{fontSize:10,background:"#1c1500",color:"#f59e0b",borderRadius:4,padding:"2px 5px"}}>♻️ Removal</span>}
                            {d.transfer_scheduled&&<span style={{fontSize:10,background:"#1a0a2e",color:"#c084fc",borderRadius:4,padding:"2px 5px"}}>🔄 Transfer</span>}
                            {d.floor&&d.floor!=="1"&&<span style={{fontSize:10,background:"#0a1628",color:"#60a5fa",borderRadius:4,padding:"2px 5px"}}>{d.elevator?"🛗":"🪜"} Fl {d.floor}</span>}
                          </div>
                        </div>
                        <div style={{minWidth:120}}>
                          <div style={{fontSize:10,color:"#475569",marginBottom:4,textTransform:"uppercase",letterSpacing:".05em"}}>Items</div>
                          {(d.items||[]).map((item,i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                              <span style={{background:"#1e2d3d",color:"#60a5fa",borderRadius:4,padding:"1px 6px",fontSize:11,fontWeight:700}}>{item.qty}x</span>
                              <span style={{fontSize:12,color:"#e2e8f0"}}>{item.name}</span>
                            </div>
                          ))}
                          <div style={{fontSize:10,color:"#475569",marginTop:6,marginBottom:2,textTransform:"uppercase",letterSpacing:".05em"}}>Window · Driver</div>
                          <div style={{fontSize:11,color:"#60a5fa",fontWeight:500}}>{d.delivery_window}</div>
                          <div style={{fontSize:11,color:"#e2e8f0",fontWeight:600}}>{emp?.name}{(()=>{const h=employees.find(e=>e.id===d.helper_id);return h?<span style={{color:"#94a3b8"}}> + {h.name}</span>:null;})()}</div>
                          {d.notes&&<div style={{fontSize:10,color:"#f59e0b",marginTop:5,background:"#1c1500",borderRadius:4,padding:"2px 6px"}}>⚠️ {d.notes}</div>}
                        </div>
                        {d.route_notes&&(
                          <div style={{minWidth:150,flex:1}}>
                            <div style={{fontSize:10,color:"#475569",marginBottom:4,textTransform:"uppercase",letterSpacing:".05em"}}>🗺 Route</div>
                            <div style={{fontSize:11,color:"#94a3b8",lineHeight:1.5,background:"#0a1628",borderRadius:7,padding:"7px 10px"}}>{d.route_notes}</div>
                          </div>
                        )}
                        <div className="del-status-btns" style={{display:"flex",flexDirection:"column",gap:4,minWidth:100}}>
                          {Object.keys(STATUS_COLORS).map(s=>(
                            <button key={s} className="btn" onClick={()=>updStatus(d.id,s)}
                              style={{background:d.status===s?STATUS_COLORS[s].bg:"#0a1628",color:d.status===s?STATUS_COLORS[s].text:"#475569",border:`1px solid ${d.status===s?STATUS_COLORS[s].dot:"#1e2d3d"}`,padding:"3px 6px",fontSize:10,textAlign:"left"}}>
                              {s}
                            </button>
                          ))}
                          <div style={{display:"flex",gap:4,marginTop:2}}>
                            <button className="btn" onClick={()=>setEditingDelivery({...d,items:d.items||[{qty:1,name:""}]})} style={{background:"#1e2d3d",color:"#60a5fa",padding:"3px 7px",fontSize:10,flex:1}}>✏️</button>
                            <button className="btn" onClick={()=>delDelivery(d.id)} style={{background:"#2d0a0a",color:"#f87171",padding:"3px 7px",fontSize:10}}>✕</button>
                          </div>
                        </div>
                      </div>
                      {d.address&&<div style={{marginTop:10,borderRadius:8,overflow:"hidden",border:"1px solid #1e2d3d"}}><iframe title={`m-${d.id}`} width="100%" height="170" style={{border:0,display:"block"}} loading="lazy" src={`https://maps.google.com/maps?q=${encodeURIComponent(d.address)}&output=embed&z=15`}/></div>}
                      {/* Manager Approval */}
                      <div style={{marginTop:9,borderTop:"1px solid #131f2e",paddingTop:9,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                        {!d.manager_approved?(
                          <button className="btn" onClick={async()=>{
                            await sb.from("deliveries").update({manager_approved:true,manager_approved_by:currentUser.name}).eq("id",d.id);
                            setDeliveries(prev=>prev.map(x=>x.id===d.id?{...x,manager_approved:true,manager_approved_by:currentUser.name}:x));
                          }} style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",padding:"6px 13px",fontSize:12,fontWeight:600}}>
                            👑 Approve for Delivery
                          </button>
                        ):(
                          <span style={{fontSize:11,background:"#1e1038",color:"#a78bfa",borderRadius:6,padding:"4px 9px",fontWeight:600}}>✅ Approved by {d.manager_approved_by}</span>
                        )}
                        {/* SMS Buttons */}
                        <button className="btn" onClick={async()=>{
                          const r=await sendCustomerSMS(d,"confirmed");
                          if(r?.ok) alert("✅ Confirmation SMS sent to "+d.phone);
                          else alert("❌ SMS failed: "+(r?.error||"unknown error"));
                        }} style={{background:"#0c2340",color:"#60a5fa",padding:"6px 11px",fontSize:11}}>📱 Confirm SMS</button>
                        <button className="btn" onClick={async()=>{
                          const r=await sendCustomerSMS(d,"delivered");
                          if(r?.ok) alert("✅ Delivered SMS sent to "+d.phone);
                          else alert("❌ SMS failed: "+(r?.error||"unknown error"));
                        }} style={{background:"#052e16",color:"#4ade80",padding:"6px 11px",fontSize:11}}>📱 Delivered SMS</button>
                        {d.signature_url&&<span style={{fontSize:11,background:"#052e16",color:"#4ade80",borderRadius:5,padding:"3px 8px"}}>✅ Signed</span>}
                      </div>
                      {dMsgs.length>0&&(
                        <div style={{marginTop:9,borderTop:"1px solid #131f2e",paddingTop:9}}>
                          <div style={{fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:".06em",marginBottom:5}}>Driver Updates</div>
                          {dMsgs.map(m=>(
                            <div key={m.id} style={{background:"#0a1628",borderRadius:6,padding:"6px 9px",marginBottom:5}}>
                              <div style={{fontSize:10,color:"#475569",marginBottom:2}}>{m.sender_name} · {new Date(m.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                              {m.photo_url&&<img src={m.photo_url} alt="" style={{width:"100%",borderRadius:5,marginBottom:4,maxHeight:140,objectFit:"cover"}}/>}
                              {m.text!=="📷 Photo"&&<div style={{fontSize:12,color:"#e2e8f0"}}>{m.text}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MESSAGES */}
        {tab==="messages"&&(
          <div className="fade">
            <div style={{...C.card,padding:16}}>
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:14}}>💬 Team Channel</div>
              <div style={{maxHeight:520,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                {messages.filter(m=>!m.delivery_id).length===0&&<div style={{color:"#475569",fontSize:13,textAlign:"center",padding:28}}>No messages yet.</div>}
                {messages.filter(m=>!m.delivery_id).map(m=>(
                  <div key={m.id} style={{background:m.sender_id===0?"#0c1f38":"#0a1628",borderRadius:8,padding:"10px 13px",maxWidth:"75%",alignSelf:m.sender_id===0?"flex-end":"flex-start"}}>
                    <div style={{fontSize:10,color:"#475569",marginBottom:3}}>{m.sender_name} · {new Date(m.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                    {m.photo_url&&<img src={m.photo_url} alt="" style={{width:"100%",borderRadius:6,marginBottom:4,maxHeight:200,objectFit:"cover"}}/>}
                    <div style={{fontSize:13,color:"#e2e8f0"}}>{m.text}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <input value={teamMsg} onChange={e=>setTeamMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendTeamMsg()} placeholder="Message the team..." style={{flex:1,...C.inp}}/>
                <button className="btn" onClick={sendTeamMsg} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"9px 15px",fontSize:13,fontWeight:600,flexShrink:0}}>Send</button>
              </div>
            </div>
          </div>
        )}

        {/* PROBLEMS & CHALLENGE LOG */}
        {tab==="problems"&&(
          <div className="fade">{(()=>{
          const filteredProbs = problems.filter(p=>{
            if(probFilter==="open") return !p.resolved;
            if(probFilter==="done") return p.resolved;
            return true;
          });

          const saveNewProblem = async () => {
            if(!newProb.description.trim()) return;
            const p = {
              id:Date.now(), emp_name:currentUser.name, emp_id:currentUser.id,
              customer:newProb.customer, ticket_number:newProb.ticket_number,
              eta:newProb.eta, description:newProb.description,
              what_to_do:newProb.what_to_do, type:newProb.type,
              escalation_step:0, time:new Date().toLocaleDateString("en-US"),
              resolved:false, status:newProb.status||"Open",
            };
            await sb.from("problems").insert(p);
            setProblems(prev=>[p,...prev]);
            setNewProb({customer:"",ticket_number:"",eta:"",description:"",what_to_do:"",type:"customer",status:"Open"});
          };

          const updateProblem = async (id, updates) => {
            await sb.from("problems").update(updates).eq("id",id);
            setProblems(prev=>prev.map(p=>p.id===id?{...p,...updates}:p));
            setEditingProb(null);
          };

          const exportCSV = () => {
            const rows = [["CUSTOMER","TICKET #","ETA","PROBLEM","WHAT NEEDS TO BE DONE?","STATUS","DATE","REPORTED BY","TYPE"]];
            problems.forEach(p=>{
              rows.push([p.customer||"",p.ticket_number||"",p.eta||"",p.description||"",p.what_to_do||"",p.resolved?"done":(p.status||"Open"),p.time||"",p.emp_name||"",p.type||""]);
            });
            const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
            const blob=new Blob([csv],{type:"text/csv"});
            const url=URL.createObjectURL(blob);
            const a=document.createElement("a");
            a.href=url;a.download="challenge_log_"+new Date().toISOString().split("T")[0]+".csv";a.click();
          };

          return(
          <div>
            {/* Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>⚠️ Challenge Log</div>
                <div style={{fontSize:12,color:"#475569",marginTop:2}}>Matches your Google Sheet format. Manager access only.</div>
              </div>
              <button className="btn" onClick={exportCSV} style={{background:"#1e2d3d",color:"#22c55e",padding:"6px 12px",fontSize:11,fontWeight:600}}>📥 Export CSV → Google Sheets</button>
            </div>

            {/* Add new problem */}
            <div style={{...C.card,padding:"14px 16px",marginBottom:14,borderColor:"#3d1515"}}>
              <div style={{fontWeight:600,fontSize:13,color:"#f87171",marginBottom:10}}>➕ Log New Problem</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Customer Name</div>
                  <input value={newProb.customer} onChange={e=>setNewProb(p=>({...p,customer:e.target.value}))} placeholder="Customer name" style={C.inp}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Ticket #</div>
                  <input value={newProb.ticket_number} onChange={e=>setNewProb(p=>({...p,ticket_number:e.target.value}))} placeholder="e.g. 30503" style={C.inp}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>ETA / Expected Date</div>
                  <input value={newProb.eta} onChange={e=>setNewProb(p=>({...p,eta:e.target.value}))} placeholder="e.g. Next week / 5/20" style={C.inp}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Type</div>
                  <select value={newProb.type} onChange={e=>setNewProb(p=>({...p,type:e.target.value}))} style={C.sel}>
                    <option value="customer">👤 Customer Issue</option>
                    <option value="product">📦 Product / Vendor</option>
                    <option value="delivery">🚛 Delivery Issue</option>
                    <option value="internal">🏢 Internal</option>
                    <option value="warranty">🔍 Warranty</option>
                    <option value="layaway">💰 Layaway</option>
                  </select>
                </div>
              </div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Problem Description</div>
                <textarea value={newProb.description} onChange={e=>setNewProb(p=>({...p,description:e.target.value}))}
                  placeholder="Describe the problem..." rows={2} style={{...C.inp,resize:"vertical"}}/>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:3}}>What Needs To Be Done?</div>
                <textarea value={newProb.what_to_do} onChange={e=>setNewProb(p=>({...p,what_to_do:e.target.value}))}
                  placeholder="Next steps, action required..." rows={2} style={{...C.inp,resize:"vertical"}}/>
              </div>
              <button className="btn" onClick={saveNewProblem}
                style={{width:"100%",background:"linear-gradient(135deg,#dc2626,#b91c1c)",color:"#fff",padding:"11px",fontSize:13,fontWeight:700}}>
                ⚠️ Log Problem
              </button>
            </div>

            {/* Filter tabs */}
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              {[{v:"open",l:"Open",c:"#f87171"},{v:"done",l:"Resolved",c:"#4ade80"},{v:"all",l:"All",c:"#94a3b8"}].map(f=>(
                <button key={f.v} className="btn" onClick={()=>setProbFilter(f.v)}
                  style={{padding:"5px 14px",fontSize:12,background:probFilter===f.v?"#1e2d3d":"transparent",color:probFilter===f.v?f.c:"#475569",border:`1px solid ${probFilter===f.v?f.c:"#1e2d3d"}`}}>
                  {f.l} {probFilter===f.v?`(${filteredProbs.length})`:""}
                </button>
              ))}
            </div>

            {/* Problems list */}
            {filteredProbs.length===0?(
              <div style={{...C.card,padding:36,textAlign:"center",color:"#475569"}}>
                <div style={{fontSize:28,marginBottom:7}}>{probFilter==="open"?"✅":"📋"}</div>
                <div>{probFilter==="open"?"No open problems!":"No problems found."}</div>
              </div>
            ):(
              filteredProbs.map(p=>(
                <div key={p.id} style={{...C.card,marginBottom:10,padding:"14px 16px",borderLeft:`3px solid ${p.resolved?"#22c55e":p.type==="warranty"?"#f59e0b":p.type==="delivery"?"#60a5fa":"#f87171"}`}}>
                  {editingProb===p.id?(
                    <div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:8}}>
                        <div>
                          <div style={{fontSize:10,color:"#475569",marginBottom:2}}>Status</div>
                          <select defaultValue={p.status||"Open"} id={`status-${p.id}`} style={C.sel}>
                            <option>Open</option>
                            <option>In Progress</option>
                            <option>Waiting on Vendor</option>
                            <option>Waiting on Customer</option>
                            <option>Waiting on Brian/Scott</option>
                            <option>Done</option>
                          </select>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:"#475569",marginBottom:2}}>ETA</div>
                          <input defaultValue={p.eta||""} id={`eta-${p.id}`} style={C.inp}/>
                        </div>
                      </div>
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:10,color:"#475569",marginBottom:2}}>What Needs To Be Done / Update</div>
                        <textarea defaultValue={p.what_to_do||""} id={`wtd-${p.id}`} rows={3} style={{...C.inp,resize:"vertical"}}/>
                      </div>
                      <div style={{display:"flex",gap:7}}>
                        <button className="btn" onClick={()=>{
                          const status=document.getElementById(`status-${p.id}`).value;
                          const eta=document.getElementById(`eta-${p.id}`).value;
                          const what_to_do=document.getElementById(`wtd-${p.id}`).value;
                          updateProblem(p.id,{status,eta,what_to_do,resolved:status==="Done"});
                        }} style={{flex:1,background:"linear-gradient(135deg,#059669,#047857)",color:"#fff",padding:"8px",fontSize:12,fontWeight:600}}>💾 Save Update</button>
                        <button className="btn" onClick={()=>setEditingProb(null)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"8px 12px",fontSize:12}}>Cancel</button>
                      </div>
                    </div>
                  ):(
                    <div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6,flexWrap:"wrap",gap:6}}>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4,flexWrap:"wrap"}}>
                            {p.customer&&<span style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>{p.customer}</span>}
                            {p.ticket_number&&<span style={{fontSize:11,background:"#1e3a5f",color:"#60a5fa",borderRadius:4,padding:"2px 7px"}}>#{p.ticket_number}</span>}
                            <span style={{fontSize:11,background:"#1e2d3d",color:"#94a3b8",borderRadius:4,padding:"2px 6px"}}>{p.type}</span>
                            <span style={{fontSize:11,background:p.resolved?"#052e16":p.status==="In Progress"?"#0c2340":p.status==="Waiting on Vendor"?"#1c1500":"#2d0a0a",color:p.resolved?"#4ade80":p.status==="In Progress"?"#60a5fa":p.status==="Waiting on Vendor"?"#f59e0b":"#f87171",borderRadius:4,padding:"2px 7px",fontWeight:600}}>
                              {p.resolved?"✅ Done":(p.status||"Open")}
                            </span>
                          </div>
                          <div style={{fontSize:13,color:"#e2e8f0",marginBottom:p.what_to_do?6:0,lineHeight:1.5}}>{p.description}</div>
                          {p.what_to_do&&<div style={{fontSize:12,color:"#60a5fa",background:"#0c1f38",borderRadius:6,padding:"5px 9px",marginBottom:4}}>→ {p.what_to_do}</div>}
                          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:4}}>
                            {p.eta&&<span style={{fontSize:11,color:"#a78bfa"}}>📅 {p.eta}</span>}
                            <span style={{fontSize:11,color:"#475569"}}>{p.time} · {p.emp_name}</span>
                          </div>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
                          <button className="btn" onClick={()=>setEditingProb(p.id)} style={{background:"#1e2d3d",color:"#60a5fa",padding:"5px 10px",fontSize:11}}>✏️ Update</button>
                          {!p.resolved&&<button className="btn" onClick={()=>updateProblem(p.id,{resolved:true,status:"Done"})} style={{background:"#052e16",color:"#4ade80",padding:"5px 10px",fontSize:11}}>✅ Done</button>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          );
          })()}</div>
        )}


        {/* SMS */}
        {tab==="comms"&&(
          <div className="fade">
            {deliveries.length===0?(
              <div style={{...C.card,padding:40,textAlign:"center",color:"#475569"}}><div style={{fontSize:28,marginBottom:8}}>📱</div><div>Add deliveries first.</div></div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {deliveries.map(d=>{
                  const sc=STATUS_COLORS[d.status]||STATUS_COLORS["Scheduled"];
                  const msg=customerMsg[d.id];
                  const sent=msgSent[d.id];
                  return(
                    <div key={d.id} style={{...C.card,padding:"13px 15px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9,flexWrap:"wrap",gap:7}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:13,color:"#f1f5f9"}}>{d.customer}</div>
                          <div style={{fontSize:11,color:"#64748b"}}>{d.phone} · {(d.items||[]).map(i=>`${i.qty}x ${i.name}`).join(", ")} · {d.delivery_window}</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span className="badge" style={{background:sc.bg,color:sc.text}}><span style={{width:5,height:5,borderRadius:"50%",background:sc.dot}}/>{d.status}</span>
                          <button className="btn" onClick={()=>genSMS(d)} disabled={sendingMsg===d.id} style={{background:sendingMsg===d.id?"#1e2d3d":"linear-gradient(135deg,#2563eb,#1d4ed8)",color:sendingMsg===d.id?"#475569":"#fff",padding:"5px 11px",fontSize:11}}>
                            {sendingMsg===d.id?"⏳":"✨ Generate"}
                          </button>
                        </div>
                      </div>
                      {msg?(
                        <div style={{background:"#0a1628",borderRadius:8,padding:"9px 11px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:9}}>
                          <div>
                            <div style={{fontSize:12,color:"#e2e8f0",lineHeight:1.5}}>{msg}</div>
                            <div style={{fontSize:10,color:msg.length>150?"#f59e0b":"#475569",marginTop:3}}>{msg.length}/160</div>
                          </div>
                          <button className="btn" style={{background:sent?"#052e16":"#1e2d3d",color:sent?"#4ade80":"#94a3b8",padding:"5px 11px",fontSize:11,flexShrink:0}}>{sent?"✓ Sent":"📤 Send"}</button>
                        </div>
                      ):(
                        <div style={{background:"#0a1628",borderRadius:8,padding:"9px 11px",fontSize:11,color:"#334155",fontStyle:"italic"}}>Click Generate to write a message.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* INVENTORY */}
        {tab==="inventory"&&(
          <div className="fade">
            <div style={{marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:7}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>📦 Inventory Master List</div>
                <div style={{fontSize:12,color:"#475569",marginTop:2}}>Your Google Sheet — changes save automatically.</div>
              </div>
              <a href={GOOGLE_SHEET_URL} target="_blank" rel="noreferrer" style={{background:"#1e2d3d",color:"#60a5fa",borderRadius:8,padding:"6px 13px",fontSize:12,fontWeight:600,textDecoration:"none"}}>🔗 Open in Sheets</a>
            </div>
            <div style={{...C.card,overflow:"hidden"}}>
              {GOOGLE_SHEET_URL==="YOUR_SHEET_URL_HERE"?(
                <div style={{padding:48,textAlign:"center",color:"#475569"}}>
                  <div style={{fontSize:36,marginBottom:12}}>📊</div>
                  <div style={{fontSize:15,color:"#f1f5f9",marginBottom:8}}>Connect your Google Sheet</div>
                  <div style={{background:"#0a1628",borderRadius:8,padding:"12px 16px",textAlign:"left",fontSize:12,color:"#94a3b8",lineHeight:1.9,maxWidth:400,margin:"0 auto"}}>
                    <div>1. Open your Master List Google Sheet</div>
                    <div>2. Click <strong style={{color:"#60a5fa"}}>File → Share → Publish to web</strong></div>
                    <div>3. Choose <strong style={{color:"#60a5fa"}}>Entire Document → Web page</strong> → Publish</div>
                    <div>4. Copy the URL it gives you</div>
                    <div>5. In App.jsx, replace <strong style={{color:"#f59e0b"}}>YOUR_SHEET_URL_HERE</strong> with that URL</div>
                    <div>6. Save, push to GitHub — done!</div>
                  </div>
                </div>
              ):(
                <iframe src={GOOGLE_SHEET_EMBED} width="100%" height="620" style={{border:0,display:"block"}} title="Inventory"/>
              )}
            </div>
          </div>
        )}

        {/* TEAM */}
        {tab==="team"&&(
          <div className="fade">
            <div style={{...C.card,padding:"16px 18px",marginBottom:18,borderColor:"#1e3a5f"}}>
              <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9",marginBottom:12}}>➕ Add New Employee</div>
              <div className="new-emp-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:9,marginBottom:10}}>
                <div><div style={{fontSize:10,color:"#475569",marginBottom:3}}>Full Name</div><input value={newEmp.name} onChange={e=>setNewEmp(p=>({...p,name:e.target.value}))} placeholder="Maria Lopez" style={C.inp}/></div>
                <div><div style={{fontSize:10,color:"#475569",marginBottom:3}}>Role</div><select value={newEmp.role} onChange={e=>setNewEmp(p=>({...p,role:e.target.value}))} style={C.sel}>{ROLES.map(r=><option key={r}>{r}</option>)}</select></div>
                <div><div style={{fontSize:10,color:"#475569",marginBottom:3}}>Language</div><select value={newEmp.lang} onChange={e=>setNewEmp(p=>({...p,lang:e.target.value}))} style={C.sel}><option value="en">English 🇺🇸</option><option value="es">Spanish 🇲🇽</option></select></div>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:5}}>Work Days</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {ALL_DAYS.map(d=>(
                    <label key={d} style={{fontSize:11,cursor:"pointer",padding:"4px 10px",borderRadius:6,background:newEmp.workdays.includes(d)?"#0c2340":"#1e2d3d",color:newEmp.workdays.includes(d)?"#60a5fa":"#64748b",border:`1px solid ${newEmp.workdays.includes(d)?"#3b82f6":"#1e2d3d"}`}}>
                      <input type="checkbox" checked={newEmp.workdays.includes(d)} onChange={e=>setNewEmp(p=>({...p,workdays:e.target.checked?[...p.workdays,d]:p.workdays.filter(x=>x!==d)}))} style={{display:"none"}}/>{d}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:3}}>PIN (4 digits)</div>
                <input value={newEmp.pin} onChange={e=>setNewEmp(p=>({...p,pin:e.target.value}))} placeholder="e.g. 8888" maxLength={6} style={{...C.inp,width:110}}/>
              </div>
              <button className="btn" onClick={addEmp} style={{background:"linear-gradient(135deg,#059669,#047857)",color:"#fff",padding:"9px 18px",fontSize:13}}>➕ Add to Team</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:9}} /* responsive */>
              {employees.map(emp=>(
                <div key={emp.id} style={{...C.card,padding:"14px 16px"}}>
                  {editingEmp===emp.id?(
                    <div>
                      <div style={{fontWeight:600,fontSize:13,color:"#60a5fa",marginBottom:12}}>✏️ Edit {emp.name}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                        <div>
                          <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Role</div>
                          <select value={editEmpVals.role||emp.role} onChange={e=>setEditEmpVals(p=>({...p,role:e.target.value}))} style={C.sel}>
                            {ROLES.map(r=><option key={r}>{r}</option>)}
                          </select>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Language</div>
                          <select value={editEmpVals.lang||emp.lang} onChange={e=>setEditEmpVals(p=>({...p,lang:e.target.value}))} style={C.sel}>
                            <option value="en">English 🇺🇸</option>
                            <option value="es">Spanish 🇲🇽</option>
                          </select>
                        </div>
                      </div>
                      <div style={{marginBottom:10}}>
                        <div style={{fontSize:10,color:"#475569",marginBottom:5}}>Set New PIN <span style={{color:"#475569"}}>(leave blank to keep current)</span></div>
                        <input value={editEmpVals.pin!==undefined?editEmpVals.pin:""} onChange={e=>setEditEmpVals(p=>({...p,pin:e.target.value}))} maxLength={6} placeholder="••••" style={{...C.inp,width:100}}/>
                      </div>
                      <div style={{marginBottom:12}}>
                        <div style={{fontSize:10,color:"#475569",marginBottom:5}}>Work Days</div>
                        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                          {ALL_DAYS.map(d=>{
                            const days=editEmpVals.workdays||emp.workdays||[];
                            const active=days.includes(d);
                            return(
                              <label key={d} style={{fontSize:11,cursor:"pointer",padding:"4px 9px",borderRadius:5,background:active?"#0c2340":"#1e2d3d",color:active?"#60a5fa":"#64748b",border:`1px solid ${active?"#3b82f6":"#1e2d3d"}`}}>
                                <input type="checkbox" checked={active} onChange={e=>setEditEmpVals(p=>({...p,workdays:e.target.checked?[...(p.workdays||emp.workdays||[]),d]:(p.workdays||emp.workdays||[]).filter(x=>x!==d)}))} style={{display:"none"}}/>{d}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:7}}>
                        <button className="btn" onClick={async()=>{
                          const updates={role:editEmpVals.role||emp.role,lang:editEmpVals.lang||emp.lang,workdays:editEmpVals.workdays||emp.workdays};
                          // Only change the PIN if the manager actually typed a new one.
                          if (editEmpVals.pin) updates.pin=editEmpVals.pin;
                          await sb.from("employees").update(updates).eq("id",emp.id);
                          setEmployees(prev=>prev.map(e=>e.id===emp.id?{...e,...updates}:e));
                          setEditingEmp(null);setEditEmpVals({});
                        }} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"7px 14px",fontSize:12}}>💾 Save</button>
                        <button className="btn" onClick={()=>{setEditingEmp(null);setEditEmpVals({});}} style={{background:"#1e2d3d",color:"#94a3b8",padding:"7px 12px",fontSize:12}}>Cancel</button>
                      </div>
                    </div>
                  ):(
                    <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                      <div style={{width:38,height:38,borderRadius:"50%",background:avatarBg(emp),display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#fff",flexShrink:0}}>{emp.avatar}</div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:13,color:"#f1f5f9"}}>{emp.name}{emp.is_manager?" 👑":""}{emp.lang==="es"?" 🇲🇽":""}</div>
                        <div style={{fontSize:11,color:"#64748b",marginTop:1}}>{emp.role} · PIN ••••</div>
                        <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
                          {(emp.workdays||[]).map(d=><span key={d} style={{fontSize:9,background:"#0c2340",color:"#60a5fa",borderRadius:4,padding:"1px 5px",fontWeight:600}}>{d}</span>)}
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
                        {!emp.is_manager&&(
                          <button className="btn" onClick={()=>{setEditingEmp(emp.id);setEditEmpVals({});}} style={{background:"#1e2d3d",color:"#60a5fa",padding:"4px 9px",fontSize:11}}>✏️ Edit</button>
                        )}
                        {(!emp.is_manager||emp.id!==0)&&emp.id!==0?(
                          confirmDelete===emp.id?(
                            <div style={{display:"flex",flexDirection:"column",gap:4}}>
                              <div style={{fontSize:10,color:"#f87171"}}>Remove?</div>
                              <div style={{display:"flex",gap:4}}>
                                <button className="btn" onClick={async()=>{await sb.from("employees").delete().eq("id",emp.id);setEmployees(p=>p.filter(e=>e.id!==emp.id));setConfirmDelete(null);}} style={{background:"#dc2626",color:"#fff",padding:"4px 9px",fontSize:10}}>Yes</button>
                                <button className="btn" onClick={()=>setConfirmDelete(null)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"4px 8px",fontSize:10}}>No</button>
                              </div>
                            </div>
                          ):(
                            <button className="btn" onClick={()=>setConfirmDelete(emp.id)} style={{background:"#1e2d3d",color:"#64748b",padding:"4px 9px",fontSize:11}}>✕ Remove</button>
                          )
                        ):(
                          <span style={{fontSize:10,color:"#7c3aed",background:"#1e1038",borderRadius:5,padding:"4px 7px",fontWeight:600}}>👑 Owner</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INSPECTIONS */}
        {tab==="inspections"&&(
          <div className="fade">
            <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:14}}>🔍 Truck Inspections</div>
            {inspections.length===0?(
              <div style={{...C.card,padding:40,textAlign:"center",color:"#475569"}}>
                <div style={{fontSize:32,marginBottom:8}}>🚛</div>
                <div>No inspections submitted yet.</div>
                <div style={{fontSize:12,marginTop:6}}>Drivers submit these from their Inspections tab.</div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {inspections.map(ins=>(
                  <div key={ins.id} style={{...C.card,padding:"14px 16px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:13,color:"#f1f5f9"}}>{ins.emp_name}</div>
                        <div style={{fontSize:11,color:"#475569"}}>{ins.inspection_date} · {new Date(ins.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                      </div>
                      {ins.notes&&<div style={{fontSize:12,color:"#f59e0b",background:"#1c1500",borderRadius:6,padding:"4px 9px"}}>⚠️ {ins.notes}</div>}
                    </div>
                    {ins.photo_url&&<img src={ins.photo_url} alt="inspection" style={{width:120,height:90,borderRadius:6,objectFit:"cover",cursor:"pointer"}} onClick={()=>window.open(ins.photo_url,"_blank")}/>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MANAGER SCHEDULE */}
        {tab==="mgr-schedule"&&(()=>{
          // Build this week's dates (Mon-Sun)
          const todayD = new Date();
          const dow = todayD.getDay(); // 0=Sun
          const mondayOffset = dow===0?-6:1-dow;
          const weekDates = Array.from({length:7},(_,i)=>{
            const d=new Date(todayD);
            d.setDate(d.getDate()+mondayOffset+i);
            return d.toISOString().split("T")[0];
          });
          const dayKeys=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
          const dayFull={Mon:"Monday",Tue:"Tuesday",Wed:"Wednesday",Thu:"Thursday",Fri:"Friday",Sat:"Saturday",Sun:"Sunday"};
          return(
          <div className="fade">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:6}}>
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>📅 This Week's Schedule</div>
              <div style={{fontSize:11,color:"#475569"}}>
                {new Date(weekDates[0]+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})} — {new Date(weekDates[6]+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
              {dayKeys.map((d,i)=>(
                <button key={d} className="btn" onClick={()=>setMgrSchedDay(mgrSchedDay===d?null:d)}
                  style={{padding:"7px 12px",fontSize:11,fontWeight:600,background:mgrSchedDay===d?"linear-gradient(135deg,#2563eb,#1d4ed8)":"#1e2d3d",color:mgrSchedDay===d?"#fff":"#94a3b8",position:"relative"}}>
                  {d}
                  {deliveries.filter(x=>x.delivery_date===weekDates[i]).length>0&&(
                    <span style={{position:"absolute",top:-4,right:-4,background:"#22c55e",color:"#fff",borderRadius:"50%",width:14,height:14,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>
                      {deliveries.filter(x=>x.delivery_date===weekDates[i]).length}
                    </span>
                  )}
                </button>
              ))}
              {mgrSchedDay&&<button className="btn" onClick={()=>setMgrSchedDay(null)} style={{padding:"7px 12px",fontSize:11,background:"#1e2d3d",color:"#64748b"}}>Show All</button>}
            </div>
            {dayKeys.filter(d=>!mgrSchedDay||d===mgrSchedDay).map((day,idx)=>{
              const dateIso = weekDates[idx];
              const working=employees.filter(e=>e.is_manager||(e.workdays||[]).includes(day));
              const off=employees.filter(e=>!e.is_manager&&!(e.workdays||[]).includes(day));
              const dayDels=deliveries.filter(d=>d.delivery_date===dateIso);
              const isToday=dateIso===new Date().toISOString().split("T")[0];
              return(
                <div key={day} style={{...C.card,marginBottom:10,overflow:"hidden",borderColor:isToday?"#3b82f6":"#1e2d3d"}}>
                  <div style={{padding:"10px 16px",background:isToday?"#0c1f38":"#0a1628",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontWeight:700,fontSize:14,color:isToday?"#60a5fa":"#f1f5f9"}}>{dayFull[day]} {isToday?"• Today":""} <span style={{fontSize:11,color:"#475569",fontWeight:400}}>{new Date(dateIso+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span></div>
                    <div style={{display:"flex",gap:10}}>
                      {dayDels.length>0&&<span style={{fontSize:11,color:"#60a5fa"}}>{dayDels.length} deliveries</span>}
                      <span style={{fontSize:11,color:"#22c55e"}}>{working.length} working</span>
                    </div>
                  </div>
                  <div style={{padding:"12px 16px"}}>
                    <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:off.length>0?10:0}}>
                      {working.map(emp=>(
                        <div key={emp.id} style={{display:"flex",alignItems:"center",gap:7,background:"#0c1f38",borderRadius:8,padding:"7px 11px",border:"1px solid #1e3a5f"}}>
                          <div style={{width:28,height:28,borderRadius:"50%",background:avatarBg(emp),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff"}}>{emp.avatar}</div>
                          <div>
                            <div style={{fontSize:12,fontWeight:600,color:"#f1f5f9"}}>{emp.name}{emp.is_manager?" 👑":""}</div>
                            <div style={{fontSize:10,color:"#475569"}}>{emp.role}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {off.length>0&&<div style={{fontSize:11,color:"#475569"}}>Off: {off.map(e=>e.name).join(", ")}</div>}
                    {dayDels.length>0&&(
                      <div style={{marginTop:10,borderTop:"1px solid #131f2e",paddingTop:10}}>
                        <div style={{fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:".07em",marginBottom:7}}>Deliveries</div>
                        {[...dayDels].sort((a,b)=>(a.stop_order||0)-(b.stop_order||0)).map(d=>{
                          const emp=employees.find(e=>e.id===d.assigned_to);
                          return(
                            <div key={d.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,flexWrap:"wrap"}}>
                              <span style={{fontSize:10,color:"#64748b",fontFamily:"monospace"}}>#{d.stop_order}</span>
                              <span style={{fontWeight:600,fontSize:12,color:"#e2e8f0"}}>{d.customer}</span>
                              {d.ticket_number&&<span style={{fontSize:10,background:"#1e3a5f",color:"#60a5fa",borderRadius:4,padding:"1px 6px"}}>#{d.ticket_number}</span>}
                              <span style={{fontSize:11,color:"#a78bfa"}}>{d.delivery_window}</span>
                              <span style={{fontSize:11,color:"#475569"}}>{emp?.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          );
        })()}

        {/* MANAGER PREP */}
        {tab==="mgr-prep"&&(()=>{
          const prepDateObj = new Date(mgrPrepDate + "T12:00:00");
          const prepDay = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][prepDateObj.getDay()];
          const prepDels = deliveries.filter(d=>d.delivery_date===mgrPrepDate);
          const allItems = {};
          prepDels.forEach(d=>{
            (d.items||[]).forEach(item=>{
              const key = item.name.trim();
              if(!allItems[key]) allItems[key]=0;
              allItems[key]+=item.qty;
            });
          });
          const removalDels = prepDels.filter(d=>d.removal_requested);
          const isToday = mgrPrepDate===new Date().toISOString().split("T")[0];
          const isTomorrow = mgrPrepDate===(()=>{ const t=new Date(); t.setDate(t.getDate()+1); return t.toISOString().split("T")[0]; })();
          return(
            <div className="fade">
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:8}}>📋 Prep — Select a Day</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {[0,1,2,3,4,5,6].map(offset=>{
                  const d=new Date(); d.setDate(d.getDate()+offset);
                  const iso=d.toISOString().split("T")[0];
                  const label=offset===0?"Today":offset===1?"Tomorrow":d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
                  const hasDels=deliveries.filter(x=>x.delivery_date===iso).length;
                  return(
                    <button key={iso} className="btn" onClick={()=>setMgrPrepDate(iso)}
                      style={{padding:"7px 12px",fontSize:11,fontWeight:600,background:mgrPrepDate===iso?"linear-gradient(135deg,#2563eb,#1d4ed8)":"#1e2d3d",color:mgrPrepDate===iso?"#fff":"#94a3b8",border:`1px solid ${mgrPrepDate===iso?"#3b82f6":"#1e2d3d"}`,position:"relative"}}>
                      {label}
                      {hasDels>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#22c55e",color:"#fff",borderRadius:"50%",width:14,height:14,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{hasDels}</span>}
                    </button>
                  );
                })}
              </div>
              <div style={{fontSize:12,color:"#475569",marginBottom:14}}>
                {prepDateObj.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
                {isToday&&<span style={{marginLeft:8,color:"#f59e0b",fontWeight:600}}>· Today</span>}
                {isTomorrow&&<span style={{marginLeft:8,color:"#22c55e",fontWeight:600}}>· Tomorrow</span>}
              </div>
              <div style={{...C.card,marginBottom:12,overflow:"hidden"}}>
                <div style={{padding:"10px 16px",background:"#0a1628",fontSize:11,fontWeight:700,letterSpacing:".08em",color:"#60a5fa",textTransform:"uppercase"}}>
                  📦 Product Pull List ({prepDels.length} deliveries)
                </div>
                {Object.keys(allItems).length===0?(
                  <div style={{padding:"20px 16px",color:"#475569",fontSize:13,textAlign:"center"}}>No deliveries scheduled for this day yet.</div>
                ):(
                  Object.entries(allItems).map(([name,qty],i)=>(
                    <div key={name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px",borderTop:i>0?"1px solid #131f2e":"none"}}>
                      <div style={{fontSize:13,color:"#e2e8f0",fontWeight:500}}>{name}</div>
                      <span style={{background:"#1e3a5f",color:"#60a5fa",borderRadius:8,padding:"4px 12px",fontSize:14,fontWeight:700}}>{qty}x</span>
                    </div>
                  ))
                )}
                {removalDels.length>0&&(
                  <div style={{padding:"10px 16px",borderTop:"1px solid #131f2e",background:"#1c1500"}}>
                    <div style={{fontSize:11,color:"#f59e0b",fontWeight:600}}>♻️ {removalDels.length} removal(s) scheduled — clear warehouse space</div>
                  </div>
                )}
              </div>
              <div style={{...C.card,overflow:"hidden"}}>
                <div style={{padding:"10px 16px",background:"#0a1628",fontSize:11,fontWeight:700,letterSpacing:".08em",color:"#475569",textTransform:"uppercase"}}>
                  🚛 Delivery Schedule
                </div>
                {prepDels.length===0?(
                  <div style={{padding:"20px 16px",color:"#475569",fontSize:13,textAlign:"center"}}>No deliveries scheduled for this day yet.</div>
                ):(
                  [...prepDels].sort((a,b)=>(a.stop_order||0)-(b.stop_order||0)).map((d,i)=>{
                    const emp=employees.find(e=>e.id===d.assigned_to);
                    return(
                      <div key={d.id} style={{padding:"11px 16px",borderTop:i>0?"1px solid #131f2e":"none"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                          <div style={{display:"flex",alignItems:"center",gap:7}}>
                            <span style={{fontSize:10,color:"#64748b",fontFamily:"monospace"}}>#{d.stop_order}</span>
                            <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9"}}>{d.customer}</div>
                            {d.ticket_number&&<span style={{fontSize:10,background:"#1e3a5f",color:"#60a5fa",borderRadius:4,padding:"1px 6px"}}>#{d.ticket_number}</span>}
                          </div>
                          <div style={{display:"flex",gap:7,alignItems:"center"}}>
                            <span style={{fontSize:11,color:"#a78bfa"}}>{d.delivery_window}</span>
                            <span style={{fontSize:11,color:"#475569"}}>{emp?.name}</span>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                          {(d.items||[]).map((item,ii)=>(
                            <span key={ii} style={{fontSize:11,background:"#1e2d3d",color:"#94a3b8",borderRadius:5,padding:"2px 7px"}}>{item.qty}x {item.name}</span>
                          ))}
                          {d.removal_requested&&<span style={{fontSize:11,background:"#1c1500",color:"#f59e0b",borderRadius:5,padding:"2px 7px"}}>♻️ Removal</span>}
                          {d.notes&&<span style={{fontSize:11,background:"#1c1500",color:"#f59e0b",borderRadius:5,padding:"2px 7px"}}>⚠️ {d.notes}</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })()}

        {/* IMPORT */}
        {tab==="import"&&(
          <div className="fade">
            <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:4}}>📥 Daily Route Import</div>
            <div style={{fontSize:12,color:"#475569",marginBottom:14}}>Upload your EZ Process Pro PDF to import all deliveries at once, or add manually below.</div>

            {/* PDF Upload - uses your Anthropic API key stored in Netlify */}
            <div style={{...C.card,padding:"16px 18px",marginBottom:14,borderColor:"#1e3a5f"}}>
              <div style={{fontWeight:700,fontSize:13,color:"#60a5fa",marginBottom:4}}>📄 Upload Route PDF — Import All At Once</div>
              <div style={{fontSize:12,color:"#475569",marginBottom:10}}>Upload your daily delivery receipt PDF. AI reads all deliveries including items, manufacturer, piece#, instructions, and flags pickups/transfers automatically.</div>
              
              {/* Route selector */}
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,color:"#475569",marginBottom:5}}>Assign to Route:</div>
                <div style={{display:"flex",gap:8}}>
                  {[1,2].map(r=>(
                    <button key={r} className="btn" onClick={()=>setPdfRoute(r)}
                      style={{flex:1,background:pdfRoute===r?"linear-gradient(135deg,#2563eb,#1d4ed8)":"#1e2d3d",color:pdfRoute===r?"#fff":"#94a3b8",padding:"8px",fontSize:13,fontWeight:600}}>
                      🚛 Route {r}
                    </button>
                  ))}
                </div>
              </div>

              <input type="file" accept=".pdf" onChange={async(e)=>{
                const file=e.target.files[0];
                if(!file) return;
                setPdfImporting(true);
                setPdfResult(null);
                try {
                  // Load PDF.js from CDN
                  if(!window.pdfjsLib) {
                    await new Promise((res,rej)=>{
                      const s=document.createElement("script");
                      s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
                      s.onload=res; s.onerror=rej;
                      document.head.appendChild(s);
                    });
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
                  }
                  const arrayBuf = await file.arrayBuffer();
                  const pdf = await window.pdfjsLib.getDocument({data:arrayBuf}).promise;
                  
                  // Extract text from all pages
                  const pages = [];
                  for(let i=1;i<=pdf.numPages;i++){
                    const page = await pdf.getPage(i);
                    const tc = await page.getTextContent();
                    const text = tc.items.map(x=>x.str).join(" ");
                    pages.push(text);
                  }
                  
                  // Parse each page as a delivery
                  const parseDelivery = (text) => {
                    const d = {};
                    if (!text.includes("Last Name:")) return null;

                    // Normalize: collapse multiple spaces to single, but keep newlines
                    const t = text.replace(/[ \t]+/g, " ");

                    // Customer name
                    let m = t.match(/Last Name:\s*(\S+)\s+First Name:\s*(\S+)/);
                    if (m) d.customer = m[2] + " " + m[1]; else return null;

                    // Address
                    m = t.match(/Address\(Street\):\s*(.+?)\s+City:\s*(.+?)\s+State:\s*(\w+)\s+Zip:\s*(\w+)/);
                    if (m) d.address = m[1].trim() + ", " + m[2].trim() + ", " + m[3] + " " + m[4];

                    // Apt number — only if it looks like a number or unit
                    m = t.match(/Apt\.:\s*([^\s][^\s]*)\s+Apt\. Complex/);
                    if (m && m[1] && m[1] !== "Apt." && /[\d#]/.test(m[1]) && m[1].length < 10) {
                      d.address = (d.address || "") + " Apt " + m[1];
                    }

                    // Phone
                    m = t.match(/Tel\.Home\s+([\(\d\)\-\.\s]{7,15})/);
                    if (m) d.phone = m[1].trim().replace(/\s/g, "");

                    // Date + window
                    m = t.match(/Estimated Date of Delivery:\s*(\d+)\/(\d+)\/(\d+)\s*(Morning|Afternoon|[\d:AaPpMm\s\-]+)/);
                    if (m) {
                      const yr = m[3].length === 2 ? "20" + m[3] : m[3];
                      d.delivery_date = yr + "-" + m[1].padStart(2,"0") + "-" + m[2].padStart(2,"0");
                      d.delivery_window = m[4].trim();
                    }

                    m = t.match(/Sale Number:\s*(\d+)/); if (m) d.sale_number = m[1];
                    m = t.match(/Memo #:\s*(\d+)/); if (m) d.memo_number = m[1];

                    // Instructions
                    m = t.match(/Instruction:\s*([\s\S]+?)(?:Client Comment|Copy to be signed)/);
                    if (m) d.notes = m[1].trim().replace(/\s+/g, " ").substring(0, 500);

                    const allTxt = ((d.notes || "") + " " + t).toLowerCase();
                    d.is_transfer = t.includes("PICK UP MEMO") ||
                      /(\bcpu\b|pick up|pickup|will pu|transfer to|pu on|customer will pu)/.test(allTxt);
                    d.is_haul_off = /disposalfee/i.test(t);

                    m = (d.notes || "").match(/(\d+)(st|nd|rd|th)\s*floor/i);
                    if (m) d.floor = m[1];

                    // ── ITEM EXTRACTION ──────────────────────────────────
                    const SKIP_LIST = ["DISPOSALFEE","ABQDELIVERY","RIORANCHODELIVERY",
                      "LOSLUNAS","BELENDELIVERY","SANTA_FE_LOCAL","COORSBDELIVERY",
                      "ABQDELIV","RIORANCHO","DELIVERY","LOCAL"];

                    const items = [];

                    const extractFromSection = (sec) => {
                      if (!sec || sec.length < 5) return;
                      // Fix split piece numbers: "500100092- 1050" or "BD500124399- 6050"
                      const s = sec
                        .replace(/([A-Z0-9]+)-\s+(\d{3,})/g, "$1-$2")
                        .replace(/([A-Z0-9]+)-\n\s*([A-Z0-9])/g, "$1-$2");

                      // Strategy: find each row by the pattern: NUMBER MANUFACTURER PIECE# QTY
                      // then grab everything after QTY until the next row number or end of section
                      // Row pattern: start of line or whitespace, 1-2 digit row#, CAPS manufacturer, piece#, 1-2 digit qty
                      const rowPattern = /(?:^|\n| )(\d{1,2}) ([A-Z][A-Z0-9]{1,12}) ([A-Z0-9][\w\-.]{2,25}) (\d{1,2}) /g;
                      let match;
                      const rows = [];
                      while ((match = rowPattern.exec(s)) !== null) {
                        rows.push({
                          idx: match.index,
                          man: match[2], piece: match[3], qty: parseInt(match[4]),
                          nameStart: match.index + match[0].length
                        });
                      }
                      rows.forEach((row, ri) => {
                        const nameEnd = ri < rows.length - 1 ? rows[ri+1].idx : s.length;
                        let name = s.substring(row.nameStart, nameEnd).trim().replace(/\s+/g, " ");
                        // Skip fee items
                        if (SKIP_LIST.some(x => row.man.toUpperCase().startsWith(x))) return;
                        if (SKIP_LIST.some(x => name.toUpperCase().startsWith(x))) return;
                        if (/^(Removal|Delivery in|Per Pc|Subject to)/i.test(name)) return;
                        // Clean trailing price/note info
                        name = name
                          .replace(/\s+[Rr]eg\.?\s+[\d,\.]+.*/g, "")
                          .replace(/\s+[Ss]ale\.?\s+[\d,\.]+.*/g, "")
                          .replace(/\s+\$[\d,\.]+.*/g, "")
                          .replace(/\s+(Reg|Sale|price match|appeasement|included with|king size set|bogo)[\s\S]*/gi, "")
                          .trim();
                        if (name.length < 3 || row.qty < 1 || row.qty > 20) return;
                        if (!items.some(x => x.piece_number === row.piece && row.piece.length > 3)) {
                          items.push({ qty: row.qty, name: name.substring(0, 150),
                            manufacturer: row.man, piece_number: row.piece });
                        }
                      });
                    };

                    // Split at ALL SALES text, then split main vs back order
                    const allSalesIdx = t.search(/ALL SALES ARE FINAL/i);
                    const tableText = allSalesIdx > -1 ? t.substring(0, allSalesIdx) : t;
                    const parts = tableText.split(/Back Order Information/i);
                    extractFromSection(parts[0] || "");
                    extractFromSection(parts[1] || "");

                    d.items = items.length > 0 ? items : [{ qty: 1, name: "See ticket — check PDF", manufacturer: "", piece_number: "" }];
                    return d;
                  };
                  const delivs = pages.map(parseDelivery).filter(Boolean);
                  if(delivs.length===0){
                    alert("Could not find deliveries in PDF. Make sure this is an EZ Process Pro delivery receipt.");
                  } else {
                    setPdfResult(delivs);
                  }
                } catch(err){
                  console.error(err);
                  alert("Error reading PDF: "+err.message);
                }
                setPdfImporting(false);
                e.target.value="";
              }} style={{...C.inp,padding:"8px",marginBottom:10}}/>

              {pdfImporting&&(
                <div style={{...C.card,padding:"14px",marginBottom:10,borderColor:"#1e3a5f",textAlign:"center"}}>
                  <div style={{fontSize:13,color:"#60a5fa",marginBottom:4}}>⏳ Reading PDF — extracting all deliveries...</div>
                  <div style={{fontSize:11,color:"#475569"}}>This takes 10-20 seconds for large route files</div>
                </div>
              )}

              {pdfResult&&Array.isArray(pdfResult)&&(
                <div>
                  <div style={{fontSize:13,color:"#22c55e",fontWeight:600,marginBottom:6}}>
                    ✅ Found {pdfResult.filter(d=>!d.is_transfer).length} deliveries + {pdfResult.filter(d=>d.is_transfer).length} pickups — assign route & driver, then import
                  </div>
                  {pdfResult.filter(d=>d.is_transfer).length>0&&(
                    <div style={{...C.card,padding:"8px 14px",marginBottom:8,borderColor:"#f59e0b",background:"#1c1500"}}>
                      <div style={{fontSize:12,color:"#f59e0b",fontWeight:600}}>⚠️ Pickups / Transfers detected — these will be marked as "Transfer" status and appear separately on driver view</div>
                    </div>
                  )}

                  {/* Quick assign bar */}
                  <div style={{...C.card,padding:"10px 14px",marginBottom:10,borderColor:"#1e2d3d"}}>
                    <div style={{fontSize:11,color:"#475569",marginBottom:6,fontWeight:600}}>Quick assign all unassigned:</div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {[1,2].map(r=>(
                        <div key={r} style={{display:"flex",gap:6,alignItems:"center",flex:1,minWidth:200}}>
                          <span style={{fontSize:11,color:r===1?"#60a5fa":"#a78bfa",fontWeight:700,flexShrink:0}}>R{r}:</span>
                          <select onChange={e=>{if(!e.target.value)return;const v=Number(e.target.value);setPdfResult(prev=>prev.map(x=>(x._route||pdfRoute)===r&&x._driver==null?{...x,_driver:v}:x));}} style={{...C.sel,flex:1,fontSize:11}}>
                            <option value="">Assign driver to Route {r}...</option>
                            {employees.map(e=><option key={e.id} value={e.id}>{e.name}{e.is_manager?" 👑":""}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{maxHeight:500,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,marginBottom:10}}>
                    {pdfResult.map((del,di)=>{
                      const route=del._route||pdfRoute;
                      const driverName=employees.find(e=>e.id===del._driver)?.name;
                      return(
                        <div key={di} style={{...C.card,padding:"12px 14px",borderColor:del.is_transfer?"#f59e0b":route===2?"#4f46e5":"#1e3a5f",borderWidth:2}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6,marginBottom:8}}>
                            <div style={{flex:1}}>
                              <div style={{fontWeight:700,fontSize:13,color:"#f1f5f9"}}>{del.customer}</div>
                              <div style={{fontSize:11,color:"#64748b"}}>{del.address}</div>
                              <div style={{fontSize:11,color:"#64748b"}}>{del.phone} · {del.delivery_window}</div>
                            </div>
                            <div style={{display:"flex",gap:4,flexWrap:"wrap",flexShrink:0}}>
                              {del.sale_number&&<span style={{fontSize:10,background:"#1e3a5f",color:"#60a5fa",borderRadius:4,padding:"2px 6px"}}>#{del.sale_number}</span>}
                              {del.is_transfer&&<span style={{fontSize:10,background:"#1c1500",color:"#f59e0b",borderRadius:4,padding:"2px 6px"}}>⚠️ Pickup</span>}
                              {del.is_haul_off&&<span style={{fontSize:10,background:"#1e1038",color:"#c084fc",borderRadius:4,padding:"2px 6px"}}>♻️ Haul Off</span>}
                            </div>
                          </div>

                          {del.notes&&<div style={{fontSize:11,color:"#f59e0b",background:"#1c1500",borderRadius:5,padding:"4px 8px",marginBottom:8}}>📋 {del.notes}</div>}

                          {/* Items */}
                          <div style={{marginBottom:8}}>
                            {(del.items||[]).map((item,ii)=>(
                              <div key={ii} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                                <span style={{fontSize:11,color:"#60a5fa",fontWeight:700,background:"#0c2340",borderRadius:4,padding:"1px 5px",flexShrink:0}}>{item.qty}x</span>
                                <span style={{fontSize:11,color:"#e2e8f0"}}>{item.name}</span>
                                {item.manufacturer&&<span style={{fontSize:10,color:"#475569",flexShrink:0}}>{item.manufacturer}</span>}
                                {item.piece_number&&<span style={{fontSize:10,color:"#334155",flexShrink:0}}>#{item.piece_number}</span>}
                              </div>
                            ))}
                          </div>

                          {/* Route + Driver per delivery */}
                          <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
                            <div style={{display:"flex",gap:4}}>
                              {[1,2].map(r=>(
                                <button key={r} className="btn" onClick={()=>setPdfResult(prev=>prev.map((x,i)=>i===di?{...x,_route:r}:x))}
                                  style={{padding:"5px 12px",fontSize:11,fontWeight:700,background:route===r?(r===1?"linear-gradient(135deg,#2563eb,#1d4ed8)":"linear-gradient(135deg,#7c3aed,#4f46e5)"):"#0a1628",color:route===r?"#fff":"#475569",border:`1px solid ${route===r?(r===1?"#3b82f6":"#7c3aed"):"#1e2d3d"}`}}>
                                  🚛 R{r}
                                </button>
                              ))}
                            </div>
                            <select value={del._driver ?? ""} onChange={e=>setPdfResult(prev=>prev.map((x,i)=>i===di?{...x,_driver:e.target.value===""?null:Number(e.target.value)}:x))}
                              style={{...C.sel,flex:1,fontSize:11}}>
                              <option value="">Assign driver...</option>
                              {employees.map(e=><option key={e.id} value={e.id}>{e.name}{e.is_manager?" 👑":""}</option>)}
                            </select>
                            {driverName&&<span style={{fontSize:10,color:"#22c55e",flexShrink:0}}>✓ {driverName}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary before import */}
                  <div style={{...C.card,padding:"10px 14px",marginBottom:10,background:"#0a1628"}}>
                    <div style={{fontSize:12,color:"#94a3b8"}}>
                      Route 1: <span style={{color:"#60a5fa",fontWeight:600}}>{pdfResult.filter(d=>(d._route||pdfRoute)===1).length} deliveries</span>
                      {" · "}
                      Route 2: <span style={{color:"#a78bfa",fontWeight:600}}>{pdfResult.filter(d=>d._route===2).length} deliveries</span>
                      {" · "}
                      Unassigned drivers: <span style={{color:pdfResult.filter(d=>d._driver==null).length>0?"#f87171":"#22c55e",fontWeight:600}}>{pdfResult.filter(d=>d._driver==null).length}</span>
                    </div>
                  </div>

                  <div style={{display:"flex",gap:8}}>
                    <button className="btn" onClick={async()=>{
                      const today=new Date().toISOString().split("T")[0];
                      const stopCounters={1:deliveries.filter(d=>d.delivery_date===today&&(d.route_number||1)===1).length+1, 2:deliveries.filter(d=>d.delivery_date===today&&d.route_number===2).length+1};
                      const added=[];
                      for(const del of pdfResult){
                        const route=del._route||pdfRoute;
                        const driverId=del._driver??0;
                        const stop=stopCounters[route]||1;
                        stopCounters[route]=(stopCounters[route]||1)+1;
                        const isTransfer=!!del.is_transfer;
                        const nid=`D-${Date.now().toString(36)}-${stop}`;
                        const newRow={
                          id:nid,customer:del.customer,address:del.address||"",phone:del.phone||"",
                          items:del.items&&del.items.length>0?del.items:[{qty:1,name:"See notes"}],
                          delivery_window:del.delivery_window||"Morning",
                          assigned_to:driverId,status:isTransfer?"Transfer":"Scheduled",
                          notes:del.notes||"",floor:del.floor||"1",elevator:false,
                          removal_requested:!!del.is_haul_off,transfer_scheduled:isTransfer,route_notes:"",
                          stop_order:stop,delivery_date:del.delivery_date||today,
                          ticket_number:String(del.sale_number||del.memo_number||""),
                          helper_id:0,
                          manufacturer:(del.items||[])[0]?.manufacturer||"",
                          piece_number:(del.items||[])[0]?.piece_number||"",
                          route_number:route,
                        };
                        await sb.from("deliveries").insert(newRow);
                        added.push(newRow);
                      }
                      setDeliveries(prev=>[...prev,...added]);
                      setPdfResult(null);
                      const r1=added.filter(x=>x.route_number===1).length;
                      const r2=added.filter(x=>x.route_number===2).length;
                      alert(`✅ Imported! Route 1: ${r1} · Route 2: ${r2}`);
                    }} style={{flex:1,background:"linear-gradient(135deg,#059669,#047857)",color:"#fff",padding:"12px",fontSize:13,fontWeight:700}}>
                      ✅ Import {pdfResult.filter(d=>!d.is_transfer).length} Deliveries + {pdfResult.filter(d=>d.is_transfer).length} Pickups
                    </button>
                    <button className="btn" onClick={()=>setPdfResult(null)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"12px 14px",fontSize:12}}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9",marginBottom:8}}>✏️ Or Add Manually:</div>

            {/* Quick add form */}
            <div style={{...C.card,padding:"16px 18px",marginBottom:14,borderColor:"#1e3a5f"}}>
              <div style={{fontWeight:600,fontSize:13,color:"#60a5fa",marginBottom:12}}>➕ Quick Add Delivery</div>
              {[
                {l:"Sale #",f:"ticket_number",ph:"30503",half:true},
                {l:"Customer Name",f:"customer",ph:"John Smith",half:true},
                {l:"Address",f:"address",ph:"123 Main St NE, Albuquerque NM 87110"},
                {l:"Phone",f:"phone",ph:"505-555-0100",half:true},
                {l:"Time Window",f:"delivery_window",ph:"Morning / 9AM-11AM",half:true},
              ].map(x=>(
                <div key={x.f} style={{marginBottom:8,width:x.half?"50%":"100%",display:"inline-block",paddingRight:x.half?8:0}}>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>{x.l}</div>
                  <input value={pdfResult?.[0]?.[x.f]||""} onChange={e=>setPdfResult(prev=>[{...(prev?.[0]||{}),[x.f]:e.target.value}])}
                    placeholder={x.ph} style={C.inp}/>
                </div>
              ))}
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Delivery Date</div>
                <input type="date" value={pdfResult?.[0]?.delivery_date||new Date().toISOString().split("T")[0]}
                  onChange={e=>setPdfResult(prev=>[{...(prev?.[0]||{}),delivery_date:e.target.value}])}
                  style={{...C.inp,colorScheme:"dark"}}/>
              </div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Driver</div>
                <select value={pdfResult?.[0]?.assigned_to ?? 1} onChange={e=>setPdfResult(prev=>[{...(prev?.[0]||{}),assigned_to:Number(e.target.value)}])} style={C.sel}>
                  {employees.map(e=><option key={e.id} value={e.id}>{e.name}{e.is_manager?" 👑":""}</option>)}
                </select>
              </div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Notes / Instructions</div>
                <textarea value={pdfResult?.[0]?.notes||""} onChange={e=>setPdfResult(prev=>[{...(prev?.[0]||{}),notes:e.target.value}])}
                  rows={2} placeholder="Special instructions, call ahead, etc." style={{...C.inp,resize:"vertical"}}/>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:5}}>Items</div>
                {((pdfResult?.[0]?.items)||[{qty:1,name:"",manufacturer:"",piece_number:""}]).map((item,idx)=>(
                  <div key={idx} style={{background:"#0a1628",borderRadius:7,padding:"9px 11px",marginBottom:6,border:"1px solid #1e2d3d"}}>
                    <div style={{display:"flex",gap:6,marginBottom:6}}>
                      <input type="number" min="1" value={item.qty||1}
                        onChange={e=>{const items=[...(pdfResult?.[0]?.items||[{qty:1,name:""}])];items[idx]={...items[idx],qty:Number(e.target.value)};setPdfResult(prev=>[{...(prev?.[0]||{}),items}]);}}
                        style={{...C.inp,width:55,textAlign:"center"}}/>
                      <input value={item.name||""}
                        onChange={e=>{const items=[...(pdfResult?.[0]?.items||[{qty:1,name:""}])];items[idx]={...items[idx],name:e.target.value};setPdfResult(prev=>[{...(prev?.[0]||{}),items}]);}}
                        placeholder="Item description" style={{...C.inp,flex:1}}/>
                      {(pdfResult?.[0]?.items||[]).length>1&&<button className="btn" onClick={()=>{const items=(pdfResult?.[0]?.items||[]).filter((_,i)=>i!==idx);setPdfResult(prev=>[{...(prev?.[0]||{}),items}]);}} style={{background:"#2d0a0a",color:"#f87171",padding:"5px 8px",fontSize:11}}>✕</button>}
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <input value={item.manufacturer||""} onChange={e=>{const items=[...(pdfResult?.[0]?.items||[])];items[idx]={...items[idx],manufacturer:e.target.value};setPdfResult(prev=>[{...(prev?.[0]||{}),items}]);}} placeholder="Manufacturer (e.g. Serta)" style={{...C.inp,flex:1,fontSize:12}}/>
                      <input value={item.piece_number||""} onChange={e=>{const items=[...(pdfResult?.[0]?.items||[])];items[idx]={...items[idx],piece_number:e.target.value};setPdfResult(prev=>[{...(prev?.[0]||{}),items}]);}} placeholder="Piece # (e.g. 500833819-7550)" style={{...C.inp,flex:1,fontSize:12}}/>
                    </div>
                  </div>
                ))}
                <button className="btn" onClick={()=>setPdfResult(prev=>[{...(prev?.[0]||{}),items:[...(prev?.[0]?.items||[{qty:1,name:""}]),{qty:1,name:"",manufacturer:"",piece_number:""}]}])}
                  style={{background:"#1e2d3d",color:"#60a5fa",padding:"5px 12px",fontSize:12}}>➕ Add Item</button>
              </div>
              <div style={{display:"flex",gap:7}}>
                <button className="btn" onClick={async()=>{
                  const d = pdfResult?.[0]||{};
                  if(!d.customer) {alert("Please enter a customer name.");return;}
                  const today = new Date().toISOString().split("T")[0];
                  const todayCount = deliveries.filter(x=>x.delivery_date===(d.delivery_date||today)).length;
                  const nid=`D-${String(Date.now()).slice(-6)}`;
                  const manufacturer = (d.items||[])[0]?.manufacturer||"";
                  const piece_number = (d.items||[])[0]?.piece_number||"";
                  const newRow={
                    id:nid,customer:d.customer,address:d.address||"",phone:d.phone||"",
                    items:(d.items||[{qty:1,name:""}]).map(i=>({qty:i.qty||1,name:i.name||"",manufacturer:i.manufacturer||"",piece_number:i.piece_number||""})),
                    delivery_window:d.delivery_window||"Morning",
                    assigned_to:(d.assigned_to==null||d.assigned_to==="")?1:Number(d.assigned_to),status:"Scheduled",
                    notes:d.notes||"",floor:"1",elevator:false,
                    removal_requested:false,transfer_scheduled:false,route_notes:"",
                    stop_order:todayCount+1,
                    delivery_date:d.delivery_date||today,
                    ticket_number:String(d.ticket_number||""),
                    helper_id:0,manufacturer,piece_number,
                  };
                  await sb.from("deliveries").insert(newRow);
                  setDeliveries(prev=>[...prev,newRow]);
                  // Clear form for next entry
                  setPdfResult([{customer:"",address:"",phone:"",ticket_number:"",delivery_window:"",notes:"",delivery_date:d.delivery_date||today,assigned_to:d.assigned_to ?? 1,items:[{qty:1,name:"",manufacturer:"",piece_number:""}]}]);
                  alert("✅ "+d.customer+" added! Form cleared for next delivery.");
                }} style={{flex:1,background:"linear-gradient(135deg,#059669,#047857)",color:"#fff",padding:"11px",fontSize:13,fontWeight:700}}>
                  ✅ Add Delivery
                </button>
                <button className="btn" onClick={()=>setPdfResult(null)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"11px 14px",fontSize:13}}>Clear</button>
              </div>
            </div>

            {/* Today's imported deliveries */}
            {(()=>{
              const today=new Date().toISOString().split("T")[0];
              const todayDels=deliveries.filter(d=>d.delivery_date===today).sort((a,b)=>(a.stop_order||0)-(b.stop_order||0));
              if(todayDels.length===0) return null;
              return(
                <div style={{...C.card,overflow:"hidden",marginBottom:14}}>
                  <div style={{padding:"10px 16px",background:"#0a1628",fontSize:11,fontWeight:700,letterSpacing:".08em",color:"#22c55e",textTransform:"uppercase",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>✅ Today's Deliveries ({todayDels.length})</span>
                    <button className="btn" onClick={async()=>{
                      if(!window.confirm("Reset all stop numbers to 1-"+todayDels.length+" for today?")) return;
                      for(let i=0;i<todayDels.length;i++){
                        await sb.from("deliveries").update({stop_order:i+1}).eq("id",todayDels[i].id);
                      }
                      const {data}=await sb.from("deliveries").select("*");
                      if(data) setDeliveries(data);
                    }} style={{background:"#1c1500",color:"#f59e0b",padding:"3px 8px",fontSize:10}}>🔄 Reset #s</button>
                  </div>
                  {todayDels.map((d,i)=>{
                    const emp=employees.find(e=>e.id===d.assigned_to);
                    return(
                      <div key={d.id} style={{padding:"10px 16px",borderTop:i>0?"1px solid #131f2e":"none",display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
                        <span style={{fontSize:11,color:"#64748b",fontFamily:"monospace",flexShrink:0}}>#{d.stop_order}</span>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9"}}>{d.customer}</div>
                          <div style={{fontSize:11,color:"#475569"}}>{(d.items||[]).map(x=>x.qty+"x "+x.name).join(", ")}</div>
                        </div>
                        <span style={{fontSize:11,color:"#94a3b8"}}>{emp?.name}</span>
                        <button className="btn" onClick={async()=>{
                          await sb.from("deliveries").delete().eq("id",d.id);
                          setDeliveries(prev=>prev.filter(x=>x.id!==d.id));
                        }} style={{background:"#2d0a0a",color:"#f87171",padding:"3px 7px",fontSize:10}}>✕</button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Route optimizer */}
            {deliveries.filter(d=>d.delivery_date===new Date().toISOString().split("T")[0]).length>0&&(
              <div style={{...C.card,padding:"14px 16px",borderColor:"#1e3a5f"}}>
                <div style={{fontWeight:600,fontSize:13,color:"#60a5fa",marginBottom:4}}>🗺️ Route Optimizer</div>
                <div style={{fontSize:12,color:"#475569",marginBottom:10}}>Sorts each route separately — Route 1 gets stop 1,2,3... and Route 2 gets its own stop 1,2,3... independently.</div>
                <button className="btn" onClick={async()=>{
                  const today=new Date().toISOString().split("T")[0];
                  const todayDels=deliveries.filter(d=>d.delivery_date===today);
                  const getArea=(d)=>{
                    const addr=(d.address||"").toLowerCase();
                    if(addr.includes("bernalillo")||addr.includes("rio rancho")||addr.includes("corrales")||addr.includes("placitas")) return "A_NORTH_FAR";
                    if(addr.includes("rio rancho")||addr.includes("unser")||addr.includes("coors")) return "B_WESTSIDE";
                    if(addr.includes("santa fe")) return "A_SANTA_FE";
                    if(addr.includes("bosque farms")||addr.includes("los lunas")||addr.includes("belen")||addr.includes("isleta")||addr.includes("peralta")) return "Z_SOUTH_FAR";
                    if(addr.includes("tijeras")||addr.includes("sandia park")||addr.includes("edgewood")) return "D_EAST_MTN";
                    if(addr.includes("corrales")||addr.includes("alameda")||addr.includes("montgomery")||addr.includes("paseo")) return "C_NORTH";
                    if(addr.includes("wyoming")||addr.includes("eubank")||addr.includes("tramway")) return "D_EAST";
                    if(addr.includes("south")||addr.includes("broadway")||addr.includes("gibson")||addr.includes("yale")) return "E_SOUTH";
                    if(addr.includes("central")||addr.includes("lomas")||addr.includes("menaul")) return "C_CENTRAL";
                    return "C_CENTRAL";
                  };
                  const getTimeScore=(d)=>{
                    const w=(d.delivery_window||"").toLowerCase();
                    if(/8\s*am|9\s*am|10\s*am/.test(w)) return 1;
                    if(/morning/.test(w)) return 2;
                    if(/11\s*am|12\s*pm|noon/.test(w)) return 3;
                    if(/afternoon/.test(w)) return 4;
                    if(/1\s*pm|2\s*pm/.test(w)) return 5;
                    if(/3\s*pm|4\s*pm/.test(w)) return 6;
                    if(/5\s*pm|6\s*pm|7\s*pm/.test(w)) return 7;
                    return 3;
                  };
                  // Optimize each route independently
                  for(const routeNum of [1,2]){
                    const routeDels=todayDels.filter(d=>(d.route_number||1)===routeNum&&d.status!=="Transfer");
                    const sorted=[...routeDels].sort((a,b)=>{
                      const areaA=getArea(a),areaB=getArea(b);
                      if(areaA!==areaB) return areaA.localeCompare(areaB);
                      return getTimeScore(a)-getTimeScore(b);
                    });
                    for(let i=0;i<sorted.length;i++){
                      await sb.from("deliveries").update({stop_order:i+1}).eq("id",sorted[i].id);
                    }
                  }
                  const {data}=await sb.from("deliveries").select("*");
                  if(data) setDeliveries(data);
                  const r1=todayDels.filter(d=>(d.route_number||1)===1).length;
                  const r2=todayDels.filter(d=>d.route_number===2).length;
                  alert(`✅ Optimized! Route 1: ${r1} stops (1-${r1}) · Route 2: ${r2} stops (1-${r2})`);
                }} style={{width:"100%",background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",padding:"11px",fontSize:13,fontWeight:700}}>
                  🗺️ Optimize Both Routes Separately
                </button>
              </div>
            )}
          </div>
        )}


        {/* SIGNATURES */}
        {tab==="signatures"&&(
          <div className="fade">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>✍️ Customer Signatures</div>
                <div style={{fontSize:12,color:"#475569",marginTop:2}}>Stored permanently — {signatures.length} total</div>
              </div>
              <button className="btn" onClick={async()=>{
                const r=await sb.from("signatures").select("*").order("signed_at",{ascending:false});
                if(r.data) setSignatures(r.data);
              }} style={{background:"#1e2d3d",color:"#60a5fa",padding:"6px 12px",fontSize:12}}>🔄 Refresh</button>
            </div>
            <input value={sigSearch} onChange={e=>setSigSearch(e.target.value)}
              placeholder="Search by customer name, ticket #, or date..."
              style={{...C.inp,marginBottom:14,fontSize:14}}/>
            {(()=>{
              const filtered = signatures.filter(s=>{
                if(!sigSearch.trim()) return true;
                const q=sigSearch.toLowerCase();
                return (s.customer||"").toLowerCase().includes(q)||(s.ticket_number||"").toLowerCase().includes(q)||(s.delivery_date||"").includes(q)||(s.signed_by||"").toLowerCase().includes(q)||(s.driver_name||"").toLowerCase().includes(q);
              });
              if(filtered.length===0) return(
                <div style={{...C.card,padding:40,textAlign:"center",color:"#475569"}}>
                  <div style={{fontSize:32,marginBottom:8}}>✍️</div>
                  <div>{sigSearch?"No results found.":"No signatures yet."}</div>
                </div>
              );
              return(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {filtered.map(sig=>(
                    <div key={sig.id} style={{...C.card,padding:"14px 16px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,flexWrap:"wrap",gap:6}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>{sig.customer}</div>
                          <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>{sig.address}</div>
                          <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:6}}>
                            {sig.ticket_number&&<span style={{fontSize:11,background:"#1e3a5f",color:"#60a5fa",borderRadius:4,padding:"2px 7px"}}>#{sig.ticket_number}</span>}
                            {sig.driver_name&&<span style={{fontSize:11,background:"#1e2d3d",color:"#94a3b8",borderRadius:4,padding:"2px 7px"}}>🚛 {sig.driver_name}</span>}
                            {sig.delivery_date&&<span style={{fontSize:11,color:"#475569"}}>{sig.delivery_date}</span>}
                            <span style={{fontSize:11,color:"#22c55e"}}>{new Date(sig.signed_at).toLocaleString()}</span>
                          </div>
                          {sig.signed_by&&<div style={{fontSize:11,color:"#a78bfa",marginBottom:6}}>✍️ Signed by: {sig.signed_by}</div>}
                          {(sig.items||[]).length>0&&(
                            <div style={{background:"#0a1628",borderRadius:7,padding:"7px 10px",marginBottom:6}}>
                              <div style={{fontSize:10,color:"#475569",marginBottom:4,textTransform:"uppercase",letterSpacing:".06em"}}>Items Delivered</div>
                              {(sig.items||[]).map((item,ii)=>(
                                <div key={ii} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                                  <span style={{fontSize:11,background:"#1e2d3d",color:"#60a5fa",borderRadius:4,padding:"1px 5px",fontWeight:700}}>{item.qty}x</span>
                                  <span style={{fontSize:12,color:"#e2e8f0"}}>{item.name}</span>
                                  {item.manufacturer&&<span style={{fontSize:10,color:"#475569"}}>{item.manufacturer}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <span style={{fontSize:11,background:"#052e16",color:"#4ade80",borderRadius:6,padding:"3px 9px",fontWeight:600,flexShrink:0}}>✅ Signed</span>
                      </div>
                      {sig.signature_url&&<img src={sig.signature_url} alt="signature" style={{maxWidth:"100%",height:80,objectFit:"contain",background:"#fff",borderRadius:8,padding:8,display:"block"}}/>}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* TRAININGS */}
        {tab==="trainings"&&(
          <div className="fade">
            {/* Training session signing modal */}
            {trainingSigningEmp&&trainingSession&&(
              <TrainingSignPad
                emp={trainingSigningEmp}
                session={trainingSession}
                onSigned={async(url)=>{
                  const c={id:Date.now(),training_id:trainingSession.id,emp_id:trainingSigningEmp.id,emp_name:trainingSigningEmp.name,completed_at:new Date().toISOString(),signature_url:url};
                  await sb.from("training_completions").insert(c);
                  setCompletions(prev=>[...prev,c]);
                  setTrainingSigningEmp(null);
                }}
                onClose={()=>setTrainingSigningEmp(null)}
              />
            )}

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>🎓 Training Log</div>
                <div style={{fontSize:12,color:"#475569",marginTop:2}}>Create training sessions and collect employee signatures.</div>
              </div>
              <button className="btn" onClick={()=>{
                const title=prompt("Training session title (e.g. Weekly Training 4/15/26):");
                if(!title) return;
                setTrainingSession({id:Date.now(),title,topics:[],date:new Date().toLocaleDateString(),created_at:new Date().toISOString(),isNew:true});
              }} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"8px 16px",fontSize:13}}>
                ➕ New Training Session
              </button>
            </div>

            {/* New training session builder */}
            {trainingSession&&trainingSession.isNew&&(
              <div style={{...C.card,padding:"16px 18px",marginBottom:14,borderColor:"#3b82f6"}}>
                <div style={{fontWeight:700,fontSize:14,color:"#60a5fa",marginBottom:12}}>📋 {trainingSession.title}</div>
                <div style={{fontSize:12,color:"#475569",marginBottom:8}}>Add topics covered in this training:</div>
                <div style={{marginBottom:10}}>
                  {(trainingSession.topics||[]).map((topic,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{width:6,height:6,borderRadius:"50%",background:"#3b82f6",flexShrink:0}}/>
                      <span style={{fontSize:13,color:"#e2e8f0",flex:1}}>{topic}</span>
                      <button className="btn" onClick={()=>setTrainingSession(p=>({...p,topics:p.topics.filter((_,ti)=>ti!==i)}))} style={{background:"#2d0a0a",color:"#f87171",padding:"2px 7px",fontSize:11}}>✕</button>
                    </div>
                  ))}
                  <div style={{display:"flex",gap:7,marginTop:8}}>
                    <input id="topicInput" placeholder="e.g. Delivery safety procedures" style={{...C.inp,flex:1}}
                      onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){setTrainingSession(p=>({...p,topics:[...(p.topics||[]),e.target.value.trim()]}));e.target.value="";}}}/>
                    <button className="btn" onClick={()=>{const inp=document.getElementById("topicInput");if(inp&&inp.value.trim()){setTrainingSession(p=>({...p,topics:[...(p.topics||[]),inp.value.trim()]}));inp.value="";}}} style={{background:"#1e2d3d",color:"#60a5fa",padding:"8px 13px",fontSize:13}}>Add</button>
                  </div>
                </div>
                <div style={{fontSize:12,color:"#f1f5f9",fontWeight:600,marginBottom:8,marginTop:12}}>Collect Signatures — tap each employee to sign:</div>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                  {employees.map(emp=>{
                    const signed=completions.find(c=>c.training_id===trainingSession.id&&c.emp_id===emp.id);
                    return(
                      <div key={emp.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:signed?"#052e16":"#0a1628",borderRadius:9,border:`1px solid ${signed?"#22c55e":"#1e2d3d"}`}}>
                        <div style={{width:30,height:30,borderRadius:"50%",background:avatarBg(emp),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0}}>{emp.avatar}</div>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9"}}>{emp.name}</div>
                          <div style={{fontSize:11,color:signed?"#4ade80":"#475569"}}>{signed?"✅ Signed":"Tap to sign"}</div>
                        </div>
                        {!signed?(
                          <button className="btn" onClick={()=>setTrainingSigningEmp(emp)} style={{background:"linear-gradient(135deg,#059669,#047857)",color:"#fff",padding:"7px 14px",fontSize:12,fontWeight:600}}>
                            ✍️ Sign
                          </button>
                        ):(
                          <span style={{fontSize:20}}>✅</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button className="btn" onClick={async()=>{
                    const t={id:trainingSession.id,title:trainingSession.title,description:(trainingSession.topics||[]).join(" | "),type:"training_session",content_url:"",created_at:trainingSession.created_at};
                    await sb.from("trainings").insert(t);
                    setTrainings(prev=>[t,...prev]);
                    setTrainingSession(null);
                  }} style={{flex:1,background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"9px",fontSize:13,fontWeight:600}}>
                    💾 Save & Close Session
                  </button>
                  <button className="btn" onClick={()=>setTrainingSession(null)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"9px 14px",fontSize:13}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Past training sessions */}
            {trainings.length===0&&!trainingSession?(
              <div style={{...C.card,padding:40,textAlign:"center",color:"#475569"}}>
                <div style={{fontSize:32,marginBottom:8}}>🎓</div>
                <div>No training sessions yet. Click "➕ New Training Session" to start.</div>
              </div>
            ):(
              trainings.map((t,i)=>{
                const sessionCompletions=completions.filter(c=>c.training_id===t.id);
                const topics=t.description?t.description.split(" | "):[];
                return(
                  <div key={t.id} style={{...C.card,padding:"14px 16px",marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,flexWrap:"wrap",gap:6}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>{t.title}</div>
                        <div style={{fontSize:11,color:"#475569",marginTop:2}}>{new Date(t.created_at).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <span style={{fontSize:11,background:"#052e16",color:"#4ade80",borderRadius:5,padding:"3px 8px",fontWeight:600}}>{sessionCompletions.length}/{employees.length} signed</span>
                        <button className="btn" onClick={async()=>{
                          await sb.from("trainings").delete().eq("id",t.id);
                          setTrainings(prev=>prev.filter(x=>x.id!==t.id));
                        }} style={{background:"#2d0a0a",color:"#f87171",padding:"4px 8px",fontSize:11}}>✕</button>
                      </div>
                    </div>
                    {topics.length>0&&(
                      <div style={{marginBottom:8}}>
                        {topics.map((topic,ti)=>(
                          <div key={ti} style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
                            <span style={{width:5,height:5,borderRadius:"50%",background:"#3b82f6",flexShrink:0}}/>
                            <span style={{fontSize:12,color:"#94a3b8"}}>{topic}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:sessionCompletions.length<employees.length?8:0}}>
                      {employees.map(emp=>{
                        const signed=sessionCompletions.find(c=>c.emp_id===emp.id);
                        return(
                          <div key={emp.id} style={{display:"flex",alignItems:"center",gap:5,background:signed?"#052e16":"#0a1628",borderRadius:6,padding:"4px 9px",border:`1px solid ${signed?"#22c55e":"#1e2d3d"}`}}>
                            <span style={{fontSize:11,color:signed?"#4ade80":"#475569"}}>{signed?"✅":""} {emp.name.split(" ")[0]}</span>
                          </div>
                        );
                      })}
                    </div>
                    {sessionCompletions.length<employees.length&&(
                      <button className="btn" onClick={()=>{
                        setTrainingSession({...t,topics,isNew:true});
                      }} style={{background:"#1e2d3d",color:"#60a5fa",padding:"6px 13px",fontSize:12,marginTop:4}}>
                        ✍️ Collect Missing Signatures
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}


        {/* LIABILITY FORMS */}
        {tab==="liability"&&(
          <div className="fade">
            <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:4}}>📝 Liability Forms</div>
            <div style={{fontSize:12,color:"#475569",marginBottom:14}}>Customer-signed forms for headboard drilling and furniture moving. Permanent records.</div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              {[
                {type:"headboard",label:"🔧 Headboard Drilling",desc:"Customer authorizes drilling into headboard for bed frame assembly",color:"#1e3a5f",textColor:"#60a5fa"},
                {type:"furniture",label:"🛋️ Furniture Moving",desc:"Customer authorizes moving existing furniture to complete delivery",color:"#1a0a2e",textColor:"#c084fc"},
              ].map(f=>(
                <div key={f.type} style={{...C.card,padding:"14px 16px",borderColor:f.color}}>
                  <div style={{fontWeight:700,fontSize:13,color:f.textColor,marginBottom:6}}>{f.label}</div>
                  <div style={{fontSize:11,color:"#475569",marginBottom:12,lineHeight:1.5}}>{f.desc}</div>
                  <div style={{fontSize:11,color:"#475569",marginBottom:4}}>Recent: {liabilityForms.filter(x=>x.form_type===f.type).length} signed</div>
                </div>
              ))}
            </div>

            {liabilityForms.length===0?(
              <div style={{...C.card,padding:36,textAlign:"center",color:"#475569"}}>
                <div style={{fontSize:28,marginBottom:8}}>📝</div>
                <div>No liability forms yet. Drivers collect these from the delivery screen when needed.</div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {liabilityForms.map(f=>(
                  <div key={f.id} style={{...C.card,padding:"13px 15px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6,flexWrap:"wrap",gap:6}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:13,color:"#f1f5f9"}}>{f.customer}</div>
                        <div style={{fontSize:11,color:"#64748b"}}>{f.address}</div>
                        <div style={{display:"flex",gap:7,marginTop:4,flexWrap:"wrap"}}>
                          {f.ticket_number&&<span style={{fontSize:11,background:"#1e3a5f",color:"#60a5fa",borderRadius:4,padding:"2px 7px"}}>#{f.ticket_number}</span>}
                          <span style={{fontSize:11,background:f.form_type==="headboard"?"#1e3a5f":"#1a0a2e",color:f.form_type==="headboard"?"#60a5fa":"#c084fc",borderRadius:4,padding:"2px 7px"}}>{f.form_type==="headboard"?"🔧 Headboard":"🛋️ Furniture"}</span>
                          <span style={{fontSize:11,color:"#475569"}}>{f.driver_name}</span>
                          <span style={{fontSize:11,color:"#22c55e"}}>{new Date(f.signed_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <span style={{fontSize:11,background:"#052e16",color:"#4ade80",borderRadius:5,padding:"3px 8px",fontWeight:600}}>✅ Signed</span>
                    </div>
                    {f.details&&<div style={{fontSize:12,color:"#94a3b8",marginBottom:6,background:"#0a1628",borderRadius:6,padding:"6px 10px"}}>{f.details}</div>}
                    {f.signature_url&&<img src={f.signature_url} alt="signature" style={{maxWidth:250,height:60,objectFit:"contain",background:"#fff",borderRadius:6,padding:6}}/>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SMS SETUP — Conner only, inactive until approved */}
        {tab==="sms-setup"&&(
          <div className="fade">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>📱 SMS & Tracking Setup</div>
                <div style={{fontSize:12,color:"#475569",marginTop:2}}>Configure and preview before going live. Owner approval required to activate.</div>
              </div>
              <span style={{background:SMS_ENABLED?"#052e16":"#1c1500",color:SMS_ENABLED?"#4ade80":"#f59e0b",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700}}>
                {SMS_ENABLED?"🟢 ACTIVE — Twilio connected":"🟡 INACTIVE"}
              </span>
            </div>

            {/* What happens when activated */}
            <div style={{...C.card,padding:"14px 16px",marginBottom:14,borderColor:"#1e3a5f"}}>
              <div style={{fontWeight:600,fontSize:13,color:"#60a5fa",marginBottom:10}}>📋 How It Will Work When Activated</div>
              {[
                {step:"1",label:"Delivery Confirmed",desc:"Customer gets a text when you add their delivery to the schedule"},
                {step:"2",label:"Driver On The Way",desc:"Driver taps 'Notify Customer' → customer gets a 30-min warning text"},
                {step:"3",label:"Delivered",desc:"When driver marks Delivered → customer gets confirmation + Google review link"},
                {step:"4",label:"Live Tracking",desc:"Driver taps 'Start Tracking' → customer gets a link to watch the truck live"},
              ].map(s=>(
                <div key={s.step} style={{display:"flex",gap:12,marginBottom:10,alignItems:"flex-start"}}>
                  <div style={{width:24,height:24,borderRadius:"50%",background:"#1e3a5f",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#60a5fa",flexShrink:0}}>{s.step}</div>
                  <div>
                    <div style={{fontWeight:600,fontSize:12,color:"#f1f5f9"}}>{s.label}</div>
                    <div style={{fontSize:11,color:"#475569"}}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* SMS Templates — Conner editable */}
            <div style={{...C.card,overflow:"hidden",marginBottom:14}}>
              <div style={{padding:"10px 16px",background:"#0a1628",fontSize:11,fontWeight:700,letterSpacing:".08em",color:"#f1f5f9",textTransform:"uppercase"}}>✏️ Your SMS Templates — Edit Before Going Live</div>
              <div style={{padding:"8px 16px",background:"#0a1628",fontSize:11,color:"#475569",borderBottom:"1px solid #131f2e"}}>
                Variables: {"{name}"} = customer first name, {"{date}"} = delivery date, {"{window}"} = time window, {"{items}"} = item list, {"{review_link}"} = Google review URL
              </div>
              {Object.entries(smsTemplates).map(([key,val],i)=>{
                const labels={confirmed:"✅ Delivery Confirmed",enroute:"🚛 Driver En Route",delivered:"📦 Delivered + Review Request",rescheduled:"📅 Rescheduled"};
                return(
                  <div key={key} style={{padding:"12px 16px",borderTop:i>0?"1px solid #131f2e":"none"}}>
                    <div style={{fontWeight:600,fontSize:12,color:"#f1f5f9",marginBottom:6}}>{labels[key]||key}</div>
                    {editingTemplate===key?(
                      <div>
                        <textarea value={editTemplateVal} onChange={e=>setEditTemplateVal(e.target.value)}
                          rows={3} style={{...C.inp,resize:"vertical",marginBottom:8,fontSize:13}}/>
                        <div style={{display:"flex",gap:7}}>
                          <button className="btn" onClick={()=>{setSmsTemplates(prev=>({...prev,[key]:editTemplateVal}));setEditingTemplate(null);}} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"7px 14px",fontSize:12}}>💾 Save</button>
                          <button className="btn" onClick={()=>setEditingTemplate(null)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"7px 12px",fontSize:12}}>Cancel</button>
                        </div>
                      </div>
                    ):(
                      <div>
                        <div style={{fontSize:12,color:"#94a3b8",background:"#0a1628",borderRadius:7,padding:"8px 11px",lineHeight:1.6,marginBottom:6}}>{val}</div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{fontSize:10,color:val.length>160?"#f87171":"#475569"}}>{val.length} chars {val.length>160?"⚠️ over 160":"✅"}</span>
                          <button className="btn" onClick={()=>{setEditingTemplate(key);setEditTemplateVal(val);}} style={{background:"#1e2d3d",color:"#60a5fa",padding:"4px 10px",fontSize:11}}>✏️ Edit</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Google Review Link */}
            <div style={{...C.card,padding:"14px 16px",marginBottom:14}}>
              <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9",marginBottom:6}}>⭐ Google Review Link</div>
              <div style={{fontSize:11,color:"#475569",marginBottom:8}}>This gets sent automatically after every successful delivery. Get it from your Google Business Profile.</div>
              <input defaultValue={GOOGLE_REVIEW_LINK} placeholder="https://g.page/r/..." style={C.inp}/>
            </div>

            {/* Tracking toggle */}
            <div style={{...C.card,padding:"14px 16px",marginBottom:14}}>
              <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9",marginBottom:6}}>📍 Live Tracking</div>
              <div style={{fontSize:11,color:"#475569",marginBottom:10}}>When enabled, drivers can share their live location with customers via a link texted automatically. Drivers control when tracking is on/off — never tracked off the clock.</div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:44,height:24,borderRadius:12,background:trackingEnabled?"#22c55e":"#334155",cursor:"pointer",position:"relative",transition:"background .2s"}} onClick={()=>setTrackingEnabled(p=>!p)}>
                  <div style={{width:20,height:20,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:trackingEnabled?22:2,transition:"left .2s"}}/>
                </div>
                <span style={{fontSize:13,color:trackingEnabled?"#22c55e":"#475569",fontWeight:600}}>{trackingEnabled?"Enabled (demo only)":"Disabled"}</span>
              </div>
            </div>

            {/* Activation checklist */}
            <div style={{...C.card,padding:"14px 16px",borderColor:"#1c1500"}}>
              <div style={{fontWeight:600,fontSize:13,color:"#f59e0b",marginBottom:10}}>🚀 To Activate SMS — Checklist</div>
              {[
                "Get owner approval",
                "Create Twilio account at twilio.com (free)",
                "Purchase 505 Albuquerque phone number ($1.15/month)",
                "Add TWILIO_ACCOUNT_SID to App.jsx",
                "Add TWILIO_AUTH_TOKEN to App.jsx",
                "Add TWILIO_PHONE to App.jsx",
                "Add your Google Review link above",
                "Set SMS_ENABLED = true in App.jsx",
                "Push to Netlify — done!",
              ].map((item,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:9,marginBottom:7}}>
                  <div style={{width:18,height:18,borderRadius:4,border:"1.5px solid #334155",flexShrink:0}}/>
                  <span style={{fontSize:12,color:"#94a3b8"}}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SMS REPLIES */}
        {tab==="sms-replies"&&(
          <div className="fade">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>💬 Customer Replies</div>
                <div style={{fontSize:12,color:"#475569",marginTop:2}}>{smsReplies.length} {smsReplies.length===1?"reply":"replies"} — {smsReplies.filter(r=>!r._seen).length>0?"🔴 New":""}</div>
              </div>
              <div style={{display:"flex",gap:7}}>
                <button className="btn" onClick={async()=>{
                  const r=await sb.from("sms_replies").select("*").order("id",{ascending:false}).limit(100);
                  if(r.data)setSmsReplies(r.data);
                }} style={{background:"#1e2d3d",color:"#60a5fa",padding:"6px 12px",fontSize:12}}>🔄 Refresh</button>
                <button className="btn" onClick={async()=>{
                  try{
                    const res=await fetch("/.netlify/functions/fetch-replies",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
                    const data=await res.json();
                    if(data.error){alert("Error: "+data.error);return;}
                    alert(`✅ Fetched ${data.count} messages from Twilio. ${data.saved} new replies saved.`);
                    const r=await sb.from("sms_replies").select("*").order("id",{ascending:false}).limit(100);
                    if(r.data)setSmsReplies(r.data);
                  }catch(e){alert("Failed: "+e.message);}
                }} style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",padding:"6px 12px",fontSize:12,fontWeight:600}}>📥 Fetch from Twilio</button>
              </div>
            </div>

            {/* Webhook setup instructions */}
            <div style={{...C.card,padding:"12px 16px",marginBottom:12,borderColor:"#1e3a5f",background:"#0a1628"}}>
              <div style={{fontWeight:600,fontSize:12,color:"#60a5fa",marginBottom:6}}>⚙️ One-time Setup — Auto-receive replies</div>
              <div style={{fontSize:11,color:"#475569",lineHeight:1.8}}>
                1. Go to <strong style={{color:"#94a3b8"}}>console.twilio.com → Phone Numbers → your number</strong><br/>
                2. Under <strong style={{color:"#94a3b8"}}>Messaging → A Message Comes In</strong> set to:<br/>
                <span style={{fontFamily:"monospace",background:"#131f2e",padding:"2px 6px",borderRadius:4,color:"#22c55e",fontSize:11,display:"inline-block",margin:"4px 0",wordBreak:"break-all"}}>https://americasmattress.netlify.app/.netlify/functions/sms-webhook</span><br/>
                3. Click <strong style={{color:"#94a3b8"}}>Save</strong> — replies will auto-appear here from then on<br/>
                4. Use <strong style={{color:"#a78bfa"}}>📥 Fetch from Twilio</strong> above to pull all existing replies right now
              </div>
            </div>

            {smsReplies.length===0?(
              <div style={{...C.card,padding:36,textAlign:"center",color:"#475569"}}>
                <div style={{fontSize:32,marginBottom:8}}>💬</div>
                <div style={{marginBottom:8}}>No replies loaded yet.</div>
                <button className="btn" onClick={async()=>{
                  try{
                    const res=await fetch("/.netlify/functions/fetch-replies",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
                    const data=await res.json();
                    if(data.error){alert("Error: "+data.error);return;}
                    alert(`Fetched ${data.count} messages. ${data.saved} new.`);
                    const r=await sb.from("sms_replies").select("*").order("id",{ascending:false}).limit(100);
                    if(r.data)setSmsReplies(r.data);
                  }catch(e){alert("Failed: "+e.message);}
                }} style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",padding:"10px 20px",fontSize:13,fontWeight:600}}>
                  📥 Pull Replies from Twilio Now
                </button>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {smsReplies.map(r=>{
                  const matchedDel=deliveries.find(d=>{
                    const phone=(d.phone||"").replace(/\D/g,"");
                    const from=(r.from_number||"").replace(/\D/g,"");
                    return phone.length>9&&from.endsWith(phone.slice(-10));
                  });
                  return(
                    <div key={r.id} style={{...C.card,padding:"13px 15px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6,flexWrap:"wrap",gap:6}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:13,color:"#f1f5f9"}}>{matchedDel?matchedDel.customer:(r.customer_name||r.from_number)}</div>
                          <div style={{fontSize:11,color:"#475569"}}>{r.from_number}</div>
                        </div>
                        <span style={{fontSize:11,color:"#475569"}}>{new Date(r.received_at||r.date_created||r.created_at||Date.now()).toLocaleString()}</span>
                      </div>
                      <div style={{fontSize:14,color:"#e2e8f0",background:"#0a1628",borderRadius:8,padding:"10px 12px",lineHeight:1.5}}>{r.body}</div>
                      {matchedDel&&<div style={{fontSize:11,color:"#60a5fa",marginTop:6}}>📦 {matchedDel.customer} — {matchedDel.address} — {matchedDel.ticket_number&&"#"+matchedDel.ticket_number}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* WEEKLY REPORT */}
        {tab==="weekly-report"&&(()=>{
          // Calculate week range
          const weekStart = new Date(reportWeek+"T12:00:00");
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate()+6);
          const weekDays = Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(d.getDate()+i);return d.toISOString().split("T")[0];});

          // Filter deliveries for this week
          const weekDels = deliveries.filter(d=>weekDays.includes(d.delivery_date||""));
          const delivered = weekDels.filter(d=>d.status==="Delivered");
          const pending = weekDels.filter(d=>d.status!=="Delivered"&&d.status!=="Transfer");
          const transfers = weekDels.filter(d=>d.status==="Transfer");

          // Per driver stats
          const driverStats = employees.filter(e=>!e.is_manager).map(emp=>{
            const empDels = delivered.filter(d=>d.assigned_to===emp.id);
            const totalMins = empDels.reduce((acc,d)=>{
              if(d.driver_time_in&&d.driver_time_out){
                const [ih,im]=d.driver_time_in.split(":").map(Number);
                const [oh,om]=d.driver_time_out.split(":").map(Number);
                return acc+((oh*60+om)-(ih*60+im));
              }
              return acc;
            },0);
            const haulOffs = empDels.reduce((acc,d)=>acc+(d.haul_off_count||0),0);
            return {emp, count:empDels.length, minutes:totalMins, haulOffs, deliveries:empDels};
          }).filter(s=>s.count>0);

          // All warranty photos this week
          const warrantyPhotos = delivered.filter(d=>d.warranty_photos&&Object.keys(d.warranty_photos).length>0);

          // Items delivered summary
          const itemsSummary = {};
          delivered.forEach(d=>(d.items||[]).forEach(item=>{
            const k=item.name||"Unknown";
            if(!itemsSummary[k]) itemsSummary[k]=0;
            itemsSummary[k]+=item.qty||1;
          }));

          return(
            <div className="fade">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>📊 Weekly Report</div>
                  <div style={{fontSize:12,color:"#475569",marginTop:2}}>
                    {weekStart.toLocaleDateString("en-US",{month:"short",day:"numeric"})} — {weekEnd.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                  </div>
                </div>
                <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
                  <input type="date" value={reportWeek} onChange={e=>setReportWeek(e.target.value)} style={{...C.inp,width:"auto",colorScheme:"dark",fontSize:12}}/>
                  <button className="btn" onClick={()=>{
                    // Build printable report
                    const driverRows = driverStats.map(s=>`<tr><td>${s.emp.name}</td><td>${s.count}</td><td>${s.minutes>0?Math.floor(s.minutes/60)+"h "+s.minutes%60+"m":"—"}</td><td>${s.haulOffs}</td></tr>`).join("");
                    const itemRows = Object.entries(itemsSummary).sort((a,b)=>b[1]-a[1]).map(([name,qty])=>`<tr><td>${name}</td><td>${qty}</td></tr>`).join("");
                    const dayRows = weekDays.map(day=>{
                      const dayDels = delivered.filter(d=>d.delivery_date===day);
                      return dayDels.length>0?`<tr><td>${new Date(day+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</td><td>${dayDels.length}</td><td>${dayDels.map(d=>d.customer).join(", ")}</td></tr>`:"";
                    }).join("");
                    const html=`<!DOCTYPE html><html><head><title>Weekly Report — America's Mattress</title>
                    <style>body{font-family:Arial,sans-serif;max-width:800px;margin:30px auto;padding:20px;color:#111}
                    h1{font-size:22px}h2{font-size:15px;color:#333;margin-top:24px;border-bottom:1px solid #ddd;padding-bottom:4px}
                    table{width:100%;border-collapse:collapse;margin-top:10px}td,th{padding:8px;border:1px solid #ddd;font-size:13px}
                    th{background:#f5f5f5}.stat{display:inline-block;margin-right:20px;font-size:18px;font-weight:700}
                    .statlabel{font-size:11px;color:#666;display:block}</style></head><body>
                    <h1>🛏 America's Mattress — Weekly Delivery Report</h1>
                    <p>${weekStart.toLocaleDateString("en-US",{month:"long",day:"numeric"})} – ${weekEnd.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</p>
                    <div style="background:#f9f9f9;padding:16px;border-radius:8px;margin:16px 0">
                      <span class="stat">${delivered.length}<span class="statlabel">Delivered</span></span>
                      <span class="stat">${pending.length}<span class="statlabel">Pending</span></span>
                      <span class="stat">${transfers.length}<span class="statlabel">Transfers</span></span>
                      <span class="stat">${weekDels.reduce((a,d)=>a+(d.haul_off_count||0),0)}<span class="statlabel">Haul Offs</span></span>
                    </div>
                    <h2>Driver Performance</h2>
                    <table><tr><th>Driver</th><th>Deliveries</th><th>Total Time</th><th>Haul Offs</th></tr>${driverRows}</table>
                    <h2>Daily Breakdown</h2>
                    <table><tr><th>Day</th><th>Count</th><th>Customers</th></tr>${dayRows}</table>
                    <h2>Items Delivered</h2>
                    <table><tr><th>Item</th><th>Qty</th></tr>${itemRows}</table>
                    ${warrantyPhotos.length>0?`<h2>Warranty Inspections (${warrantyPhotos.length})</h2><p>${warrantyPhotos.map(d=>d.customer+" — "+d.ticket_number).join(", ")}</p>`:""}
                    <p style="font-size:10px;color:#999;margin-top:30px">Generated ${new Date().toLocaleString()} · America's Mattress Albuquerque</p>
                    </body></html>`;
                    const w=window.open("","_blank");w.document.write(html);w.document.close();w.print();
                  }} style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",padding:"7px 14px",fontSize:12,fontWeight:600}}>
                    📄 Print / Save Report
                  </button>
                </div>
              </div>

              {/* Summary stats */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:9,marginBottom:14}}>
                {[
                  {l:"Delivered",v:delivered.length,c:"#22c55e",i:"✅"},
                  {l:"Pending",v:pending.length,c:"#f59e0b",i:"⏳"},
                  {l:"Transfers",v:transfers.length,c:"#60a5fa",i:"📦"},
                  {l:"Haul Offs",v:weekDels.reduce((a,d)=>a+(d.haul_off_count||0),0),c:"#a78bfa",i:"♻️"},
                ].map(s=>(
                  <div key={s.l} style={{...C.card,padding:"12px 10px",textAlign:"center"}}>
                    <div style={{fontSize:18,marginBottom:3}}>{s.i}</div>
                    <div style={{fontSize:22,fontWeight:700,color:s.c,fontFamily:"monospace"}}>{s.v}</div>
                    <div style={{fontSize:10,color:"#475569",marginTop:2}}>{s.l}</div>
                  </div>
                ))}
              </div>

              {/* Driver performance */}
              {driverStats.length>0&&(
                <div style={{...C.card,overflow:"hidden",marginBottom:14}}>
                  <div style={{padding:"10px 16px",background:"#0a1628",fontSize:11,fontWeight:700,letterSpacing:".08em",color:"#f1f5f9",textTransform:"uppercase"}}>🚛 Driver Performance</div>
                  {driverStats.map((s,i)=>(
                    <div key={s.emp.id} style={{padding:"12px 16px",borderTop:i>0?"1px solid #131f2e":"none"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:6}}>
                        <div style={{display:"flex",alignItems:"center",gap:9}}>
                          <div style={{width:30,height:30,borderRadius:"50%",background:"#1e3a5f",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#60a5fa"}}>{s.emp.avatar}</div>
                          <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9"}}>{s.emp.name}</div>
                        </div>
                        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                          <span style={{fontSize:12,color:"#22c55e",fontWeight:700}}>{s.count} deliveries</span>
                          {s.minutes>0&&<span style={{fontSize:12,color:"#60a5fa"}}>{Math.floor(s.minutes/60)}h {s.minutes%60}m total</span>}
                          {s.haulOffs>0&&<span style={{fontSize:12,color:"#a78bfa"}}>{s.haulOffs} haul offs</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        {s.deliveries.map(d=>(
                          <span key={d.id} style={{fontSize:10,background:"#0a1628",color:"#94a3b8",borderRadius:4,padding:"2px 7px"}}>{d.customer.split(" ")[1]||d.customer}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Daily breakdown */}
              <div style={{...C.card,overflow:"hidden",marginBottom:14}}>
                <div style={{padding:"10px 16px",background:"#0a1628",fontSize:11,fontWeight:700,letterSpacing:".08em",color:"#475569",textTransform:"uppercase"}}>📅 Daily Breakdown</div>
                {weekDays.map((day,i)=>{
                  const dayDels=delivered.filter(d=>d.delivery_date===day);
                  const dayLabel=new Date(day+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
                  return(
                    <div key={day} style={{padding:"10px 16px",borderTop:i>0?"1px solid #131f2e":"none",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                      <div style={{fontSize:12,color:"#64748b",width:90,flexShrink:0}}>{dayLabel}</div>
                      <div style={{flex:1}}>
                        {dayDels.length===0?(
                          <span style={{fontSize:11,color:"#334155"}}>No deliveries</span>
                        ):(
                          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                            {dayDels.map(d=>(
                              <span key={d.id} style={{fontSize:11,background:"#052e16",color:"#4ade80",borderRadius:4,padding:"2px 7px"}}>{d.customer.split(" ")[0]} {d.customer.split(" ")[1]?.[0]||""}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      {dayDels.length>0&&<span style={{fontSize:12,fontWeight:700,color:"#22c55e",flexShrink:0}}>{dayDels.length}</span>}
                    </div>
                  );
                })}
              </div>

              {/* Items summary */}
              {Object.keys(itemsSummary).length>0&&(
                <div style={{...C.card,overflow:"hidden",marginBottom:14}}>
                  <div style={{padding:"10px 16px",background:"#0a1628",fontSize:11,fontWeight:700,letterSpacing:".08em",color:"#475569",textTransform:"uppercase"}}>📦 Items Delivered This Week</div>
                  {Object.entries(itemsSummary).sort((a,b)=>b[1]-a[1]).map(([name,qty],i)=>(
                    <div key={name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderTop:i>0?"1px solid #131f2e":"none"}}>
                      <span style={{fontSize:13,color:"#e2e8f0"}}>{name}</span>
                      <span style={{fontSize:13,fontWeight:700,color:"#60a5fa",background:"#0c2340",borderRadius:6,padding:"3px 10px"}}>{qty}x</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Warranty photos */}
              {warrantyPhotos.length>0&&(
                <div style={{...C.card,overflow:"hidden"}}>
                  <div style={{padding:"10px 16px",background:"#0a1628",fontSize:11,fontWeight:700,letterSpacing:".08em",color:"#f59e0b",textTransform:"uppercase"}}>🔍 Warranty Inspections ({warrantyPhotos.length})</div>
                  {warrantyPhotos.map((d,i)=>{
                    const photos = d.warranty_photos||{};
                    const STEPS = ["flat","angle","closeup","foundation","frame","lawtag"];
                    return(
                      <div key={d.id} style={{padding:"12px 16px",borderTop:i>0?"1px solid #131f2e":"none"}}>
                        <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9",marginBottom:4}}>{d.customer} — #{d.ticket_number}</div>
                        <div style={{fontSize:11,color:"#475569",marginBottom:8}}>{d.address} · {d.delivery_date}</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {STEPS.map(step=>photos[step]?(
                            <a key={step} href={photos[step]} target="_blank" rel="noreferrer">
                              <img src={photos[step]} alt={step} style={{width:70,height:70,objectFit:"cover",borderRadius:6,border:"1px solid #1e2d3d"}}/>
                            </a>
                          ):null)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {weekDels.length===0&&(
                <div style={{...C.card,padding:40,textAlign:"center",color:"#475569"}}>
                  <div style={{fontSize:32,marginBottom:8}}>📊</div>
                  <div>No deliveries found for this week. Use the date picker to select a different week.</div>
                </div>
              )}
            </div>
          );
        })()}

        {/* DAILY SUMMARY */}
        {tab==="daily-summary"&&(()=>{
          const dayDels = deliveries.filter(d=>d.delivery_date===summaryDate).sort((a,b)=>(a.stop_order||0)-(b.stop_order||0));
          const route1 = dayDels.filter(d=>(d.route_number||1)===1);
          const route2 = dayDels.filter(d=>d.route_number===2);
          const printSummary = () => {
            const routeTable = (dels, routeNum) => {
              if(!dels.length) return "";
              const rows = dels.map(d=>{
                const driver = employees.find(e=>e.id===d.assigned_to);
                const items = (d.items||[]).map(i=>`${i.qty}x ${i.name}`).join(", ");
                return `<tr>
                  <td style="font-weight:700;font-size:15px">${d.stop_order||""}</td>
                  <td><strong>${d.customer}</strong><br/><span style="font-size:11px;color:#555">${d.address}</span><br/><span style="font-size:11px">${d.phone||""}</span></td>
                  <td style="font-size:12px">${items}</td>
                  <td style="font-size:12px">${d.delivery_window||""}</td>
                  <td style="font-size:12px">${driver?.name||""}</td>
                  <td style="font-size:12px;color:${d.status==="Delivered"?"#16a34a":d.status==="Transfer"?"#d97706":"#2563eb"}">${d.status||"Scheduled"}</td>
                  <td style="font-size:11px;color:#666">${(d.notes||"").substring(0,80)}</td>
                </tr>`;
              }).join("");
              return `<h3 style="margin:16px 0 6px;color:#1e3a5f;font-size:14px">🚛 Route ${routeNum} — ${dels.length} stops</h3>
              <table border="1" style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
                <tr style="background:#f0f4f8"><th style="padding:6px">Stop</th><th>Customer</th><th>Items</th><th>Window</th><th>Driver</th><th>Status</th><th>Notes</th></tr>
                ${rows}
              </table>`;
            };
            const html = `<!DOCTYPE html><html><head><title>Daily Route — ${summaryDate}</title>
            <style>body{font-family:Arial,sans-serif;margin:20px;color:#111}table td,table th{padding:6px 8px;border:1px solid #ddd;vertical-align:top}@media print{.no-print{display:none}}</style>
            </head><body>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
              <div><h1 style="margin:0;font-size:20px">🛏 America's Mattress</h1><h2 style="margin:4px 0;color:#555;font-size:15px">Daily Delivery Route — ${new Date(summaryDate+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</h2></div>
              <div style="font-size:12px;color:#888">Generated: ${new Date().toLocaleString()}</div>
            </div>
            <div style="display:flex;gap:20px;margin-bottom:12px;font-size:13px">
              <span>Total: <strong>${dayDels.length}</strong></span>
              <span>Delivered: <strong style="color:#16a34a">${dayDels.filter(d=>d.status==="Delivered").length}</strong></span>
              <span>Pending: <strong style="color:#2563eb">${dayDels.filter(d=>d.status!=="Delivered"&&d.status!=="Transfer").length}</strong></span>
              <span>Transfers: <strong style="color:#d97706">${dayDels.filter(d=>d.status==="Transfer").length}</strong></span>
              <span>Haul Offs: <strong>${dayDels.filter(d=>d.removal_requested).length}</strong></span>
            </div>
            ${routeTable(route1,1)}
            ${routeTable(route2,2)}
            <div class="no-print" style="margin-top:16px"><button onclick="window.print()" style="padding:10px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨️ Print</button></div>
            </body></html>`;
            const w = window.open("","_blank");
            w.document.write(html);
            w.document.close();
          };
          return(
            <div className="fade">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>🖨️ Daily Summary</div>
                  <div style={{fontSize:12,color:"#475569",marginTop:2}}>Print the day's route for your POS system or whiteboard.</div>
                </div>
                <button className="btn" onClick={printSummary} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"8px 16px",fontSize:13,fontWeight:700}}>🖨️ Print / Save PDF</button>
              </div>
              <input type="date" value={summaryDate} onChange={e=>setSummaryDate(e.target.value)} style={{...C.inp,marginBottom:14,colorScheme:"dark",maxWidth:200}}/>
              {dayDels.length===0?(
                <div style={{...C.card,padding:36,textAlign:"center",color:"#475569"}}>
                  <div style={{fontSize:28,marginBottom:8}}>📋</div>
                  <div>No deliveries for {new Date(summaryDate+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}.</div>
                </div>
              ):(
                [1,2].map(routeNum=>{
                  const rDels = dayDels.filter(d=>(d.route_number||1)===routeNum);
                  if(!rDels.length) return null;
                  return(
                    <div key={routeNum} style={{marginBottom:16}}>
                      <div style={{fontWeight:700,fontSize:13,color:routeNum===1?"#60a5fa":"#a78bfa",marginBottom:8,textTransform:"uppercase",letterSpacing:".07em"}}>🚛 Route {routeNum} — {rDels.length} stops</div>
                      {rDels.map(d=>{
                        const driver=employees.find(e=>e.id===d.assigned_to);
                        return(
                          <div key={d.id} style={{...C.card,padding:"11px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"flex-start",borderLeft:`3px solid ${d.status==="Delivered"?"#22c55e":d.status==="Transfer"?"#f59e0b":"#3b82f6"}`}}>
                            <div style={{fontSize:18,fontWeight:800,color:"#475569",minWidth:24,textAlign:"center",flexShrink:0}}>{d.stop_order||"?"}</div>
                            <div style={{flex:1}}>
                              <div style={{fontWeight:700,fontSize:13,color:"#f1f5f9"}}>{d.customer}</div>
                              <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>{d.address}</div>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:d.notes?4:0}}>
                                {(d.items||[]).map((item,ii)=><span key={ii} style={{fontSize:11,background:"#0a1628",color:"#94a3b8",borderRadius:4,padding:"1px 6px"}}>{item.qty}x {item.name}</span>)}
                              </div>
                              {d.notes&&<div style={{fontSize:11,color:"#f59e0b",marginTop:3}}>📋 {d.notes.substring(0,100)}</div>}
                            </div>
                            <div style={{flexShrink:0,textAlign:"right"}}>
                              <div style={{fontSize:11,color:"#64748b"}}>{d.delivery_window}</div>
                              <div style={{fontSize:11,color:"#94a3b8"}}>{driver?.name||"Unassigned"}</div>
                              <span style={{fontSize:10,background:d.status==="Delivered"?"#052e16":d.status==="Transfer"?"#1c1500":"#0c2340",color:d.status==="Delivered"?"#4ade80":d.status==="Transfer"?"#f59e0b":"#60a5fa",borderRadius:4,padding:"2px 6px",fontWeight:600}}>{d.status||"Scheduled"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          );
        })()}

        {/* RECEIPTS */}
        {tab==="receipts"&&(
          <div className="fade">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>🧾 Receipt Log</div>
                <div style={{fontSize:12,color:"#475569",marginTop:2}}>Track expenses. Export monthly report to send to owner.</div>
              </div>
              <input type="month" value={receiptMonth} onChange={e=>setReceiptMonth(e.target.value)} style={{...C.inp,width:"auto",colorScheme:"dark",fontSize:12}}/>
            </div>

            {/* Add receipt */}
            <div style={{...C.card,padding:"14px 16px",marginBottom:14,borderColor:"#1e3a5f"}}>
              <div style={{fontWeight:600,fontSize:13,color:"#60a5fa",marginBottom:10}}>➕ Add Receipt</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Date</div>
                  <input type="date" value={newReceipt.receipt_date} onChange={e=>setNewReceipt(p=>({...p,receipt_date:e.target.value}))} style={{...C.inp,colorScheme:"dark"}}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Amount ($)</div>
                  <input type="number" step="0.01" value={newReceipt.amount} onChange={e=>setNewReceipt(p=>({...p,amount:e.target.value}))} placeholder="0.00" style={C.inp}/>
                </div>
              </div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Reason / Description</div>
                <input value={newReceipt.reason} onChange={e=>setNewReceipt(p=>({...p,reason:e.target.value}))} placeholder="e.g. Truck fuel, supplies, lunch for crew..." style={C.inp}/>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Receipt Photo</div>
                <input type="file" accept="image/*" onChange={async(e)=>{
                  const file=e.target.files[0];
                  if(!file)return;
                  setReceiptUploading(true);
                  const reader=new FileReader();
                  reader.onload=async(ev)=>{
                    const img=new Image();
                    img.onload=async()=>{
                      const MAX=1200;let w=img.width,h=img.height;
                      if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}
                      const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
                      canvas.getContext("2d").drawImage(img,0,0,w,h);
                      canvas.toBlob(async(blob)=>{
                        const path=`receipts/${Date.now()}.jpg`;
                        const {error}=await sb.storage.from("photos").upload(path,blob,{contentType:"image/jpeg"});
                        if(!error){const url=sb.storage.from("photos").getPublicUrl(path).data.publicUrl;setNewReceipt(p=>({...p,photo_url:url}));}
                        setReceiptUploading(false);
                      },"image/jpeg",0.85);
                    };
                    img.src=ev.target.result;
                  };
                  reader.readAsDataURL(file);
                }} style={{...C.inp,padding:"8px"}}/>
                {receiptUploading&&<div style={{fontSize:11,color:"#60a5fa",marginTop:4}}>⏳ Uploading...</div>}
                {newReceipt.photo_url&&<img src={newReceipt.photo_url} alt="receipt" style={{width:120,height:80,objectFit:"cover",borderRadius:6,marginTop:6,border:"1px solid #1e2d3d"}}/>}
              </div>
              <button className="btn" onClick={async()=>{
                if(!newReceipt.reason||!newReceipt.amount)return alert("Please enter reason and amount.");
                const r={id:Date.now(),reason:newReceipt.reason,amount:parseFloat(newReceipt.amount),receipt_date:newReceipt.receipt_date,photo_url:newReceipt.photo_url||"",submitted_by:currentUser.name,created_at:new Date().toISOString()};
                await sb.from("receipts").insert(r);
                setReceipts(prev=>[r,...prev]);
                setNewReceipt({reason:"",amount:"",receipt_date:new Date().toISOString().split("T")[0],photo_url:""});
              }} style={{width:"100%",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"11px",fontSize:13,fontWeight:700}}>
                💾 Save Receipt
              </button>
            </div>

            {/* Monthly summary + export */}
            {(()=>{
              const monthReceipts=receipts.filter(r=>r.receipt_date&&r.receipt_date.startsWith(receiptMonth));
              const total=monthReceipts.reduce((a,r)=>a+(parseFloat(r.amount)||0),0);
              return(
                <div>
                  <div style={{...C.card,padding:"12px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                    <div>
                      <div style={{fontSize:12,color:"#475569"}}>Month Total — {new Date(receiptMonth+"-15").toLocaleDateString("en-US",{month:"long",year:"numeric"})}</div>
                      <div style={{fontWeight:700,fontSize:22,color:"#22c55e",fontFamily:"monospace"}}>${total.toFixed(2)}</div>
                      <div style={{fontSize:11,color:"#475569"}}>{monthReceipts.length} receipts</div>
                    </div>
                    <button className="btn" onClick={()=>{
                      const rows=[["Date","Reason","Amount","Submitted By"]];
                      monthReceipts.forEach(r=>rows.push([r.receipt_date,r.reason,"$"+parseFloat(r.amount).toFixed(2),r.submitted_by||""]));
                      rows.push(["","TOTAL","$"+total.toFixed(2),""]);
                      const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
                      const blob=new Blob([csv],{type:"text/csv"});
                      const url=URL.createObjectURL(blob);
                      const a=document.createElement("a");
                      a.href=url;a.download=`receipts_${receiptMonth}.csv`;a.click();
                    }} style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",padding:"8px 14px",fontSize:12,fontWeight:600}}>
                      📄 Export Monthly Report
                    </button>
                  </div>
                  {monthReceipts.length===0?(
                    <div style={{...C.card,padding:36,textAlign:"center",color:"#475569"}}>
                      <div style={{fontSize:28,marginBottom:8}}>🧾</div>
                      <div>No receipts for {new Date(receiptMonth+"-15").toLocaleDateString("en-US",{month:"long",year:"numeric"})}.</div>
                    </div>
                  ):(
                    monthReceipts.map((r,i)=>(
                      <div key={r.id} style={{...C.card,padding:"12px 16px",marginBottom:8,display:"flex",gap:12,alignItems:"flex-start"}}>
                        {r.photo_url&&<img src={r.photo_url} alt="receipt" onClick={()=>window.open(r.photo_url,"_blank")} style={{width:70,height:70,objectFit:"cover",borderRadius:6,flexShrink:0,cursor:"pointer",border:"1px solid #1e2d3d"}}/>}
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9"}}>{r.reason}</div>
                          <div style={{fontSize:11,color:"#475569",marginTop:2}}>{r.receipt_date} · {r.submitted_by}</div>
                        </div>
                        <div style={{fontWeight:700,fontSize:16,color:"#22c55e",fontFamily:"monospace",flexShrink:0}}>${parseFloat(r.amount||0).toFixed(2)}</div>
                      </div>
                    ))
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* RECEIVING LOG */}
        {tab==="receiving"&&(
          <div className="fade">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>📬 Receiving Log</div>
                <div style={{fontSize:12,color:"#475569",marginTop:2}}>Log incoming shipments. Search by manufacturer to find BOL photos.</div>
              </div>
            </div>

            {/* Add receiving entry */}
            <div style={{...C.card,padding:"14px 16px",marginBottom:14,borderColor:"#1e3a5f"}}>
              <div style={{fontWeight:600,fontSize:13,color:"#60a5fa",marginBottom:10}}>➕ Log Received Shipment</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Date Received</div>
                  <input type="date" value={newReceiving.received_date} onChange={e=>setNewReceiving(p=>({...p,received_date:e.target.value}))} style={{...C.inp,colorScheme:"dark"}}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Vendor / Supplier</div>
                  <input value={newReceiving.vendor} onChange={e=>setNewReceiving(p=>({...p,vendor:e.target.value}))} placeholder="e.g. Serta, Simmons, Bedgear" style={C.inp}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Manufacturer</div>
                  <input value={newReceiving.manufacturer} onChange={e=>setNewReceiving(p=>({...p,manufacturer:e.target.value}))} placeholder="e.g. SERTA, SIMMONS" style={C.inp}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Received By</div>
                  <select value={newReceiving.received_by} onChange={e=>setNewReceiving(p=>({...p,received_by:e.target.value}))} style={C.sel}>
                    <option value="">Select...</option>
                    {employees.map(e=><option key={e.id} value={e.name}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Quantity (pieces)</div>
                  <input type="number" min="1" value={newReceiving.quantity} onChange={e=>setNewReceiving(p=>({...p,quantity:Number(e.target.value)}))} style={C.inp}/>
                </div>
              </div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Items / Description</div>
                <input value={newReceiving.items} onChange={e=>setNewReceiving(p=>({...p,items:e.target.value}))} placeholder="e.g. 2x Knox Queen, 1x Silver Base TXL" style={C.inp}/>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Notes / Problems</div>
                <textarea value={newReceiving.notes} onChange={e=>setNewReceiving(p=>({...p,notes:e.target.value}))} placeholder="Any damage, missing items, discrepancies..." rows={2} style={{...C.inp,resize:"vertical"}}/>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:3}}>📄 BOL Photo</div>
                <input type="file" accept="image/*" onChange={async(e)=>{
                  const file=e.target.files[0];
                  if(!file)return;
                  setBolUploading(true);
                  try {
                    const blob = await new Promise((res)=>{
                      const reader=new FileReader();
                      reader.onload=async(ev)=>{
                        const img=new Image();
                        img.onload=()=>{
                          const MAX=1600;let w=img.width,h=img.height;
                          if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}
                          const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
                          canvas.getContext("2d").drawImage(img,0,0,w,h);
                          canvas.toBlob((b)=>res(b),"image/jpeg",0.9);
                        };
                        img.src=ev.target.result;
                      };
                      reader.readAsDataURL(file);
                    });
                    const path=`bol/${Date.now()}.jpg`;
                    const {error}=await sb.storage.from("photos").upload(path,blob,{contentType:"image/jpeg"});
                    if(!error){
                      const url=sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
                      setNewReceiving(p=>({...p,bol_photo_url:url}));
                    } else { alert("Upload failed: "+error.message); }
                  } catch(err){ alert("Error: "+err.message); }
                  setBolUploading(false);
                  e.target.value="";
                }} style={{...C.inp,padding:"8px"}}/>
                {bolUploading&&<div style={{fontSize:11,color:"#60a5fa",marginTop:4}}>⏳ Uploading BOL...</div>}
                {newReceiving.bol_photo_url&&<div style={{marginTop:6,display:"flex",alignItems:"center",gap:8}}>
                  <img src={newReceiving.bol_photo_url} alt="BOL" onClick={()=>window.open(newReceiving.bol_photo_url,"_blank")} style={{width:100,height:70,objectFit:"cover",borderRadius:6,cursor:"pointer",border:"1px solid #22c55e"}}/>
                  <span style={{fontSize:11,color:"#22c55e"}}>✅ BOL uploaded</span>
                </div>}
              </div>
              <button className="btn" onClick={async()=>{
                if(!newReceiving.vendor)return alert("Please enter a vendor.");
                const r={id:Date.now(),received_date:newReceiving.received_date,vendor:newReceiving.vendor,manufacturer:newReceiving.manufacturer,received_by:newReceiving.received_by||currentUser.name,quantity:newReceiving.quantity||1,items:newReceiving.items||"",notes:newReceiving.notes||"",bol_photo_url:newReceiving.bol_photo_url||"",created_at:new Date().toISOString()};
                const {error}=await sb.from("receiving_log").insert(r);
                if(error){alert("Save failed: "+error.message);return;}
                setReceivingLog(prev=>[r,...prev]);
                setNewReceiving({received_date:new Date().toISOString().split("T")[0],vendor:"",received_by:"",quantity:1,notes:"",manufacturer:"",items:"",bol_photo_url:""});
                alert("✅ Shipment logged!");
              }} style={{width:"100%",background:"linear-gradient(135deg,#059669,#047857)",color:"#fff",padding:"11px",fontSize:13,fontWeight:700}}>
                📬 Log Shipment
              </button>
            </div>

            {/* Search */}
            <input value={receivingSearch} onChange={e=>setReceivingSearch(e.target.value)}
              placeholder="🔍 Search by manufacturer, vendor, date, or item..."
              style={{...C.inp,marginBottom:12,fontSize:14}}/>

            {/* Log entries */}
            {receivingLog.filter(r=>{
              if(!receivingSearch.trim())return true;
              const q=receivingSearch.toLowerCase();
              return (r.manufacturer||"").toLowerCase().includes(q)||(r.vendor||"").toLowerCase().includes(q)||(r.items||"").toLowerCase().includes(q)||(r.received_date||"").includes(q)||(r.notes||"").toLowerCase().includes(q);
            }).length===0?(
              <div style={{...C.card,padding:36,textAlign:"center",color:"#475569"}}>
                <div style={{fontSize:28,marginBottom:8}}>📬</div>
                <div>{receivingSearch?"No results found.":"No shipments logged yet."}</div>
              </div>
            ):(
              receivingLog.filter(r=>{
                if(!receivingSearch.trim())return true;
                const q=receivingSearch.toLowerCase();
                return (r.manufacturer||"").toLowerCase().includes(q)||(r.vendor||"").toLowerCase().includes(q)||(r.items||"").toLowerCase().includes(q)||(r.received_date||"").includes(q)||(r.notes||"").toLowerCase().includes(q);
              }).map(r=>(
                <div key={r.id} style={{...C.card,padding:"14px 16px",marginBottom:10}}>
                  <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                    {r.bol_photo_url&&(
                      <img src={r.bol_photo_url} alt="BOL" onClick={()=>window.open(r.bol_photo_url,"_blank")}
                        style={{width:80,height:80,objectFit:"cover",borderRadius:8,flexShrink:0,cursor:"pointer",border:"2px solid #1e3a5f"}}/>
                    )}
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6,marginBottom:6}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>{r.vendor}</div>
                          {r.manufacturer&&<span style={{fontSize:11,background:"#1e3a5f",color:"#60a5fa",borderRadius:4,padding:"2px 7px",marginRight:6}}>{r.manufacturer}</span>}
                          <span style={{fontSize:11,color:"#475569"}}>{r.received_date}</span>
                        </div>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <span style={{fontSize:13,fontWeight:700,color:"#a78bfa",background:"#1e1038",borderRadius:6,padding:"3px 10px"}}>{r.quantity} pcs</span>
                        </div>
                      </div>
                      {r.items&&<div style={{fontSize:12,color:"#e2e8f0",marginBottom:4}}>{r.items}</div>}
                      {r.notes&&<div style={{fontSize:12,color:"#f59e0b",background:"#1c1500",borderRadius:5,padding:"4px 8px",marginBottom:4}}>⚠️ {r.notes}</div>}
                      <div style={{fontSize:11,color:"#475569"}}>Received by: {r.received_by}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TRAINING FILES */}
        {tab==="training-files"&&(
          <div className="fade">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>🎬 Training Library</div>
                <div style={{fontSize:12,color:"#475569",marginTop:2}}>Add training videos and documents. Employees watch and sign off.</div>
              </div>
              <button className="btn" onClick={()=>setShowAddTraining(p=>!p)} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"7px 14px",fontSize:12}}>
                {showAddTraining?"✕ Cancel":"➕ Add Training"}
              </button>
            </div>

            {showAddTraining&&(
              <div style={{...C.card,padding:"14px 16px",marginBottom:14,borderColor:"#3b82f6"}}>
                <div style={{fontWeight:600,fontSize:13,color:"#60a5fa",marginBottom:10}}>New Training</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  <div>
                    <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Title</div>
                    <input value={newTrainingFile.title} onChange={e=>setNewTrainingFile(p=>({...p,title:e.target.value}))} placeholder="e.g. Delivery Safety Procedures" style={C.inp}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Category</div>
                    <select value={newTrainingFile.category} onChange={e=>setNewTrainingFile(p=>({...p,category:e.target.value}))} style={C.sel}>
                      {["New Hire","Safety","Delivery","Product Knowledge","Customer Service","Warehouse","Compliance"].map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Video URL (YouTube, Vimeo, or direct link)</div>
                  <input value={newTrainingFile.video_url} onChange={e=>setNewTrainingFile(p=>({...p,video_url:e.target.value}))} placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..." style={C.inp}/>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,color:"#475569",marginBottom:3}}>Description / Notes</div>
                  <textarea value={newTrainingFile.content} onChange={e=>setNewTrainingFile(p=>({...p,content:e.target.value}))} placeholder="What this training covers, key points..." rows={3} style={{...C.inp,resize:"vertical"}}/>
                </div>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:12}}>
                  <input type="checkbox" checked={newTrainingFile.requires_signature} onChange={e=>setNewTrainingFile(p=>({...p,requires_signature:e.target.checked}))} style={{width:16,height:16}}/>
                  <span style={{fontSize:13,color:"#94a3b8"}}>Require employee signature after watching</span>
                </label>
                <button className="btn" onClick={async()=>{
                  if(!newTrainingFile.title)return alert("Please enter a title.");
                  const t={id:Date.now(),title:newTrainingFile.title,content:newTrainingFile.content,category:newTrainingFile.category,video_url:newTrainingFile.video_url,requires_signature:newTrainingFile.requires_signature,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
                  await sb.from("training_files").insert(t);
                  setTrainingFiles(prev=>[t,...prev]);
                  setNewTrainingFile({title:"",content:"",category:"New Hire",video_url:"",requires_signature:false});
                  setShowAddTraining(false);
                }} style={{width:"100%",background:"linear-gradient(135deg,#059669,#047857)",color:"#fff",padding:"11px",fontSize:13,fontWeight:700}}>
                  💾 Save Training
                </button>
              </div>
            )}

            {/* Category groups */}
            {(()=>{
              const cats=[...new Set(trainingFiles.map(t=>t.category))];
              if(trainingFiles.length===0) return(
                <div style={{...C.card,padding:40,textAlign:"center",color:"#475569"}}>
                  <div style={{fontSize:32,marginBottom:8}}>🎬</div>
                  <div>No training materials yet. Click "➕ Add Training" to get started.</div>
                </div>
              );
              return cats.map(cat=>(
                <div key={cat} style={{marginBottom:14}}>
                  <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",marginBottom:8}}>{cat}</div>
                  {trainingFiles.filter(t=>t.category===cat).map(t=>{
                    const completed=completions.filter(c=>c.training_id===t.id);
                    const getEmbedUrl=(url)=>{
                      if(!url)return null;
                      const ytMatch=url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
                      if(ytMatch)return`https://www.youtube.com/embed/${ytMatch[1]}`;
                      const vimeoMatch=url.match(/vimeo\.com\/(\d+)/);
                      if(vimeoMatch)return`https://player.vimeo.com/video/${vimeoMatch[1]}`;
                      return url;
                    };
                    const embedUrl=getEmbedUrl(t.video_url);
                    return(
                      <div key={t.id} style={{...C.card,marginBottom:10,overflow:"hidden"}}>
                        <div style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6}}>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:700,fontSize:13,color:"#f1f5f9",marginBottom:4}}>{t.title}</div>
                            {t.content&&<div style={{fontSize:12,color:"#475569",marginBottom:4}}>{t.content.substring(0,100)}{t.content.length>100?"...":""}</div>}
                            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                              {t.requires_signature&&<span style={{fontSize:10,background:"#1c1500",color:"#f59e0b",borderRadius:4,padding:"2px 6px"}}>✍️ Signature required</span>}
                              {completed.length>0&&<span style={{fontSize:10,background:"#052e16",color:"#4ade80",borderRadius:4,padding:"2px 6px"}}>✅ {completed.length}/{employees.length} signed</span>}
                              {t.video_url&&<span style={{fontSize:10,background:"#0c2340",color:"#60a5fa",borderRadius:4,padding:"2px 6px"}}>🎬 Video</span>}
                            </div>
                          </div>
                          <div style={{display:"flex",gap:6}}>
                            <button className="btn" onClick={()=>setViewingTraining(viewingTraining===t.id?null:t.id)} style={{background:"#1e2d3d",color:"#60a5fa",padding:"5px 10px",fontSize:11}}>
                              {viewingTraining===t.id?"▲ Close":"▼ View"}
                            </button>
                            <button className="btn" onClick={async()=>{
                              if(!window.confirm("Delete this training?"))return;
                              await sb.from("training_files").delete().eq("id",t.id);
                              setTrainingFiles(prev=>prev.filter(x=>x.id!==t.id));
                            }} style={{background:"#2d0a0a",color:"#f87171",padding:"5px 9px",fontSize:11}}>✕</button>
                          </div>
                        </div>
                        {viewingTraining===t.id&&(
                          <div style={{borderTop:"1px solid #1e2d3d"}}>
                            {embedUrl&&(
                              <div style={{position:"relative",paddingBottom:"56.25%",height:0,overflow:"hidden"}}>
                                <iframe src={embedUrl} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",border:0}} allowFullScreen title={t.title}/>
                              </div>
                            )}
                            {t.content&&<div style={{padding:"12px 16px",fontSize:13,color:"#94a3b8",lineHeight:1.6,borderTop:embedUrl?"1px solid #1e2d3d":"none"}}>{t.content}</div>}
                            {t.requires_signature&&(
                              <div style={{padding:"12px 16px",borderTop:"1px solid #1e2d3d"}}>
                                <div style={{fontSize:11,color:"#475569",marginBottom:8,textTransform:"uppercase",letterSpacing:".07em"}}>Employee Completions</div>
                                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                                  {employees.map(emp=>{
                                    const signed=completed.find(c=>c.emp_id===emp.id);
                                    return(
                                      <div key={emp.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:signed?"#052e16":"#0a1628",borderRadius:7,border:`1px solid ${signed?"#22c55e":"#1e2d3d"}`}}>
                                        <div style={{width:26,height:26,borderRadius:"50%",background:avatarBg(emp),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff"}}>{emp.avatar}</div>
                                        <div style={{flex:1,fontSize:12,color:"#f1f5f9"}}>{emp.name}</div>
                                        {signed?(
                                          <span style={{fontSize:11,color:"#4ade80"}}>✅ {new Date(signed.completed_at).toLocaleDateString()}</span>
                                        ):(
                                          <button className="btn" onClick={async()=>{
                                            const c={id:Date.now(),training_id:t.id,emp_id:emp.id,emp_name:emp.name,completed_at:new Date().toISOString(),signature_url:""};
                                            await sb.from("training_completions").insert(c);
                                            setCompletions(prev=>[...prev,c]);
                                          }} style={{background:"#1e3a5f",color:"#60a5fa",padding:"4px 10px",fontSize:11}}>Mark Complete</button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        )}

        {/* BOUNCIE TRUCK TRACKING */}
        {tab==="bouncie"&&(
          <div className="fade">
            <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:4}}>🛰️ Bouncie Truck Tracking</div>
            <div style={{fontSize:12,color:"#475569",marginBottom:14}}>Connect your Bouncie GPS trackers to see live truck locations, odometer, speed and status.</div>

            {/* API Key setup */}
            <div style={{...C.card,padding:"14px 16px",marginBottom:14,borderColor:"#1e3a5f"}}>
              <div style={{fontWeight:600,fontSize:13,color:"#60a5fa",marginBottom:8}}>🔑 Bouncie API Key</div>
              <div style={{fontSize:12,color:"#475569",marginBottom:8}}>Get your API key from <a href="https://www.bouncie.app/developer" target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>bouncie.app/developer</a> — it's free with your subscription.</div>
              <div style={{display:"flex",gap:8}}>
                <input value={bouncieKey} onChange={e=>setBouncieKey(e.target.value)} placeholder="Your Bouncie API key..." style={{...C.inp,flex:1,fontFamily:"monospace"}} type="password"/>
                <button className="btn" onClick={async()=>{
                  if(!bouncieKey){alert("Please enter your Bouncie API key.");return;}
                  localStorage.setItem("bouncie_key",bouncieKey);
                  setBouncieLoading(true);
                  try{
                    const res=await fetch("https://api.bouncie.dev/v1/vehicles",{headers:{"Authorization":bouncieKey,"Content-Type":"application/json"}});
                    if(!res.ok){alert("Invalid API key or connection failed. Check your key at bouncie.app/developer.");setBouncieLoading(false);return;}
                    const data=await res.json();
                    setBouncieVehicles(Array.isArray(data)?data:[]);
                    if(data.length===0)alert("Connected! No vehicles found. Make sure your Bouncie devices are active.");
                  }catch(err){alert("Connection failed: "+err.message);}
                  setBouncieLoading(false);
                }} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"9px 16px",fontSize:12,fontWeight:600,flexShrink:0}}>
                  {bouncieLoading?"⏳ Connecting...":"Connect"}
                </button>
              </div>
            </div>

            {bouncieVehicles.length===0&&!bouncieLoading&&bouncieKey&&(
              <div style={{...C.card,padding:36,textAlign:"center",color:"#475569"}}>
                <div style={{fontSize:32,marginBottom:8}}>🛰️</div>
                <div>Click Connect to load your vehicles.</div>
              </div>
            )}

            {bouncieVehicles.length>0&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:13,color:"#22c55e",fontWeight:600}}>{bouncieVehicles.length} vehicle{bouncieVehicles.length!==1?"s":""} connected</div>
                  <button className="btn" onClick={async()=>{
                    setBouncieLoading(true);
                    try{
                      const res=await fetch("https://api.bouncie.dev/v1/vehicles",{headers:{"Authorization":bouncieKey}});
                      const data=await res.json();
                      setBouncieVehicles(Array.isArray(data)?data:[]);
                    }catch(e){}
                    setBouncieLoading(false);
                  }} style={{background:"#1e2d3d",color:"#60a5fa",padding:"5px 12px",fontSize:11}}>🔄 Refresh</button>
                </div>
                {bouncieVehicles.map(v=>{
                  const loc=v.stats||{};
                  const isMoving=loc.isMoving||loc.speed>2;
                  const lat=loc.location?.lat||loc.lat;
                  const lng=loc.location?.lon||loc.lon||loc.lng;
                  return(
                    <div key={v.imei||v.id} style={{...C.card,padding:"14px 16px",marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,flexWrap:"wrap",gap:6}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>{v.nickname||v.name||v.licensePlate||"Truck"}</div>
                          <div style={{fontSize:11,color:"#475569",marginTop:2}}>{v.model||""} {v.year||""}</div>
                        </div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          <span style={{fontSize:11,background:isMoving?"#052e16":"#1e2d3d",color:isMoving?"#4ade80":"#475569",borderRadius:6,padding:"3px 9px",fontWeight:600}}>
                            {isMoving?"🟢 Moving":"⚫ Parked"}
                          </span>
                          {loc.speed>0&&<span style={{fontSize:11,background:"#0c2340",color:"#60a5fa",borderRadius:6,padding:"3px 9px"}}>{Math.round(loc.speed)} mph</span>}
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                        {loc.odometer&&<div style={{background:"#0a1628",borderRadius:6,padding:"8px 10px"}}>
                          <div style={{fontSize:10,color:"#475569",marginBottom:2}}>Odometer</div>
                          <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9"}}>{Math.round((loc.odometer||0)*0.621371).toLocaleString()} mi</div>
                        </div>}
                        {loc.batteryVoltage&&<div style={{background:"#0a1628",borderRadius:6,padding:"8px 10px"}}>
                          <div style={{fontSize:10,color:"#475569",marginBottom:2}}>Battery</div>
                          <div style={{fontWeight:600,fontSize:13,color:loc.batteryVoltage>12?"#22c55e":"#f59e0b"}}>{loc.batteryVoltage}V</div>
                        </div>}
                      </div>
                      {loc.address&&<div style={{fontSize:12,color:"#64748b",marginBottom:8}}>📍 {loc.address}</div>}
                      {lat&&lng&&(
                        <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer"
                          style={{display:"block",textAlign:"center",background:"#0c2340",color:"#60a5fa",padding:"8px",borderRadius:8,fontSize:12,fontWeight:600,textDecoration:"none"}}>
                          🗺️ Open in Google Maps
                        </a>
                      )}
                    </div>
                  );
                })}

                <div style={{...C.card,padding:"12px 16px",borderColor:"#1e3a5f",marginTop:4}}>
                  <div style={{fontSize:12,color:"#475569",marginBottom:6}}>💡 Bouncie Setup Tips:</div>
                  <div style={{fontSize:11,color:"#334155",lineHeight:1.7}}>
                    • Vehicles update every 60 seconds while moving<br/>
                    • API key is stored locally on this device only<br/>
                    • For live driver tracking, drivers can also enable GPS in their delivery view<br/>
                    • Bouncie supports geofence alerts — set up at bouncie.app
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TEMPLATES */}
        {tab==="basetasks"&&(
          <div className="fade">
            <div style={{marginBottom:10,fontSize:12,color:"#94a3b8"}}>These tasks appear automatically on every employee's list on the matching days.</div>
            {["en","es"].map(lang=>(
              <div key={lang} style={{marginBottom:22}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:".1em",color:"#475569",textTransform:"uppercase",marginBottom:8}}>{lang==="en"?"🇺🇸 English Templates":"🇲🇽 Spanish Templates (Ricky & Alberto)"}</div>
                <div style={{...C.card,overflow:"hidden",marginBottom:9}}>
                  {baseTasks[lang].map((task,i)=>(
                    <div key={task.id} style={{display:"flex",alignItems:"flex-start",gap:9,padding:"9px 13px",borderBottom:i<baseTasks[lang].length-1?"1px solid #0f1923":"none"}}>
                      <div style={{width:5,height:5,borderRadius:"50%",background:task.priority==="high"?"#ef4444":task.priority==="med"?"#f59e0b":"#475569",marginTop:5,flexShrink:0}}/>
                      <div style={{flex:1}}>
                        {editingBaseTask&&editingBaseTask.id===task.id&&editingBaseTask.lang===lang?(
                          <div style={{display:"flex",gap:6}}>
                            <input value={editBaseTaskVal} onChange={e=>setEditBaseTaskVal(e.target.value)} style={{flex:1,...C.inp,border:"1px solid #3b82f6"}}/>
                            <button className="btn" onClick={()=>{setBaseTasks(prev=>({...prev,[lang]:prev[lang].map(t=>t.id===task.id?{...t,text:editBaseTaskVal}:t)}));setEditingBaseTask(null);}} style={{background:"#1d4ed8",color:"#fff",padding:"4px 10px",fontSize:11}}>Save</button>
                            <button className="btn" onClick={()=>setEditingBaseTask(null)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"4px 8px",fontSize:11}}>✕</button>
                          </div>
                        ):(
                          <div style={{fontSize:11,color:"#e2e8f0"}}>{task.text}</div>
                        )}
                        <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
                          <span style={{fontSize:9,background:"#1e2d3d",color:"#94a3b8",borderRadius:3,padding:"1px 4px"}}>{task.category}</span>
                          {task.days.map(d=><span key={d} style={{fontSize:9,background:"#0c2340",color:"#60a5fa",borderRadius:3,padding:"1px 4px"}}>{d}</span>)}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:4,flexShrink:0}}>
                        <button className="btn" onClick={()=>{setEditingBaseTask({id:task.id,lang});setEditBaseTaskVal(task.text);}} style={{background:"#1e2d3d",color:"#60a5fa",padding:"3px 6px",fontSize:10}}>Edit</button>
                        <button className="btn" onClick={()=>setBaseTasks(prev=>({...prev,[lang]:prev[lang].filter(t=>t.id!==task.id)}))} style={{background:"#2d0a0a",color:"#f87171",padding:"3px 6px",fontSize:10}}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                <AddBaseTaskRow lang={lang} setBaseTasks={setBaseTasks}/>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
