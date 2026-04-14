import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nmlhuufmvvqvbyoebrwe.supabase.co";
const SUPABASE_KEY = "sb_publishable_TRQCQpgnv0NDRt7eIE6t-Q_fEINezez";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const ALL_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const ROLES = ["Driver","Helper","Driver/Helper","Coordinator","Loader","Manager","Warehouse","Other"];
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

const INITIAL_EMPLOYEES = [
  { id:0, name:"Conner",        role:"Manager",       avatar:"CO", lang:"en", workdays:["Mon","Tue","Wed","Thu","Fri","Sat"], is_manager:true,  pin:"0000" },
  { id:1, name:"Frank Solís",   role:"Driver",        avatar:"FS", lang:"en", workdays:["Mon","Tue","Wed","Fri"],             is_manager:false, pin:"1111" },
  { id:2, name:"Max Applegate", role:"Driver",        avatar:"MA", lang:"en", workdays:["Mon","Tue","Wed","Fri"],             is_manager:false, pin:"2222" },
  { id:3, name:"Chris Mullis",  role:"Driver",        avatar:"CM", lang:"en", workdays:["Mon","Tue","Wed","Fri"],             is_manager:false, pin:"3333" },
  { id:4, name:"Nate",          role:"Driver/Helper", avatar:"NA", lang:"en", workdays:["Fri","Sat"],                        is_manager:false, pin:"4444" },
  { id:5, name:"Ricky Torres",  role:"Helper",        avatar:"RT", lang:"es", workdays:["Mon","Tue","Wed","Fri"],             is_manager:false, pin:"5555" },
  { id:6, name:"Aariq Curtis",  role:"Helper",        avatar:"AC", lang:"en", workdays:["Mon","Tue","Wed","Fri"],             is_manager:false, pin:"6666" },
  { id:7, name:"Alberto",       role:"Helper",        avatar:"AL", lang:"es", workdays:["Fri","Sat"],                        is_manager:false, pin:"7777" },
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
    /* Manager: stack all multi-col grids to single col */
    .del-form-grid, .del-form-3, .new-emp-grid, .prob-grid { grid-template-columns:1fr!important }
    /* Manager: tasks sidebar goes horizontal scrollable row */
    .tasks-layout { grid-template-columns:1fr!important; display:flex!important; flex-direction:column!important }
    .tasks-sidebar { display:grid!important; grid-template-columns:repeat(4,1fr)!important; overflow-x:unset!important; gap:6px!important }
    .tasks-sidebar button { min-width:unset!important }
    /* Manager: task add form stacks */
    .task-add-grid { grid-template-columns:1fr 1fr!important }
    /* Manager: delivery card status buttons wrap */
    .status-col { flex-direction:row!important; flex-wrap:wrap!important; gap:5px!important }
    .status-col button { flex:1!important; min-width:80px!important }
    /* Manager: nav text smaller */
    .mgr-nav button { padding:10px 8px!important; font-size:11px!important }
    /* Manager: header compact */
    .mgr-header-date { display:none!important }
    /* General: full width inputs on mobile */
    .del-actions { flex-direction:column!important }
    /* Delivery card stacks on mobile */
    .del-card-inner { flex-direction:column!important }
    .del-status-btns { flex-direction:row!important; flex-wrap:wrap!important }
    .del-status-btns button { flex:1!important; min-width:80px!important }
  }
`;

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ employees, onLogin }) {
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const go = () => {
    const emp = employees.find(e=>e.id===sel);
    if (!emp) { setErr("Please select your name."); return; }
    if (emp.pin && pin !== emp.pin) { setErr("Wrong PIN. Try again."); setPin(""); return; }
    onLogin(emp);
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
          <button className="btn" onClick={go} style={{width:"100%",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:14,fontSize:15,fontWeight:700,borderRadius:10}}>
            Sign In →
          </button>
        </div>
        <div style={{textAlign:"center",marginTop:14,fontSize:10,color:"#334155"}}>
          PINs: Conner=0000 Frank=1111 Max=2222 Chris=3333 Nate=4444 Ricky=5555 Aariq=6666 Alberto=7777
        </div>
      </div>
    </div>
  );
}

// ─── DRIVER VIEW ──────────────────────────────────────────────────────────────
function DriverView({ user, deliveries, customTasks, baseTasks, messages, problems, employees, onStatusUpdate, onLogout, onSendMessage, onLogProblem, onSaveDelivery }) {
  const [tab, setTab] = useState("deliveries");
  const [openDel, setOpenDel] = useState(null);
  const [schedDay, setSchedDay] = useState(null);
  const [taskChecks, setTaskChecks] = useState({});
  const [addingDelivery, setAddingDelivery] = useState(false);
  const [newDel, setNewDel] = useState({id:"",customer:"",address:"",phone:"",items:[{qty:1,name:""}],delivery_window:"",assigned_to:user.id,status:"Scheduled",notes:"",floor:"1",elevator:false,removal_requested:false,transfer_scheduled:false,route_notes:"",stop_order:1,delivery_date:new Date().toISOString().split("T")[0],ticket_number:"",helper_id:0});
  const [prepDate, setPrepDate] = useState(()=>{ const t=new Date(); t.setDate(t.getDate()+1); return t.toISOString().split("T")[0]; });
  const [msgInput, setMsgInput] = useState("");
  const [probInput, setProbInput] = useState({ description:"", type:"customer" });
  const fileRef = React.useRef();
  const [uploadingFor, setUploadingFor] = useState(null);
  const isEs = user.lang === "es";
  const today = todayDayName();
  const isDriver = user.role.toLowerCase().includes("driver");
  const todayISOd = new Date().toISOString().split("T")[0];

  const myDeliveries = [...deliveries.filter(d=>d.assigned_to===user.id||d.helper_id===user.id)].sort((a,b)=>(a.stop_order||0)-(b.stop_order||0));
  const otherDeliveries = [...deliveries.filter(d=>d.assigned_to!==user.id&&d.helper_id!==user.id&&(d.delivery_date||todayISOd)===todayISOd)].sort((a,b)=>(a.stop_order||0)-(b.stop_order||0));

  const myTasks = [
    ...(isEs ? baseTasks.es : baseTasks.en).filter(t=>t.days.includes(today)||t.days.includes("All")),
    ...(customTasks[user.id]||[]).filter(t=>t.day===today||t.day==="All"),
  ];
  const cats = [...new Set(myTasks.map(t=>t.category))];

  const sendMsg = async (deliveryId) => {
    if (!msgInput.trim()) return;
    const msg = { id:Date.now(), sender_id:user.id, sender_name:user.name, text:msgInput.trim(), delivery_id:deliveryId||null, photo_url:null, created_at:new Date().toISOString() };
    try { await sb.from("messages").insert(msg); } catch(e) {}
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
    const p = { id:Date.now(), emp_name:user.name, description:probInput.description, type:probInput.type, escalation_step:0, time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}), resolved:false };
    try { await sb.from("problems").insert(p); } catch(e) {}
    onLogProblem(p);
    setProbInput({ description:"", type:"customer" });
  };

  const cardStyle = {background:"#0f1923",border:"1px solid #1e2d3d",borderRadius:12};
  const inputStyle = {background:"#0a1628",border:"1px solid #1e2d3d",borderRadius:8,padding:"10px 14px",fontSize:14,color:"#e2e8f0",width:"100%",fontFamily:"inherit"};

  const renderDeliveryCard = (d, isMine) => {
    const sc=STATUS_COLORS[d.status]||STATUS_COLORS["Scheduled"];
    const isOpen=openDel===d.id;
    const dMsgs=messages.filter(m=>m.delivery_id===d.id);
    const helperEmp=employees.find(e=>e.id===d.helper_id);
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
            <div key={i} style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
              <span style={{background:"#1e2d3d",color:"#60a5fa",borderRadius:5,padding:"1px 7px",fontSize:12,fontWeight:700}}>{item.qty}x</span>
              <span style={{fontSize:13,color:"#e2e8f0"}}>{item.name}</span>
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
            <div style={{padding:"12px 16px",borderBottom:"1px solid #131f2e"}}>
              <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>{isEs?"Actualizar Estado":"Update Status"}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7}}>
                {Object.keys(STATUS_COLORS).map(s=>(
                  <button key={s} className="btn" onClick={()=>onStatusUpdate(d.id,s)}
                    style={{background:d.status===s?STATUS_COLORS[s].bg:"#0a1628",color:d.status===s?STATUS_COLORS[s].text:"#475569",border:`1px solid ${d.status===s?STATUS_COLORS[s].dot:"#1e2d3d"}`,padding:"9px 4px",fontSize:11}}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
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
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{background:"#080d14",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'DM Sans',sans-serif",maxWidth:640,margin:"0 auto"}}>
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
          {key:"problems",label:isEs?"Problemas":"Problems",icon:"⚠️"},
          {key:"dashboard",label:isEs?"Inicio":"Dashboard",icon:"⬛"},
          {key:"inventory",label:isEs?"Inventario":"Inventory",icon:"📦"},
          {key:"schedule",label:isEs?"Horario":"Schedule",icon:"📅"},
          {key:"prep",label:isEs?"Prep":"Prep",icon:"📋"},
          {key:"inspection",label:isEs?"Inspección":"Inspect",icon:"🔍"},
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
            {myDeliveries.length>0&&<div style={{fontSize:11,color:"#22c55e",fontWeight:700,letterSpacing:".07em",textTransform:"uppercase",marginBottom:8}}>✅ {isEs?"Mis Entregas":"My Deliveries"} ({myDeliveries.length})</div>}
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

        {tab==="problems"&&(
          <div>
            <div style={{...cardStyle,padding:14,marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:14,color:"#f87171",marginBottom:12}}>⚠️ {isEs?"Reportar un Problema":"Report a Problem"}</div>
              <select value={probInput.type} onChange={e=>setProbInput(p=>({...p,type:e.target.value}))} style={{...inputStyle,marginBottom:10}}>
                <option value="customer">{isEs?"Problema con Cliente":"Customer Issue"}</option>
                <option value="product">{isEs?"Problema con Producto":"Product / Vendor"}</option>
              </select>
              <textarea value={probInput.description} onChange={e=>setProbInput(p=>({...p,description:e.target.value}))}
                placeholder={isEs?"Describe el problema...":"Describe the problem..."} rows={4} style={{...inputStyle,resize:"vertical",marginBottom:10}}/>
              <button className="btn" onClick={logProb} style={{width:"100%",background:"linear-gradient(135deg,#dc2626,#b91c1c)",color:"#fff",padding:13,fontSize:14,fontWeight:700}}>
                ⚠️ {isEs?"Reportar":"Report Problem"}
              </button>
            </div>
            {problems.filter(p=>p.emp_name===user.name).map(p=>(
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
            <div style={{...cardStyle,padding:14}}>
              <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9",marginBottom:8}}>🔍 {isEs?"Inspección del Camión":"Truck Inspection"}</div>
              <div style={{fontSize:12,color:"#94a3b8",marginBottom:12}}>{isEs?"Sube fotos de la inspección previa al viaje.":"Upload photos of your pre-trip inspection."}</div>
              <DriverInspectionUpload user={user} onUploaded={()=>{}} isEs={isEs}/>
            </div>
          </div>
        )}

      </div>
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

// ─── ADD BASE TASK ROW ────────────────────────────────────────────────────────
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
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [selectedDay, setSelectedDay] = useState(todayDayName());
  const [employees, setEmployees] = useState(INITIAL_EMPLOYEES);
  const [deliveries, setDeliveries] = useState([]);
  const [customTasks, setCustomTasks] = useState({});
  const [baseTasks, setBaseTasks] = useState({ en: BASE_TASKS_EN, es: BASE_TASKS_ES });
  const [notes, setNotes] = useState({});
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
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvDone, setCsvDone] = useState(false);
  const [mgrPrepDate, setMgrPrepDate] = useState(()=>{ const t=new Date(); t.setDate(t.getDate()+1); return t.toISOString().split("T")[0]; });
  const [todayDate] = useState(new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}));
  const [dateFilter, setDateFilter] = useState("today");
  const [inspections, setInspections] = useState([]);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");

  const todayStr = new Date().toISOString().split("T")[0]; const EMPTY_DEL = { id:"", customer:"", address:"", phone:"", items:[{qty:1,name:""}], delivery_window:"", assigned_to:1, status:"Scheduled", notes:"", floor:"1", elevator:false, removal_requested:false, transfer_scheduled:false, route_notes:"", stop_order:deliveries.length+1, delivery_date:todayStr, ticket_number:"", helper_id:0 };

  // Load data
  useEffect(()=>{
    async function load() {
      setLoading(true);
      try {
        const [eR,dR,ctR,nR,pR,mR] = await Promise.all([
          sb.from("employees").select("*"),
          sb.from("deliveries").select("*"),
          sb.from("custom_tasks").select("*"),
          sb.from("notes").select("*"),
          sb.from("problems").select("*"),
          sb.from("messages").select("*").order("created_at",{ascending:true}),
        ]);
        if (eR.data&&eR.data.length>0) setEmployees(eR.data);
        else { await sb.from("employees").upsert(INITIAL_EMPLOYEES); }
        if (dR.data) setDeliveries(dR.data);
        if (ctR.data) { const g={}; ctR.data.forEach(t=>{if(!g[t.emp_id])g[t.emp_id]=[];g[t.emp_id].push(t);}); setCustomTasks(g); }
        if (nR.data) { const g={}; nR.data.forEach(n=>{if(!g[n.emp_id])g[n.emp_id]=[];g[n.emp_id].push(n);}); setNotes(g); }
        if (pR.data) setProblems(pR.data);
        if (mR.data) setMessages(mR.data);
      } catch(e) { console.error(e); }
      setLoading(false);
    }
    load();
    const ds = sb.channel("d-ch").on("postgres_changes",{event:"*",schema:"public",table:"deliveries"},()=>{sb.from("deliveries").select("*").then(({data})=>{if(data)setDeliveries(data);});}).subscribe();
    const ms = sb.channel("m-ch").on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},(p)=>{setMessages(prev=>[...prev,p.new]);}).subscribe();
    const ps = sb.channel("p-ch").on("postgres_changes",{event:"*",schema:"public",table:"problems"},()=>{sb.from("problems").select("*").then(({data})=>{if(data)setProblems(data);});}).subscribe();
    return ()=>{sb.removeChannel(ds);sb.removeChannel(ms);sb.removeChannel(ps);};
  },[]);

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
    const today = new Date().toISOString().split('T')[0]; const row = { customer:d.customer,address:d.address,phone:d.phone,items:d.items||[],delivery_window:d.delivery_window||"",assigned_to:Number(d.assigned_to)||1,status:d.status,notes:d.notes||"",floor:d.floor||"1",elevator:!!d.elevator,removal_requested:!!d.removal_requested,transfer_scheduled:!!d.transfer_scheduled,route_notes:d.route_notes||"",stop_order:Number(d.stop_order)||1,delivery_date:d.delivery_date||today,ticket_number:d.ticket_number||"",helper_id:Number(d.helper_id)||0 };
    if (!d.id) {
      const nid = `D-${String(deliveries.length+1).padStart(3,"0")}-${Date.now()}`;
      const {data} = await sb.from("deliveries").insert({...row,id:nid}).select();
      if (data) setDeliveries(prev=>[...prev,...data]);
    } else {
      await sb.from("deliveries").update(row).eq("id",d.id);
      setDeliveries(prev=>prev.map(x=>x.id===d.id?{...row,id:d.id}:x));
    }
    setSyncing(false);
    setEditingDelivery(null);
  };

  const delDelivery = async (id) => { await sb.from("deliveries").delete().eq("id",id); setDeliveries(prev=>prev.filter(d=>d.id!==id)); };
  const updStatus = async (id,status) => { await sb.from("deliveries").update({status}).eq("id",id); setDeliveries(prev=>prev.map(d=>d.id===id?{...d,status}:d)); };

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
      const r = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:160,messages:[{role:"user",content:`Write a friendly SMS under 160 chars for America's Mattress. No payment info. Customer: ${d.customer}, Items: ${items}, Window: ${d.delivery_window}, Status: ${d.status}. Return ONLY the SMS text.`}]})});
      const data = await r.json();
      setCustomerMsg(prev=>({...prev,[d.id]:data.content.map(b=>b.text||"").join("").trim()}));
    } catch {
      setCustomerMsg(prev=>({...prev,[d.id]:`Hi ${d.customer.split(" ")[0]}! Your delivery is set for ${d.delivery_window}. We'll call 30 min before arrival! – America's Mattress`}));
    }
    setSendingMsg(null);
    setMsgSent(prev=>({...prev,[d.id]:true}));
    setTimeout(()=>setMsgSent(prev=>({...prev,[d.id]:false})),3000);
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

  if (loading) return (
    <div style={{background:"#080d14",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:14,fontFamily:"'DM Sans',sans-serif"}}>
      <style>{GLOBAL_STYLES}</style>
      <div style={{fontSize:48}}>🛏</div>
      <div style={{color:"#60a5fa",fontSize:16}}>Loading America's Mattress...</div>
    </div>
  );

  if (!currentUser) return <LoginScreen employees={employees} onLogin={setCurrentUser}/>;

  if (!currentUser.is_manager&&!currentUser.isManager) return (
    <DriverView
      user={currentUser} deliveries={deliveries} customTasks={customTasks} baseTasks={baseTasks}
      messages={messages} problems={problems} employees={employees}
      onStatusUpdate={updStatus} onLogout={()=>setCurrentUser(null)}
      onSendMessage={(m)=>setMessages(prev=>[...prev,m])}
      onLogProblem={(p)=>setProblems(prev=>[...prev,p])}
      onSaveDelivery={saveDelivery}
    />
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

      {/* Header */}
      <div style={{background:"#0a1628",borderBottom:"1px solid #1e2d3d"}}>
        <div style={{maxWidth:1180,margin:"0 auto",padding:"0 16px",display:"flex",alignItems:"center",justifyContent:"space-between",height:58}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,background:"linear-gradient(135deg,#2563eb,#1d4ed8)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🛏</div>
            <div>
              <div style={{fontWeight:800,fontSize:14,color:"#f1f5f9"}}>America's Mattress</div>
              <div style={{fontSize:10,color:"#475569",fontFamily:"'DM Mono',monospace"}}>{syncing?"● Saving...":"● Live"} · {todayDate}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#4f46e5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#fff"}}>CO</div>
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
              <button className="btn" onClick={()=>setEditingDelivery({id:"",customer:"",address:"",phone:"",items:[{qty:1,name:""}],delivery_window:"",assigned_to:1,status:"Scheduled",notes:"",floor:"1",elevator:false,removal_requested:false,transfer_scheduled:false,route_notes:"",stop_order:deliveries.length+1,delivery_date:new Date().toISOString().split("T")[0],ticket_number:"",helper_id:0})} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"7px 15px",fontSize:13}}>➕ Add Delivery</button>
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
                    <div key={idx} style={{display:"flex",gap:6,marginBottom:6}}>
                      <input type="number" min="1" value={item.qty} onChange={e=>{const items=[...(editingDelivery.items||[])];items[idx]={...items[idx],qty:Number(e.target.value)};setEditingDelivery(p=>({...p,items}));}} style={{...C.inp,width:60,textAlign:"center"}}/>
                      <input value={item.name} onChange={e=>{const items=[...(editingDelivery.items||[])];items[idx]={...items[idx],name:e.target.value};setEditingDelivery(p=>({...p,items}));}} placeholder="Item name" style={{...C.inp,flex:1}}/>
                      {(editingDelivery.items||[]).length>1&&<button className="btn" onClick={()=>setEditingDelivery(p=>({...p,items:p.items.filter((_,i)=>i!==idx)}))} style={{background:"#2d0a0a",color:"#f87171",padding:"7px 9px",fontSize:12}}>✕</button>}
                    </div>
                  ))}
                  <button className="btn" onClick={()=>setEditingDelivery(p=>({...p,items:[...(p.items||[]),{qty:1,name:""}]}))} style={{background:"#1e2d3d",color:"#60a5fa",padding:"5px 11px",fontSize:11}}>➕ Add Item</button>
                </div>
                <div className="del-form-3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:9,marginBottom:9}}>
                  <div><div style={{fontSize:10,color:"#475569",marginBottom:3}}>Driver</div><select value={editingDelivery.assigned_to||1} onChange={e=>setEditingDelivery(p=>({...p,assigned_to:Number(e.target.value)}))} style={C.sel}>{employees.filter(e=>!e.is_manager).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                  <div><div style={{fontSize:10,color:"#475569",marginBottom:3}}>Helper (optional)</div><select value={editingDelivery.helper_id||0} onChange={e=>setEditingDelivery(p=>({...p,helper_id:Number(e.target.value)}))} style={C.sel}><option value={0}>None</option>{employees.filter(e=>!e.is_manager).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
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

        {/* PROBLEMS */}
        {tab==="problems"&&(
          <div className="fade">
            <div style={{...C.card,padding:"15px 16px",marginBottom:14}}>
              <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9",marginBottom:12}}>⚠️ Log a Problem</div>
              <div className="del-form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:9}}>
                <div><div style={{fontSize:10,color:"#475569",marginBottom:3}}>Employee</div><select value={problemInput.empId} onChange={e=>setProblemInput(p=>({...p,empId:e.target.value}))} style={C.sel}><option value="">Select...</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                <div><div style={{fontSize:10,color:"#475569",marginBottom:3}}>Type</div><select value={problemInput.type} onChange={e=>setProblemInput(p=>({...p,type:e.target.value}))} style={C.sel}><option value="customer">Customer Issue</option><option value="product">Product / Vendor</option></select></div>
              </div>
              <textarea value={problemInput.description} onChange={e=>setProblemInput(p=>({...p,description:e.target.value}))} placeholder="Describe the problem..." rows={3} style={{...C.inp,resize:"vertical",marginBottom:9}}/>
              <button className="btn" onClick={logProblem} style={{background:"linear-gradient(135deg,#dc2626,#b91c1c)",color:"#fff",padding:"8px 17px",fontSize:13}}>⚠️ Log Problem</button>
            </div>
            <div className="prob-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              {Object.entries(ESCALATION).map(([type,chain])=>(
                <div key={type} style={{...C.card,padding:"13px 15px"}}>
                  <div style={{fontWeight:600,fontSize:12,color:"#f1f5f9",marginBottom:9}}>{type==="customer"?"👤 Customer Chain":"📦 Vendor Chain"}</div>
                  {chain.map((step,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:i<chain.length-1?7:0}}>
                      <div style={{width:20,height:20,borderRadius:"50%",background:i===0?"#1e2d3d":i===1?"#2d1a5e":"#052e16",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:i===0?"#94a3b8":i===1?"#a78bfa":"#4ade80",flexShrink:0}}>{i+1}</div>
                      <div style={{fontSize:12,color:i===1?"#a78bfa":"#e2e8f0"}}>{step}</div>
                      {i<chain.length-1&&<div style={{marginLeft:"auto",color:"#334155",fontSize:11}}>→</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {problems.length===0?(
              <div style={{...C.card,padding:36,textAlign:"center",color:"#475569"}}><div style={{fontSize:28,marginBottom:7}}>✅</div><div>No problems logged.</div></div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {problems.map(p=>{
                  const chain=ESCALATION[p.type];
                  const nextLevel=chain[(p.escalation_step||0)+1];
                  return(
                    <div key={p.id} style={{...C.card,padding:"13px 15px",borderColor:p.resolved?"#1e3a20":"#3d1515"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,flexWrap:"wrap",gap:7}}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                            <span style={{fontWeight:700,fontSize:13,color:"#f1f5f9"}}>{p.emp_name}</span>
                            <span className="badge" style={{background:p.type==="customer"?"#0c2340":"#1a0a2e",color:p.type==="customer"?"#60a5fa":"#c084fc"}}>{p.type==="customer"?"👤":"📦"}</span>
                            {p.resolved&&<span className="badge" style={{background:"#052e16",color:"#4ade80"}}>✅ Resolved</span>}
                          </div>
                          <div style={{fontSize:12,color:"#cbd5e1"}}>{p.description}</div>
                          <div style={{fontSize:10,color:"#475569",marginTop:3}}>{p.time}</div>
                        </div>
                        {!p.resolved&&nextLevel&&<button className="btn" onClick={()=>escalate(p.id)} style={{background:"linear-gradient(135deg,#d97706,#b45309)",color:"#fff",padding:"5px 11px",fontSize:11}}>↑ Escalate to {nextLevel}</button>}
                      </div>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        {chain.map((step,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:4,background:i<=(p.escalation_step||0)?(i===(p.escalation_step||0)?"#0c2340":"#052e16"):"#0a1628",borderRadius:5,padding:"3px 8px",border:`1px solid ${i===(p.escalation_step||0)?"#3b82f6":"#1e2d3d"}`}}>
                            <span style={{width:5,height:5,borderRadius:"50%",background:i<(p.escalation_step||0)?"#22c55e":i===(p.escalation_step||0)?"#3b82f6":"#334155"}}/>
                            <span style={{fontSize:10,color:i<=(p.escalation_step||0)?"#e2e8f0":"#475569"}}>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
                        <div style={{fontSize:10,color:"#475569",marginBottom:5}}>PIN</div>
                        <input value={editEmpVals.pin!==undefined?editEmpVals.pin:emp.pin||""} onChange={e=>setEditEmpVals(p=>({...p,pin:e.target.value}))} maxLength={6} placeholder="4 digits" style={{...C.inp,width:100}}/>
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
                          const updates={role:editEmpVals.role||emp.role,lang:editEmpVals.lang||emp.lang,pin:editEmpVals.pin!==undefined?editEmpVals.pin:emp.pin,workdays:editEmpVals.workdays||emp.workdays};
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
                        <div style={{fontSize:11,color:"#64748b",marginTop:1}}>{emp.role} · PIN: {emp.pin||"—"}</div>
                        <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
                          {(emp.workdays||[]).map(d=><span key={d} style={{fontSize:9,background:"#0c2340",color:"#60a5fa",borderRadius:4,padding:"1px 5px",fontWeight:600}}>{d}</span>)}
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
                        {!emp.is_manager&&(
                          <button className="btn" onClick={()=>{setEditingEmp(emp.id);setEditEmpVals({});}} style={{background:"#1e2d3d",color:"#60a5fa",padding:"4px 9px",fontSize:11}}>✏️ Edit</button>
                        )}
                        {!emp.is_manager?(
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
                          <span style={{fontSize:10,color:"#7c3aed",background:"#1e1038",borderRadius:5,padding:"4px 7px",fontWeight:600}}>Owner</span>
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
                    {ins.photo_url&&<img src={ins.photo_url} alt="inspection" style={{width:"100%",borderRadius:8,maxHeight:280,objectFit:"cover"}}/>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MANAGER SCHEDULE */}
        {tab==="mgr-schedule"&&(
          <div className="fade">
            <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:12}}>📅 Weekly Team Schedule</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=>(
                <button key={d} className="btn" onClick={()=>setMgrSchedDay(mgrSchedDay===d?null:d)}
                  style={{padding:"7px 14px",fontSize:12,fontWeight:600,background:mgrSchedDay===d?"linear-gradient(135deg,#2563eb,#1d4ed8)":"#1e2d3d",color:mgrSchedDay===d?"#fff":"#94a3b8",border:`1px solid ${mgrSchedDay===d?"#3b82f6":"#1e2d3d"}`}}>
                  {d}
                </button>
              ))}
              {mgrSchedDay&&<button className="btn" onClick={()=>setMgrSchedDay(null)} style={{padding:"7px 12px",fontSize:11,background:"#1e2d3d",color:"#64748b"}}>Show All</button>}
            </div>
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].filter(d=>!mgrSchedDay||d===mgrSchedDay).map(day=>{
              const dayFull={Mon:"Monday",Tue:"Tuesday",Wed:"Wednesday",Thu:"Thursday",Fri:"Friday",Sat:"Saturday",Sun:"Sunday"};
              const working=employees.filter(e=>e.is_manager||(e.workdays||[]).includes(day));
              const off=employees.filter(e=>!e.is_manager&&!(e.workdays||[]).includes(day));
              const dayDels=deliveries.filter(d=>{
                const iso=d.delivery_date;
                if(!iso) return false;
                const dow=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(iso+"T12:00:00").getDay()];
                return dow===day;
              });
              return(
                <div key={day} style={{...C.card,marginBottom:10,overflow:"hidden"}}>
                  <div style={{padding:"10px 16px",background:"#0a1628",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>{dayFull[day]}</div>
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
        )}

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

        {/* CSV IMPORT */}
        {tab==="import"&&(
          <div className="fade">
            <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:4}}>📥 Import Deliveries from CSV</div>
            <div style={{fontSize:12,color:"#475569",marginBottom:16}}>Export your delivery list from EZ Process Pro as a CSV, then paste it here or upload the file.</div>

            {/* Format guide */}
            <div style={{...C.card,padding:"14px 16px",marginBottom:16,borderColor:"#1e3a5f"}}>
              <div style={{fontWeight:600,fontSize:12,color:"#60a5fa",marginBottom:8}}>📋 Expected CSV Format</div>
              <div style={{fontFamily:"monospace",fontSize:11,color:"#94a3b8",background:"#0a1628",borderRadius:8,padding:"10px 12px",lineHeight:1.8}}>
                ticket,customer,address,phone,items,window,driver,date<br/>
                1042,John Smith,123 Main St,505-555-0100,"Queen Mattress x1",9AM-11AM,Frank,2026-04-18<br/>
                1043,Maria Lopez,456 Oak Ave,505-555-0200,"King Mattress x1, Bed Frame x1",1PM-3PM,Max,2026-04-18
              </div>
              <div style={{fontSize:11,color:"#475569",marginTop:8}}>
                Columns: ticket, customer, address, phone, items, window, driver, date — order matters. Items format: "Name x Qty" separated by commas.
              </div>
            </div>

            {/* File upload */}
            <div style={{...C.card,padding:"14px 16px",marginBottom:14}}>
              <div style={{fontWeight:600,fontSize:12,color:"#f1f5f9",marginBottom:10}}>Upload CSV File</div>
              <input type="file" accept=".csv,.txt" onChange={e=>{
                const file=e.target.files[0];
                if(!file) return;
                const reader=new FileReader();
                reader.onload=ev=>{
                  const text=ev.target.result;
                  setCsvText(text);
                  // Parse preview
                  const lines=text.trim().split("\n").filter(l=>l.trim());
                  const dataLines=lines[0].toLowerCase().includes("customer")||lines[0].toLowerCase().includes("ticket")?lines.slice(1):lines;
                  const parsed=dataLines.map(line=>{
                    const cols=line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)||[];
                    const clean=cols.map(c=>c.replace(/^"|"$/g,"").trim());
                    return {
                      ticket_number:clean[0]||"",
                      customer:clean[1]||"",
                      address:clean[2]||"",
                      phone:clean[3]||"",
                      rawItems:clean[4]||"",
                      delivery_window:clean[5]||"",
                      driverName:clean[6]||"",
                      delivery_date:clean[7]||new Date().toISOString().split("T")[0],
                    };
                  }).filter(r=>r.customer);
                  setCsvPreview(parsed);
                };
                reader.readAsText(file);
              }} style={{...C.inp,padding:"8px"}}/>
            </div>

            {/* Manual paste */}
            <div style={{...C.card,padding:"14px 16px",marginBottom:14}}>
              <div style={{fontWeight:600,fontSize:12,color:"#f1f5f9",marginBottom:8}}>Or Paste CSV Text</div>
              <textarea value={csvText} onChange={e=>{
                setCsvText(e.target.value);
                const lines=e.target.value.trim().split("\n").filter(l=>l.trim());
                const dataLines=lines[0]&&(lines[0].toLowerCase().includes("customer")||lines[0].toLowerCase().includes("ticket"))?lines.slice(1):lines;
                const parsed=dataLines.map(line=>{
                  const cols=line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)||[];
                  const clean=cols.map(c=>c.replace(/^"|"$/g,"").trim());
                  return {
                    ticket_number:clean[0]||"",
                    customer:clean[1]||"",
                    address:clean[2]||"",
                    phone:clean[3]||"",
                    rawItems:clean[4]||"",
                    delivery_window:clean[5]||"",
                    driverName:clean[6]||"",
                    delivery_date:clean[7]||new Date().toISOString().split("T")[0],
                  };
                }).filter(r=>r.customer);
                setCsvPreview(parsed);
              }} placeholder="Paste your CSV data here..." rows={6} style={{...C.inp,resize:"vertical",fontFamily:"monospace",fontSize:12}}/>
            </div>

            {/* Preview */}
            {csvPreview.length>0&&(
              <div style={{...C.card,overflow:"hidden",marginBottom:14}}>
                <div style={{padding:"10px 16px",background:"#0a1628",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#f1f5f9"}}>Preview — {csvPreview.length} deliveries found</div>
                  <button className="btn" onClick={()=>{setCsvPreview([]);setCsvText("");}} style={{background:"#1e2d3d",color:"#64748b",padding:"4px 10px",fontSize:11}}>Clear</button>
                </div>
                {csvPreview.map((row,i)=>{
                  const matchedDriver=employees.find(e=>e.name.toLowerCase().includes((row.driverName||"").toLowerCase())&&!e.is_manager);
                  // Parse items: "Queen Mattress x1, King x2" or "Queen Mattress x1"
                  const parsedItems=(row.rawItems||"").split(",").map(it=>{
                    it=it.trim();
                    const xMatch=it.match(/^(.*?)\s*[xX](\d+)$/);
                    if(xMatch) return {qty:Number(xMatch[2]),name:xMatch[1].trim()};
                    const numMatch=it.match(/^(\d+)\s*[xX]\s*(.+)$/);
                    if(numMatch) return {qty:Number(numMatch[1]),name:numMatch[2].trim()};
                    return {qty:1,name:it};
                  }).filter(it=>it.name);
                  return(
                    <div key={i} style={{padding:"10px 16px",borderTop:i>0?"1px solid #131f2e":"none",display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-start"}}>
                      <div style={{flex:1,minWidth:140}}>
                        {row.ticket_number&&<span style={{fontSize:10,background:"#1e3a5f",color:"#60a5fa",borderRadius:4,padding:"1px 6px",marginRight:6}}>#{row.ticket_number}</span>}
                        <span style={{fontWeight:600,fontSize:13,color:"#f1f5f9"}}>{row.customer}</span>
                        <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{row.address} · {row.phone}</div>
                        <div style={{display:"flex",gap:5,marginTop:4,flexWrap:"wrap"}}>
                          {parsedItems.map((item,ii)=>(
                            <span key={ii} style={{fontSize:11,background:"#1e2d3d",color:"#94a3b8",borderRadius:5,padding:"2px 7px"}}>{item.qty}x {item.name}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{fontSize:11,color:"#a78bfa"}}>{row.delivery_window}</div>
                      <div style={{fontSize:11,color:matchedDriver?"#22c55e":"#f87171"}}>{matchedDriver?matchedDriver.name:(row.driverName||"⚠️ No match")}</div>
                      <div style={{fontSize:11,color:"#475569"}}>{row.delivery_date}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {csvPreview.length>0&&(
              <button className="btn" disabled={csvImporting||csvDone} onClick={async()=>{
                setCsvImporting(true);
                let stop=deliveries.length+1;
                for(const row of csvPreview){
                  const matchedDriver=employees.find(e=>e.name.toLowerCase().includes((row.driverName||"").toLowerCase())&&!e.is_manager);
                  const parsedItems=(row.rawItems||"").split(",").map(it=>{
                    it=it.trim();
                    const xMatch=it.match(/^(.*?)\s*[xX](\d+)$/);
                    if(xMatch) return {qty:Number(xMatch[2]),name:xMatch[1].trim()};
                    const numMatch=it.match(/^(\d+)\s*[xX]\s*(.+)$/);
                    if(numMatch) return {qty:Number(numMatch[1]),name:numMatch[2].trim()};
                    return {qty:1,name:it};
                  }).filter(it=>it.name);
                  const nid=`D-${String(stop).padStart(3,"0")}-${Date.now()}`;
                  const newRow={
                    id:nid, customer:row.customer, address:row.address, phone:row.phone,
                    items:parsedItems.length>0?parsedItems:[{qty:1,name:"See notes"}],
                    delivery_window:row.delivery_window, assigned_to:matchedDriver?.id||1,
                    status:"Scheduled", notes:"", floor:"1", elevator:false,
                    removal_requested:false, transfer_scheduled:false, route_notes:"",
                    stop_order:stop, delivery_date:row.delivery_date,
                    ticket_number:row.ticket_number, helper_id:0,
                  };
                  await sb.from("deliveries").insert(newRow);
                  setDeliveries(prev=>[...prev,newRow]);
                  stop++;
                }
                setCsvImporting(false);
                setCsvDone(true);
                setCsvPreview([]);
                setCsvText("");
                setTimeout(()=>setCsvDone(false),4000);
              }} style={{width:"100%",background:csvDone?"linear-gradient(135deg,#059669,#047857)":csvImporting?"#1e2d3d":"linear-gradient(135deg,#2563eb,#1d4ed8)",color:csvImporting?"#475569":"#fff",padding:"13px",fontSize:14,fontWeight:700}}>
                {csvDone?"✅ Imported Successfully!":csvImporting?`⏳ Importing ${csvPreview.length} deliveries...`:`📥 Import ${csvPreview.length} Deliveries`}
              </button>
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
