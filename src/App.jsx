import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://nmlhuufmvvqvbyoebrwe.supabase.co";
const SUPABASE_KEY = "sb_publishable_TRQCQpgnv0NDRt7eIE6t-Q_fEINezez";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const INITIAL_EMPLOYEES = [
  { id: 0, name: "Conner",        role: "Manager",       avatar: "CO", lang: "en", workdays: ["Mon","Tue","Wed","Thu","Fri","Sat"], is_manager: true },
  { id: 1, name: "Frank Solís",   role: "Driver",        avatar: "FS", lang: "en", workdays: ["Mon","Tue","Wed","Fri"] },
  { id: 2, name: "Max Applegate", role: "Driver",        avatar: "MA", lang: "en", workdays: ["Mon","Tue","Wed","Fri"] },
  { id: 3, name: "Chris Mullis",  role: "Driver",        avatar: "CM", lang: "en", workdays: ["Mon","Tue","Wed","Fri"] },
  { id: 4, name: "Nate",          role: "Driver/Helper", avatar: "NA", lang: "en", workdays: ["Fri","Sat"] },
  { id: 5, name: "Ricky Torres",  role: "Helper",        avatar: "RT", lang: "es", workdays: ["Mon","Tue","Wed","Fri"] },
  { id: 6, name: "Aariq Curtis",  role: "Helper",        avatar: "AC", lang: "en", workdays: ["Mon","Tue","Wed","Fri"] },
  { id: 7, name: "Alberto",       role: "Helper",        avatar: "AL", lang: "es", workdays: ["Fri","Sat"] },
];

const ALL_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const BASE_TASKS_EN = [
  { id:"b1",  text:"Pre-trip truck inspection — tires, fluids, straps", priority:"high", category:"Prep", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b2",  text:"Load truck per manifest — verify item count and stop sequence", priority:"high", category:"Prep", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b3",  text:"Call each customer 30 min before arrival", priority:"high", category:"Delivery", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b4",  text:"Photograph each item before loading and after placement in home", priority:"med", category:"Delivery", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b5",  text:"Collect old mattress for disposal on all removal orders", priority:"high", category:"Delivery", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b6",  text:"Obtain customer signature on every delivery", priority:"high", category:"Delivery", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b7",  text:"Log each delivery complete in app within 5 min", priority:"med", category:"Admin", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b8",  text:"Report any delivery issues to Conner same day", priority:"high", category:"Admin", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b9",  text:"Sweep truck bed and return straps and blankets to warehouse", priority:"med", category:"EOD", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b10", text:"Organize warehouse floor and put all beds away in correct locations", priority:"high", category:"Warehouse", days:["Fri"] },
  { id:"b11", text:"Update master inventory list with all received and delivered items", priority:"high", category:"Admin", days:["Fri"] },
  { id:"b12", text:"Cardboard run — break down and dispose of all cardboard and packaging", priority:"high", category:"Warehouse", days:["Fri"] },
  { id:"b13", text:"Prepare warehouse for Thursday receiving — clear floor space and label zones", priority:"high", category:"Warehouse", days:["Wed"] },
  { id:"b14", text:"Receive vendor truck — check every item against manifest", priority:"high", category:"Receiving", days:["Thu"] },
  { id:"b15", text:"Photograph any damaged items immediately upon discovery", priority:"high", category:"Receiving", days:["Thu"] },
  { id:"b16", text:"Organize and label all received product by SKU/category", priority:"high", category:"Warehouse", days:["Thu"] },
  { id:"b17", text:"Update inventory after receiving is complete", priority:"high", category:"Admin", days:["Thu"] },
  { id:"b18", text:"Dispose of all Thursday receiving packaging same day", priority:"med", category:"Warehouse", days:["Thu"] },
];

const BASE_TASKS_ES = [
  { id:"b1",  text:"Inspección previa del camión — llantas, fluidos, correas", priority:"high", category:"Preparación", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b2",  text:"Cargar el camión según el manifiesto — verificar cantidad y secuencia", priority:"high", category:"Preparación", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b3",  text:"Llamar a cada cliente 30 min antes de llegar", priority:"high", category:"Entrega", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b4",  text:"Fotografiar cada artículo antes de cargar y después de colocar en el hogar", priority:"med", category:"Entrega", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b5",  text:"Recoger colchón viejo en pedidos con retiro solicitado", priority:"high", category:"Entrega", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b6",  text:"Obtener firma del cliente en cada entrega", priority:"high", category:"Entrega", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b7",  text:"Registrar entrega en la aplicación dentro de 5 minutos", priority:"med", category:"Admin", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b8",  text:"Reportar cualquier problema de entrega a Conner el mismo día", priority:"high", category:"Admin", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b9",  text:"Limpiar el camión y devolver correas y mantas al almacén", priority:"med", category:"Fin de Turno", days:["Mon","Tue","Wed","Fri","Sat"] },
  { id:"b10", text:"Organizar el almacén y guardar las camas en sus lugares correctos", priority:"high", category:"Almacén", days:["Fri"] },
  { id:"b11", text:"Actualizar la lista maestra de inventario con artículos recibidos y entregados", priority:"high", category:"Admin", days:["Fri"] },
  { id:"b12", text:"Corrida de cartón — desmantelar y desechar todo el cartón y empaque", priority:"high", category:"Almacén", days:["Fri"] },
  { id:"b13", text:"Preparar almacén para la recepción del jueves — limpiar espacio y etiquetar zonas", priority:"high", category:"Almacén", days:["Wed"] },
  { id:"b14", text:"Recibir camión del proveedor — verificar cada artículo contra el manifiesto", priority:"high", category:"Recepción", days:["Thu"] },
  { id:"b15", text:"Fotografiar artículos dañados inmediatamente al descubrirlos", priority:"high", category:"Recepción", days:["Thu"] },
  { id:"b16", text:"Organizar y etiquetar todo el producto recibido por SKU/categoría", priority:"high", category:"Almacén", days:["Thu"] },
  { id:"b17", text:"Actualizar inventario después de completar la recepción", priority:"high", category:"Admin", days:["Thu"] },
  { id:"b18", text:"Desechar todo el empaque de la recepción del jueves el mismo día", priority:"med", category:"Almacén", days:["Thu"] },
];

const ESCALATION = {
  customer: ["Driver", "Conner (Manager)", "Scott / Brian / Cameron"],
  product:  ["Driver", "Conner (Manager)", "Vendor"],
};

const STATUS_COLORS = {
  "Scheduled":   { bg:"#1e293b", text:"#94a3b8", dot:"#64748b" },
  "In Transit":  { bg:"#0c2340", text:"#60a5fa", dot:"#3b82f6" },
  "Delivered":   { bg:"#052e16", text:"#4ade80", dot:"#22c55e" },
  "Rescheduled": { bg:"#1c1500", text:"#fbbf24", dot:"#f59e0b" },
  "Transfer":    { bg:"#1a0a2e", text:"#c084fc", dot:"#a855f7" },
  "Issue":       { bg:"#2d0a0a", text:"#f87171", dot:"#ef4444" },
};

const ROLES = ["Driver","Helper","Driver/Helper","Coordinator","Loader","Manager","Warehouse","Other"];
const EMPTY_DEL = { id:"", customer:"", address:"", phone:"", items:[{qty:1,name:""}], delivery_window:"", assigned_to:1, status:"Scheduled", notes:"", floor:"1", elevator:false, removal_requested:false, transfer_scheduled:false, route_notes:"", stop_order:1 };

const todayDayName = () => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date().getDay()];
const avatarBg = (emp) => emp?.is_manager ? "linear-gradient(135deg,#7c3aed,#4f46e5)" : emp?.lang==="es" ? "linear-gradient(135deg,#059669,#047857)" : "linear-gradient(135deg,#1d4ed8,#0ea5e9)";

function AddBaseTaskRow({ lang, setBaseTasks, S }) {
  const [t, setT] = useState({ text:"", priority:"high", category:"Delivery", days:["Mon","Tue","Wed","Fri","Sat"] });
  const add = () => {
    if (!t.text.trim()) return;
    setBaseTasks(prev => ({ ...prev, [lang]: [...prev[lang], { id:`b-${Date.now()}`, ...t }] }));
    setT({ text:"", priority:"high", category:"Delivery", days:["Mon","Tue","Wed","Fri","Sat"] });
  };
  return (
    <div style={{ ...{background:"#0f1923",border:"1px solid #1e2d3d",borderRadius:12}, padding:"16px 20px", borderColor:"#1e3a5f" }}>
      <div style={{ fontSize:12, color:"#60a5fa", fontWeight:600, marginBottom:12 }}>➕ Add {lang==="en"?"English":"Spanish"} Template Task</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 100px 130px", gap:10, marginBottom:10 }}>
        <input value={t.text} onChange={e=>setT(p=>({...p,text:e.target.value}))} placeholder="Task description..." style={{background:"#0a1628",border:"1px solid #1e2d3d",borderRadius:8,padding:"9px 13px",fontSize:13,color:"#e2e8f0",width:"100%"}} />
        <select value={t.priority} onChange={e=>setT(p=>({...p,priority:e.target.value}))} style={{background:"#0a1628",border:"1px solid #1e2d3d",borderRadius:8,padding:"9px 12px",fontSize:13,color:"#e2e8f0",width:"100%"}}>
          <option value="high">High</option><option value="med">Medium</option><option value="low">Low</option>
        </select>
        <input value={t.category} onChange={e=>setT(p=>({...p,category:e.target.value}))} placeholder="Category" style={{background:"#0a1628",border:"1px solid #1e2d3d",borderRadius:8,padding:"9px 13px",fontSize:13,color:"#e2e8f0",width:"100%"}} />
      </div>
      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
        {ALL_DAYS.map(d=>(
          <label key={d} style={{ fontSize:12, cursor:"pointer", padding:"4px 10px", borderRadius:6, background:t.days.includes(d)?"#0c2340":"#1e2d3d", color:t.days.includes(d)?"#60a5fa":"#64748b", border:`1px solid ${t.days.includes(d)?"#3b82f6":"#1e2d3d"}` }}>
            <input type="checkbox" checked={t.days.includes(d)} onChange={e=>setT(p=>({...p,days:e.target.checked?[...p.days,d]:p.days.filter(x=>x!==d)}))} style={{display:"none"}} />{d}
          </label>
        ))}
      </div>
      <button onClick={add} style={{ background:"linear-gradient(135deg,#2563eb,#1d4ed8)", color:"#fff", padding:"8px 16px", fontSize:12, border:"none", borderRadius:8, cursor:"pointer", fontFamily:"inherit", fontWeight:500 }}>
        ➕ Add Template
      </button>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [employees, setEmployees] = useState(INITIAL_EMPLOYEES);
  const [deliveries, setDeliveries] = useState([]);
  const [customTasks, setCustomTasks] = useState({});
  const [notes, setNotes] = useState({});
  const [problems, setProblems] = useState([]);
  const [baseTasks, setBaseTasks] = useState({ en: BASE_TASKS_EN, es: BASE_TASKS_ES });

  const [aiTasks, setAiTasks] = useState({});
  const [generatingFor, setGeneratingFor] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedDay, setSelectedDay] = useState(todayDayName());
  const [noteInput, setNoteInput] = useState("");
  const [problemInput, setProblemInput] = useState({ empId:"", description:"", type:"customer" });
  const [customerMsg, setCustomerMsg] = useState({});
  const [sendingMsg, setSendingMsg] = useState(null);
  const [msgSent, setMsgSent] = useState({});
  const [newEmp, setNewEmp] = useState({ name:"", role:"Driver", lang:"en", workdays:["Mon","Tue","Wed","Fri"] });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingDelivery, setEditingDelivery] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editTaskVal, setEditTaskVal] = useState("");
  const [editingBaseTask, setEditingBaseTask] = useState(null);
  const [editBaseTaskVal, setEditBaseTaskVal] = useState("");
  const [newTaskInput, setNewTaskInput] = useState({ text:"", priority:"high", category:"Delivery", day:"All" });
  const [aiPrompt, setAiPrompt] = useState("");
  const [todayDate] = useState(new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}));

  const S = {
    card: { background:"#0f1923", border:"1px solid #1e2d3d", borderRadius:12 },
    input: { background:"#0a1628", border:"1px solid #1e2d3d", borderRadius:8, padding:"9px 13px", fontSize:13, color:"#e2e8f0", width:"100%" },
    select: { background:"#0a1628", border:"1px solid #1e2d3d", borderRadius:8, padding:"9px 12px", fontSize:13, color:"#e2e8f0", width:"100%" },
    label: { fontSize:10, fontWeight:700, letterSpacing:"0.1em", color:"#475569", textTransform:"uppercase", marginBottom:10, display:"block" },
  };

  // ── Load all data from Supabase on mount ────────────────────────────────────
  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      try {
        const [empRes, delRes, ctRes, notesRes, probRes] = await Promise.all([
          sb.from("employees").select("*"),
          sb.from("deliveries").select("*"),
          sb.from("custom_tasks").select("*"),
          sb.from("notes").select("*"),
          sb.from("problems").select("*"),
        ]);
        if (empRes.data && empRes.data.length > 0) setEmployees(empRes.data);
        else {
          // seed employees on first load
          await sb.from("employees").upsert(INITIAL_EMPLOYEES.map(e => ({...e, is_manager: e.isManager||false})));
        }
        if (delRes.data) setDeliveries(delRes.data);
        if (ctRes.data) {
          const grouped = {};
          ctRes.data.forEach(t => {
            if (!grouped[t.emp_id]) grouped[t.emp_id] = [];
            grouped[t.emp_id].push(t);
          });
          setCustomTasks(grouped);
        }
        if (notesRes.data) {
          const grouped = {};
          notesRes.data.forEach(n => {
            if (!grouped[n.emp_id]) grouped[n.emp_id] = [];
            grouped[n.emp_id].push(n);
          });
          setNotes(grouped);
        }
        if (probRes.data) setProblems(probRes.data);
      } catch(e) { console.error(e); }
      setLoading(false);
    }
    loadAll();

    // Real-time subscriptions
    const delSub = sb.channel("deliveries-changes")
      .on("postgres_changes", {event:"*", schema:"public", table:"deliveries"}, () => {
        sb.from("deliveries").select("*").then(({data}) => { if(data) setDeliveries(data); });
      }).subscribe();

    const probSub = sb.channel("problems-changes")
      .on("postgres_changes", {event:"*", schema:"public", table:"problems"}, () => {
        sb.from("problems").select("*").then(({data}) => { if(data) setProblems(data); });
      }).subscribe();

    return () => { sb.removeChannel(delSub); sb.removeChannel(probSub); };
  }, []);

  const getEmpDeliveries = (empId) => deliveries.filter(d=>d.assigned_to===empId);
  const workingOn = (emp, day) => emp.is_manager || emp.isManager || (emp.workdays||[]).includes(day);

  const getTasksForEmpDay = (empId, day) => {
    const emp = employees.find(e=>e.id===empId);
    if (!emp || !workingOn(emp, day)) return [];
    const lang = emp.lang;
    const base = (lang==="es" ? baseTasks.es : baseTasks.en).filter(t=>t.days.includes(day)||t.days.includes("All"));
    const custom = (customTasks[empId]||[]).filter(t=>t.day===day||t.day==="All");
    const ai = aiTasks[empId]||[];
    return [...base, ...custom, ...ai];
  };

  const generateAiTasks = async (empId) => {
    setGeneratingFor(empId);
    const emp = employees.find(e=>e.id===empId);
    const empDeliveries = getEmpDeliveries(empId);
    const isEs = emp.lang==="es";
    const prompt = `You are an operations manager at America's Mattress. Generate up to 5 ADDITIONAL tasks (no payment tasks) for ${emp.name}, a ${emp.role}, on ${selectedDay}.
Deliveries: ${empDeliveries.map(d=>`${d.customer} (${(d.items||[]).map(i=>`${i.qty}x ${i.name}`).join(", ")}, ${d.delivery_window}${d.floor!=="1"?`, floor ${d.floor}`:""}${d.removal_requested?", removal":""})`).join("; ")||"none"}.
${aiPrompt?"Context: "+aiPrompt:""}${isEs?"\nWrite ALL tasks in Spanish.":""}
Return ONLY a JSON array. Each: { "task": string, "duration": string, "priority": "high"|"med"|"low", "category": string }. Pure JSON only.`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:600,messages:[{role:"user",content:prompt}]})});
      const data = await res.json();
      const text = data.content.map(b=>b.text||"").join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      setAiTasks(prev=>({...prev,[empId]:parsed.map((t,i)=>({id:`ai-${empId}-${Date.now()}-${i}`,text:t.task,priority:t.priority,category:t.category,day:"All",duration:t.duration}))}));
    } catch {}
    setGeneratingFor(null);
  };

  // ── Delivery CRUD with Supabase ─────────────────────────────────────────────
  const saveDelivery = async (d) => {
    setSyncing(true);
    const row = {
      customer: d.customer, address: d.address, phone: d.phone,
      items: d.items||[], delivery_window: d.delivery_window||d.window||"",
      assigned_to: d.assigned_to||d.assignedTo||1, status: d.status,
      notes: d.notes||"", floor: d.floor||"1",
      elevator: !!d.elevator, removal_requested: !!d.removal_requested||!!d.removalRequested,
      transfer_scheduled: !!d.transfer_scheduled||!!d.transferScheduled,
      route_notes: d.route_notes||d.routeNotes||"", stop_order: d.stop_order||d.stopOrder||1,
    };
    if (!d.id) {
      const newId = `D-${String(deliveries.length+1).padStart(3,"0")}-${Date.now()}`;
      await sb.from("deliveries").insert({...row, id:newId});
      setDeliveries(prev=>[...prev,{...row,id:newId}]);
    } else {
      await sb.from("deliveries").update(row).eq("id",d.id);
      setDeliveries(prev=>prev.map(x=>x.id===d.id?{...row,id:d.id}:x));
    }
    setSyncing(false);
    setEditingDelivery(null);
  };

  const deleteDelivery = async (id) => {
    await sb.from("deliveries").delete().eq("id",id);
    setDeliveries(prev=>prev.filter(d=>d.id!==id));
  };

  const updateStatus = async (id, status) => {
    await sb.from("deliveries").update({status}).eq("id",id);
    setDeliveries(prev=>prev.map(d=>d.id===id?{...d,status}:d));
  };

  // ── Custom tasks with Supabase ──────────────────────────────────────────────
  const addCustomTask = async (empId) => {
    if (!newTaskInput.text.trim()) return;
    const task = { id:`ct-${empId}-${Date.now()}`, emp_id:empId, text:newTaskInput.text.trim(), priority:newTaskInput.priority, category:newTaskInput.category, day:newTaskInput.day };
    await sb.from("custom_tasks").insert(task);
    setCustomTasks(prev=>({...prev,[empId]:[...(prev[empId]||[]),task]}));
    setNewTaskInput({text:"",priority:"high",category:"Delivery",day:"All"});
  };

  const deleteCustomTask = async (empId, taskId) => {
    await sb.from("custom_tasks").delete().eq("id",taskId);
    setCustomTasks(prev=>({...prev,[empId]:(prev[empId]||[]).filter(t=>t.id!==taskId)}));
  };

  // ── Notes with Supabase ─────────────────────────────────────────────────────
  const addNote = async (empId) => {
    if (!noteInput.trim()) return;
    const ts = new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    const note = { id: Date.now(), emp_id: empId, text: noteInput.trim(), time: ts };
    await sb.from("notes").insert(note);
    setNotes(prev=>({...prev,[empId]:[...(prev[empId]||[]),note]}));
    setNoteInput("");
  };

  // ── Problems with Supabase ──────────────────────────────────────────────────
  const logProblem = async () => {
    if (!problemInput.description.trim()||!problemInput.empId) return;
    const emp = employees.find(e=>e.id===Number(problemInput.empId));
    const problem = { id:Date.now(), emp_name:emp?.name, description:problemInput.description, type:problemInput.type, escalation_step:0, time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}), resolved:false };
    await sb.from("problems").insert(problem);
    setProblems(prev=>[...prev,problem]);
    setProblemInput({empId:"",description:"",type:"customer"});
  };

  const escalateProblem = async (id) => {
    const p = problems.find(x=>x.id===id);
    if (!p) return;
    const chain = ESCALATION[p.type];
    const next = Math.min(p.escalation_step+1,chain.length-1);
    const resolved = next===chain.length-1;
    await sb.from("problems").update({escalation_step:next,resolved}).eq("id",id);
    setProblems(prev=>prev.map(x=>x.id===id?{...x,escalation_step:next,resolved}:x));
  };

  // ── SMS ─────────────────────────────────────────────────────────────────────
  const generateSMS = async (delivery) => {
    setSendingMsg(delivery.id);
    const itemStr = (delivery.items||[]).map(i=>`${i.qty}x ${i.name}`).join(", ");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:200,messages:[{role:"user",content:`Write a short friendly SMS under 160 chars for America's Mattress. No payment info. Customer: ${delivery.customer}, Items: ${itemStr}, Window: ${delivery.delivery_window||delivery.window}, Status: ${delivery.status}. Return ONLY the SMS text.`}]})});
      const data = await res.json();
      setCustomerMsg(prev=>({...prev,[delivery.id]:data.content.map(b=>b.text||"").join("").trim()}));
    } catch {
      setCustomerMsg(prev=>({...prev,[delivery.id]:`Hi ${delivery.customer.split(" ")[0]}! Your delivery is scheduled for ${delivery.delivery_window||delivery.window}. We'll call 30 min before arrival! – America's Mattress`}));
    }
    setSendingMsg(null);
    setMsgSent(prev=>({...prev,[delivery.id]:true}));
    setTimeout(()=>setMsgSent(prev=>({...prev,[delivery.id]:false})),3000);
  };

  // ── Add Employee ────────────────────────────────────────────────────────────
  const addEmployee = async () => {
    if (!newEmp.name.trim()) return;
    const initials = newEmp.name.trim().split(" ").map(w=>w[0].toUpperCase()).join("").slice(0,2);
    const nextId = Math.max(...employees.map(e=>e.id))+1;
    const emp = {id:nextId,name:newEmp.name.trim(),role:newEmp.role,avatar:initials,lang:newEmp.lang,workdays:newEmp.workdays,is_manager:false};
    await sb.from("employees").insert(emp);
    setEmployees(prev=>[...prev,emp]);
    setNewEmp({name:"",role:"Driver",lang:"en",workdays:["Mon","Tue","Wed","Fri"]});
  };

  const stats = {
    total:deliveries.length,
    delivered:deliveries.filter(d=>d.status==="Delivered").length,
    inTransit:deliveries.filter(d=>d.status==="In Transit").length,
    scheduled:deliveries.filter(d=>d.status==="Scheduled").length,
    issues:deliveries.filter(d=>d.status==="Issue"||d.status==="Rescheduled").length,
  };

  if (loading) return (
    <div style={{background:"#080d14",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:40}}>🛏</div>
      <div style={{color:"#60a5fa",fontSize:16,fontFamily:"sans-serif"}}>Loading America's Mattress Operations...</div>
      <div style={{color:"#475569",fontSize:13,fontFamily:"sans-serif"}}>Connecting to database...</div>
    </div>
  );

  return (
    <div style={{fontFamily:"'DM Sans','Segoe UI',sans-serif",background:"#080d14",minHeight:"100vh",color:"#e2e8f0"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0f1923}::-webkit-scrollbar-thumb{background:#334155;border-radius:2px}
        .btn{border:none;cursor:pointer;font-family:inherit;border-radius:8px;font-weight:500;transition:all .15s}
        .btn:hover{opacity:.85;transform:translateY(-1px)}.btn:active{transform:translateY(0)}.btn:disabled{opacity:.4;cursor:not-allowed;transform:none}
        .badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:.04em}
        .ch:hover{border-color:#334155!important;background:#131f2e!important}
        .pulse{animation:pulse 2s infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        .fade-in{animation:fadeIn .3s ease}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        input,textarea,select{font-family:inherit;color:#e2e8f0}
        .tab-btn{background:none;border:none;cursor:pointer;font-family:inherit;transition:all .2s}
      `}</style>

      {/* HEADER */}
      <div style={{background:"#0a1628",borderBottom:"1px solid #1e2d3d"}}>
        <div style={{maxWidth:1180,margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:64}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:38,height:38,background:"linear-gradient(135deg,#2563eb,#1d4ed8)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🛏</div>
            <div>
              <div style={{fontWeight:800,fontSize:15,color:"#f1f5f9"}}>America's Mattress</div>
              <div style={{fontSize:11,color:"#475569",fontFamily:"'DM Mono',monospace"}}>Operations Hub {syncing?"· Saving...":"· Live"}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontSize:12,color:"#475569"}}>{todayDate}</div>
            <div style={{width:34,height:34,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#4f46e5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#fff"}}>CO</div>
          </div>
        </div>
      </div>

      {/* NAV */}
      <div style={{background:"#0a1628",borderBottom:"1px solid #1e2d3d"}}>
        <div style={{maxWidth:1180,margin:"0 auto",padding:"0 24px",display:"flex",gap:2,overflowX:"auto"}}>
          {[
            {key:"dashboard",label:"Dashboard",icon:"⬛"},
            {key:"tasks",label:"Daily Tasks",icon:"✅"},
            {key:"deliveries",label:"Deliveries",icon:"🚛"},
            {key:"problems",label:"Problems",icon:"⚠️"},
            {key:"comms",label:"Customer SMS",icon:"💬"},
            {key:"team",label:"Team",icon:"👥"},
            {key:"basetasks",label:"Edit Templates",icon:"✏️"},
          ].map(t=>(
            <button key={t.key} className="tab-btn" onClick={()=>setTab(t.key)}
              style={{padding:"14px 13px",fontSize:13,fontWeight:500,whiteSpace:"nowrap",color:tab===t.key?"#60a5fa":"#64748b",borderBottom:tab===t.key?"2px solid #3b82f6":"2px solid transparent"}}>
              {t.icon} {t.label}
              {t.key==="problems"&&problems.filter(p=>!p.resolved).length>0&&<span style={{marginLeft:5,background:"#ef4444",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10}}>{problems.filter(p=>!p.resolved).length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:1180,margin:"0 auto",padding:"24px"}}>

        {/* DASHBOARD */}
        {tab==="dashboard"&&(
          <div className="fade-in">
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:14,marginBottom:28}}>
              {[{label:"Total",val:stats.total,color:"#3b82f6",icon:"📦"},{label:"Scheduled",val:stats.scheduled,color:"#64748b",icon:"🕐"},{label:"In Transit",val:stats.inTransit,color:"#3b82f6",icon:"🚛"},{label:"Delivered",val:stats.delivered,color:"#22c55e",icon:"✅"},{label:"Issues",val:stats.issues,color:"#ef4444",icon:"⚠️"}].map(s=>(
                <div key={s.label} style={{...S.card,padding:"18px 20px"}}>
                  <div style={{fontSize:22,marginBottom:6}}>{s.icon}</div>
                  <div style={{fontSize:30,fontWeight:700,color:s.color,fontFamily:"'DM Mono',monospace",lineHeight:1}}>{s.val}</div>
                  <div style={{fontSize:11,color:"#475569",marginTop:5,fontWeight:500}}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{...S.label}}>Viewing Day</div>
            <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
              {ALL_DAYS.map(d=>(
                <button key={d} className="btn" onClick={()=>setSelectedDay(d)}
                  style={{padding:"6px 16px",fontSize:12,background:selectedDay===d?"linear-gradient(135deg,#2563eb,#1d4ed8)":"#1e2d3d",color:selectedDay===d?"#fff":"#94a3b8"}}>
                  {d}
                </button>
              ))}
            </div>
            <div style={{...S.label}}>Team — {selectedDay}</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:28}}>
              {employees.map(emp=>{
                const working=workingOn(emp,selectedDay);
                const eds=getEmpDeliveries(emp.id);
                const done=eds.filter(d=>d.status==="Delivered").length;
                const pct=eds.length?Math.round(done/eds.length*100):0;
                return(
                  <div key={emp.id} style={{...S.card,padding:"16px 18px",cursor:"pointer",opacity:working?1:0.35,transition:"all .2s"}} className="ch"
                    onClick={()=>{setTab("tasks");setSelectedEmployee(emp.id);}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                      <div style={{width:36,height:36,borderRadius:"50%",background:avatarBg(emp),display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>{emp.avatar}</div>
                      <div>
                        <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9"}}>{emp.name}{(emp.is_manager||emp.isManager)?" 👑":""}{emp.lang==="es"?" 🇲🇽":""}</div>
                        <div style={{fontSize:10,color:working?"#22c55e":"#475569"}}>{working?"Working":"Off"}</div>
                      </div>
                    </div>
                    {working&&<>
                      <div style={{height:3,background:"#1e2d3d",borderRadius:2,overflow:"hidden",marginBottom:5}}>
                        <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#2563eb,#22c55e)",borderRadius:2}}/>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#475569"}}>
                        <span>{done}/{eds.length} deliveries</span>
                        <span style={{color:pct===100?"#22c55e":"#60a5fa",fontWeight:600}}>{pct}%</span>
                      </div>
                    </>}
                  </div>
                );
              })}
            </div>
            {deliveries.length>0&&(
              <div style={{...S.card,overflow:"hidden"}}>
                {[...deliveries].sort((a,b)=>(a.stop_order||0)-(b.stop_order||0)).map((d,i)=>{
                  const emp=employees.find(e=>e.id===d.assigned_to);
                  const sc=STATUS_COLORS[d.status]||STATUS_COLORS["Scheduled"];
                  return(
                    <div key={d.id} style={{display:"flex",alignItems:"center",padding:"12px 20px",borderBottom:i<deliveries.length-1?"1px solid #131f2e":"none",gap:12,flexWrap:"wrap"}}>
                      <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#64748b",width:28}}>#{d.stop_order}</span>
                      <div style={{flex:1,minWidth:140}}>
                        <div style={{fontWeight:600,fontSize:13,color:"#e2e8f0"}}>{d.customer}</div>
                        <div style={{fontSize:11,color:"#475569"}}>{(d.items||[]).map(i=>`${i.qty}x ${i.name}`).join(", ")} · {d.address}</div>
                      </div>
                      <div style={{fontSize:11,color:"#64748b",width:80}}>{d.delivery_window||d.window}</div>
                      <div style={{fontSize:11,color:"#64748b",width:90}}>{emp?.name}</div>
                      <span className="badge" style={{background:sc.bg,color:sc.text}}>
                        <span style={{width:6,height:6,borderRadius:"50%",background:sc.dot,...(d.status==="In Transit"?{animation:"pulse 2s infinite"}:{})}}/>
                        {d.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* DAILY TASKS */}
        {tab==="tasks"&&(
          <div className="fade-in">
            <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:12,color:"#475569"}}>Day:</span>
              {ALL_DAYS.map(d=>(
                <button key={d} className="btn" onClick={()=>setSelectedDay(d)}
                  style={{padding:"5px 13px",fontSize:12,background:selectedDay===d?"linear-gradient(135deg,#2563eb,#1d4ed8)":"#1e2d3d",color:selectedDay===d?"#fff":"#94a3b8"}}>
                  {d}
                </button>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"210px 1fr",gap:20}}>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {employees.map(emp=>{
                  const working=workingOn(emp,selectedDay);
                  return(
                    <button key={emp.id} className="btn ch" onClick={()=>setSelectedEmployee(emp.id)}
                      style={{...S.card,padding:"10px 13px",textAlign:"left",display:"flex",alignItems:"center",gap:10,opacity:working?1:0.4,borderColor:selectedEmployee===emp.id?"#3b82f6":"#1e2d3d",background:selectedEmployee===emp.id?"#0c1f38":"#0f1923"}}>
                      <div style={{width:30,height:30,borderRadius:"50%",background:avatarBg(emp),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}}>{emp.avatar}</div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:12,color:"#f1f5f9"}}>{emp.name}{(emp.is_manager||emp.isManager)?" 👑":""}{emp.lang==="es"?" 🇲🇽":""}</div>
                        <div style={{fontSize:10,color:working?"#22c55e":"#475569"}}>{working?"Working":"Off"} · {emp.role}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div>
                {!selectedEmployee?(
                  <div style={{...S.card,padding:48,textAlign:"center",color:"#475569"}}>
                    <div style={{fontSize:36,marginBottom:10}}>👈</div>
                    <div>Select an employee to view and edit their tasks</div>
                  </div>
                ):(()=>{
                  const emp=employees.find(e=>e.id===selectedEmployee);
                  if(!emp) return null;
                  const allTasks=getTasksForEmpDay(emp.id,selectedDay);
                  const empNotes=notes[selectedEmployee]||[];
                  const cats=[...new Set(allTasks.map(t=>t.category))];
                  const isEs=emp.lang==="es";
                  return(
                    <div>
                      <div style={{...S.card,padding:"16px 22px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:17,color:"#f1f5f9"}}>{emp.name} — {selectedDay}{(emp.is_manager||emp.isManager)?" 👑":""}</div>
                          <div style={{fontSize:12,color:"#475569",marginTop:2}}>{emp.role} · {allTasks.length} tasks · {getEmpDeliveries(emp.id).length} deliveries</div>
                        </div>
                        <button className="btn" onClick={()=>generateAiTasks(selectedEmployee)} disabled={generatingFor===selectedEmployee}
                          style={{background:"#1e2d3d",color:"#64748b",border:"1px solid #334155",padding:"7px 14px",fontSize:12}}>
                          {generatingFor===selectedEmployee?"⏳ Generating...":"🤖 AI Add-ons (optional)"}
                        </button>
                      </div>
                      {!workingOn(emp,selectedDay)&&(
                        <div style={{...S.card,padding:"12px 20px",marginBottom:14,borderColor:"#1c1500"}}>
                          <span style={{fontSize:13,color:"#f59e0b"}}>⚠️ {emp.name} is not scheduled to work on {selectedDay}.</span>
                        </div>
                      )}
                      {cats.length>0&&(
                        <div style={{...S.card,marginBottom:14}}>
                          {cats.map(cat=>(
                            <div key={cat}>
                              <div style={{padding:"8px 20px",background:"#0a1628",fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:"#475569",textTransform:"uppercase",borderBottom:"1px solid #131f2e"}}>{cat}</div>
                              {allTasks.filter(t=>t.category===cat).map((task,i)=>(
                                <div key={task.id||i} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"11px 20px",borderBottom:"1px solid #0f1923"}}>
                                  <div style={{width:7,height:7,borderRadius:"50%",background:task.priority==="high"?"#ef4444":task.priority==="med"?"#f59e0b":"#475569",marginTop:5,flexShrink:0}}/>
                                  <div style={{flex:1}}>
                                    {editingTask&&editingTask===task.id?(
                                      <div style={{display:"flex",gap:8}}>
                                        <input value={editTaskVal} onChange={e=>setEditTaskVal(e.target.value)} style={{flex:1,background:"#0a1628",border:"1px solid #3b82f6",borderRadius:6,padding:"6px 10px",fontSize:13,color:"#e2e8f0"}}/>
                                        <button className="btn" onClick={async()=>{
                                          await sb.from("custom_tasks").update({text:editTaskVal}).eq("id",task.id);
                                          setCustomTasks(prev=>({...prev,[emp.id]:(prev[emp.id]||[]).map(t=>t.id===task.id?{...t,text:editTaskVal}:t)}));
                                          setEditingTask(null);
                                        }} style={{background:"#1d4ed8",color:"#fff",padding:"5px 12px",fontSize:12}}>Save</button>
                                        <button className="btn" onClick={()=>setEditingTask(null)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"5px 10px",fontSize:12}}>✕</button>
                                      </div>
                                    ):(
                                      <div style={{fontSize:13,color:"#e2e8f0",fontWeight:500}}>{task.text}{task.duration&&<span style={{color:"#475569",fontSize:11,marginLeft:8}}>~{task.duration}</span>}</div>
                                    )}
                                  </div>
                                  {task.id&&task.id.startsWith&&task.id.startsWith("ct")&&(
                                    <div style={{display:"flex",gap:5,flexShrink:0}}>
                                      <button className="btn" onClick={()=>{setEditingTask(task.id);setEditTaskVal(task.text);}} style={{background:"#1e2d3d",color:"#60a5fa",padding:"3px 8px",fontSize:11}}>Edit</button>
                                      <button className="btn" onClick={()=>deleteCustomTask(emp.id,task.id)} style={{background:"#2d0a0a",color:"#f87171",padding:"3px 8px",fontSize:11}}>✕</button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{...S.card,padding:"16px 22px",marginBottom:14}}>
                        <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9",marginBottom:12}}>➕ Add Task for {emp.name}</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 100px 130px 90px",gap:10,marginBottom:10}}>
                          <input value={newTaskInput.text} onChange={e=>setNewTaskInput(p=>({...p,text:e.target.value}))}
                            onKeyDown={e=>e.key==="Enter"&&addCustomTask(emp.id)}
                            placeholder="Task description..." style={S.input}/>
                          <select value={newTaskInput.priority} onChange={e=>setNewTaskInput(p=>({...p,priority:e.target.value}))} style={S.select}>
                            <option value="high">High</option><option value="med">Medium</option><option value="low">Low</option>
                          </select>
                          <input value={newTaskInput.category} onChange={e=>setNewTaskInput(p=>({...p,category:e.target.value}))} placeholder="Category" style={S.input}/>
                          <select value={newTaskInput.day} onChange={e=>setNewTaskInput(p=>({...p,day:e.target.value}))} style={S.select}>
                            <option value="All">Every Day</option>
                            {ALL_DAYS.map(d=><option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div style={{display:"flex",gap:10,alignItems:"center"}}>
                          <button className="btn" onClick={()=>addCustomTask(emp.id)} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"8px 18px",fontSize:13}}>➕ Add Task</button>
                          <input value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder="AI context (optional)..." style={{flex:1,...S.input}}/>
                        </div>
                      </div>
                      <div style={{...S.card,padding:"16px 22px"}}>
                        <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9",marginBottom:10}}>💬 {isEs?"Notas del Gerente":"Manager Notes"}</div>
                        {empNotes.map(n=>(
                          <div key={n.id} style={{background:"#0a1628",borderRadius:7,padding:"8px 12px",marginBottom:6,display:"flex",justifyContent:"space-between"}}>
                            <span style={{fontSize:13,color:"#cbd5e1"}}>{n.text}</span>
                            <span style={{fontSize:10,color:"#475569",marginLeft:12,flexShrink:0}}>{n.time}</span>
                          </div>
                        ))}
                        <div style={{display:"flex",gap:8,marginTop:8}}>
                          <input value={noteInput} onChange={e=>setNoteInput(e.target.value)}
                            onKeyDown={e=>e.key==="Enter"&&addNote(selectedEmployee)}
                            placeholder={isEs?"Añadir nota...":"Add a note..."} style={{flex:1,...S.input}}/>
                          <button className="btn" onClick={()=>addNote(selectedEmployee)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"8px 14px",fontSize:13}}>Add</button>
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
          <div className="fade-in">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {Object.entries(STATUS_COLORS).map(([s,c])=>(
                  <span key={s} className="badge" style={{background:c.bg,color:c.text,padding:"5px 12px"}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:c.dot}}/>{s} — {deliveries.filter(d=>d.status===s).length}
                  </span>
                ))}
              </div>
              <button className="btn" onClick={()=>setEditingDelivery({...EMPTY_DEL,stop_order:deliveries.length+1})}
                style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"9px 18px",fontSize:13}}>
                ➕ Add Customer / Delivery
              </button>
            </div>

            {editingDelivery&&(
              <div style={{...S.card,padding:"22px 26px",marginBottom:20,borderColor:"#3b82f6"}}>
                <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:18}}>{editingDelivery.id?"✏️ Edit Delivery":"➕ Add New Customer Delivery"}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
                  {[{label:"Customer Name",field:"customer",ph:"John Smith"},{label:"Address",field:"address",ph:"123 Main St"},{label:"Phone",field:"phone",ph:"555-0100"},{label:"Time Window",field:"delivery_window",ph:"9AM–11AM"},{label:"Floor #",field:"floor",ph:"1"}].map(f=>(
                    <div key={f.field}>
                      <div style={{fontSize:11,color:"#475569",marginBottom:5}}>{f.label}</div>
                      <input value={editingDelivery[f.field]||""} onChange={e=>setEditingDelivery(p=>({...p,[f.field]:e.target.value}))} placeholder={f.ph} style={S.input}/>
                    </div>
                  ))}
                </div>
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11,color:"#475569",marginBottom:8}}>Items Being Delivered</div>
                  {(editingDelivery.items||[{qty:1,name:""}]).map((item,idx)=>(
                    <div key={idx} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
                      <input type="number" min="1" value={item.qty} onChange={e=>{const items=[...(editingDelivery.items||[])];items[idx]={...items[idx],qty:Number(e.target.value)};setEditingDelivery(p=>({...p,items}));}}
                        placeholder="Qty" style={{...S.input,width:70,textAlign:"center"}}/>
                      <input value={item.name} onChange={e=>{const items=[...(editingDelivery.items||[])];items[idx]={...items[idx],name:e.target.value};setEditingDelivery(p=>({...p,items}));}}
                        placeholder="e.g. Queen Memory Foam, Bed Frame" style={{...S.input,flex:1}}/>
                      {(editingDelivery.items||[]).length>1&&(
                        <button className="btn" onClick={()=>setEditingDelivery(p=>({...p,items:p.items.filter((_,i)=>i!==idx)}))}
                          style={{background:"#2d0a0a",color:"#f87171",padding:"7px 10px",fontSize:12,flexShrink:0}}>✕</button>
                      )}
                    </div>
                  ))}
                  <button className="btn" onClick={()=>setEditingDelivery(p=>({...p,items:[...(p.items||[]),{qty:1,name:""}]}))}
                    style={{background:"#1e2d3d",color:"#60a5fa",padding:"6px 14px",fontSize:12,marginTop:4}}>
                    ➕ Add Another Item
                  </button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
                  <div>
                    <div style={{fontSize:11,color:"#475569",marginBottom:5}}>Assigned Driver</div>
                    <select value={editingDelivery.assigned_to||editingDelivery.assignedTo||1} onChange={e=>setEditingDelivery(p=>({...p,assigned_to:Number(e.target.value)}))} style={S.select}>
                      {employees.filter(e=>!e.is_manager&&!e.isManager).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:"#475569",marginBottom:5}}>Status</div>
                    <select value={editingDelivery.status} onChange={e=>setEditingDelivery(p=>({...p,status:e.target.value}))} style={S.select}>
                      {Object.keys(STATUS_COLORS).map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:"#475569",marginBottom:5}}>Stop # (Route Order)</div>
                    <input type="number" value={editingDelivery.stop_order||1} onChange={e=>setEditingDelivery(p=>({...p,stop_order:Number(e.target.value)}))} style={S.input}/>
                  </div>
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:"#475569",marginBottom:5}}>Route Notes (directions, gate codes, parking)</div>
                  <textarea value={editingDelivery.route_notes||""} onChange={e=>setEditingDelivery(p=>({...p,route_notes:e.target.value}))}
                    placeholder="e.g. Take I-40 East exit 167. Gate code 1234. Park in back." rows={3} style={{...S.input,resize:"vertical"}}/>
                </div>
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11,color:"#475569",marginBottom:5}}>Delivery Notes</div>
                  <input value={editingDelivery.notes||""} onChange={e=>setEditingDelivery(p=>({...p,notes:e.target.value}))} placeholder="e.g. 3rd floor no elevator" style={S.input}/>
                </div>
                <div style={{display:"flex",gap:20,marginBottom:16,flexWrap:"wrap"}}>
                  {[{label:"Elevator",field:"elevator"},{label:"Old Mattress Removal",field:"removal_requested"},{label:"Transfer Scheduled",field:"transfer_scheduled"}].map(f=>(
                    <label key={f.field} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:"#94a3b8"}}>
                      <input type="checkbox" checked={!!editingDelivery[f.field]} onChange={e=>setEditingDelivery(p=>({...p,[f.field]:e.target.checked}))} style={{width:16,height:16}}/>
                      {f.label}
                    </label>
                  ))}
                </div>
                <div style={{display:"flex",gap:10}}>
                  <button className="btn" onClick={()=>saveDelivery(editingDelivery)} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"9px 20px",fontSize:13}}>💾 Save</button>
                  <button className="btn" onClick={()=>setEditingDelivery(null)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"9px 16px",fontSize:13}}>Cancel</button>
                </div>
              </div>
            )}

            {deliveries.length===0?(
              <div style={{...S.card,padding:48,textAlign:"center",color:"#475569"}}>
                <div style={{fontSize:40,marginBottom:10}}>🚛</div>
                <div style={{fontSize:15,marginBottom:6}}>No deliveries yet</div>
                <div style={{fontSize:13}}>Click "➕ Add Customer / Delivery" to build today's route.</div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {[...deliveries].sort((a,b)=>(a.stop_order||0)-(b.stop_order||0)).map(d=>{
                  const emp=employees.find(e=>e.id===d.assigned_to);
                  const sc=STATUS_COLORS[d.status]||STATUS_COLORS["Scheduled"];
                  const itemList=d.items&&d.items.length>0?d.items:(d.item?[{qty:1,name:d.item}]:[]);
                  return(
                    <div key={d.id} style={{...S.card,padding:"18px 22px"}}>
                      <div style={{display:"flex",gap:18,flexWrap:"wrap"}}>
                        <div style={{flex:1,minWidth:180}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                            <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#64748b"}}>Stop #{d.stop_order}</span>
                            <span className="badge" style={{background:sc.bg,color:sc.text}}>
                              <span style={{width:5,height:5,borderRadius:"50%",background:sc.dot,...(d.status==="In Transit"?{animation:"pulse 2s infinite"}:{})}}/>
                              {d.status}
                            </span>
                          </div>
                          <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>{d.customer}</div>
                          <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{d.address}</div>
                          <div style={{fontSize:12,color:"#64748b"}}>{d.phone}</div>
                          <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                            {d.removal_requested&&<span style={{fontSize:10,background:"#1c1500",color:"#f59e0b",borderRadius:4,padding:"2px 6px"}}>♻️ Removal</span>}
                            {d.transfer_scheduled&&<span style={{fontSize:10,background:"#1a0a2e",color:"#c084fc",borderRadius:4,padding:"2px 6px"}}>🔄 Transfer</span>}
                            {d.floor&&d.floor!=="1"&&<span style={{fontSize:10,background:"#0a1628",color:"#60a5fa",borderRadius:4,padding:"2px 6px"}}>{d.elevator?"🛗 Elevator":`🪜 Floor ${d.floor}`}</span>}
                          </div>
                        </div>
                        <div style={{minWidth:160}}>
                          <div style={{fontSize:10,color:"#475569",marginBottom:6,textTransform:"uppercase",letterSpacing:".06em"}}>Items</div>
                          {itemList.map((item,i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                              <span style={{background:"#1e2d3d",color:"#60a5fa",borderRadius:6,padding:"2px 8px",fontSize:12,fontWeight:700,flexShrink:0}}>{item.qty}x</span>
                              <span style={{fontSize:13,color:"#e2e8f0",fontWeight:500}}>{item.name}</span>
                            </div>
                          ))}
                          <div style={{fontSize:10,color:"#475569",marginTop:10,marginBottom:3,textTransform:"uppercase",letterSpacing:".06em"}}>Window</div>
                          <div style={{fontWeight:500,color:"#60a5fa",fontSize:13}}>{d.delivery_window||d.window}</div>
                          <div style={{fontSize:10,color:"#475569",marginTop:8,marginBottom:3,textTransform:"uppercase",letterSpacing:".06em"}}>Driver</div>
                          <div style={{fontWeight:600,color:"#e2e8f0",fontSize:13}}>{emp?.name}</div>
                          {d.notes&&<div style={{fontSize:10,color:"#f59e0b",marginTop:8,background:"#1c1500",borderRadius:5,padding:"3px 7px"}}>⚠️ {d.notes}</div>}
                        </div>
                        {d.route_notes&&(
                          <div style={{minWidth:180,flex:1}}>
                            <div style={{fontSize:10,color:"#475569",marginBottom:5,textTransform:"uppercase",letterSpacing:".06em"}}>🗺 Route Notes</div>
                            <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.6,background:"#0a1628",borderRadius:8,padding:"10px 12px"}}>{d.route_notes}</div>
                          </div>
                        )}
                        <div style={{display:"flex",flexDirection:"column",gap:5,minWidth:115}}>
                          <div style={{fontSize:10,color:"#475569",textTransform:"uppercase",letterSpacing:".06em",marginBottom:2}}>Status</div>
                          {Object.keys(STATUS_COLORS).map(s=>(
                            <button key={s} className="btn" onClick={()=>updateStatus(d.id,s)}
                              style={{background:d.status===s?STATUS_COLORS[s].bg:"#0a1628",color:d.status===s?STATUS_COLORS[s].text:"#475569",border:`1px solid ${d.status===s?STATUS_COLORS[s].dot:"#1e2d3d"}`,padding:"4px 8px",fontSize:10,textAlign:"left"}}>
                              {s}
                            </button>
                          ))}
                          <div style={{display:"flex",gap:5,marginTop:4}}>
                            <button className="btn" onClick={()=>setEditingDelivery({...d,items:d.items||[{qty:1,name:""}]})} style={{background:"#1e2d3d",color:"#60a5fa",padding:"5px 8px",fontSize:11,flex:1}}>✏️ Edit</button>
                            <button className="btn" onClick={()=>deleteDelivery(d.id)} style={{background:"#2d0a0a",color:"#f87171",padding:"5px 8px",fontSize:11}}>✕</button>
                          </div>
                        </div>
                      </div>
                      {d.address&&(
                        <div style={{marginTop:14,borderRadius:10,overflow:"hidden",border:"1px solid #1e2d3d"}}>
                          <iframe title={`map-${d.id}`} width="100%" height="200" style={{border:0,display:"block"}} loading="lazy"
                            src={`https://maps.google.com/maps?q=${encodeURIComponent(d.address)}&output=embed&z=15`}/>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* PROBLEMS */}
        {tab==="problems"&&(
          <div className="fade-in">
            <div style={{...S.card,padding:"20px 24px",marginBottom:20}}>
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:16}}>⚠️ Log a Problem</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                <div>
                  <div style={{fontSize:11,color:"#475569",marginBottom:5}}>Employee</div>
                  <select value={problemInput.empId} onChange={e=>setProblemInput(p=>({...p,empId:e.target.value}))} style={S.select}>
                    <option value="">Select...</option>
                    {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:"#475569",marginBottom:5}}>Type</div>
                  <select value={problemInput.type} onChange={e=>setProblemInput(p=>({...p,type:e.target.value}))} style={S.select}>
                    <option value="customer">Customer Issue</option>
                    <option value="product">Product / Vendor</option>
                  </select>
                </div>
              </div>
              <textarea value={problemInput.description} onChange={e=>setProblemInput(p=>({...p,description:e.target.value}))}
                placeholder="Describe the problem..." rows={3} style={{...S.input,resize:"vertical",marginBottom:12}}/>
              <button className="btn" onClick={logProblem} style={{background:"linear-gradient(135deg,#dc2626,#b91c1c)",color:"#fff",padding:"9px 20px",fontSize:13}}>⚠️ Log Problem</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
              {Object.entries(ESCALATION).map(([type,chain])=>(
                <div key={type} style={{...S.card,padding:"16px 20px"}}>
                  <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9",marginBottom:12}}>{type==="customer"?"👤 Customer Chain":"📦 Product / Vendor Chain"}</div>
                  {chain.map((step,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:i<chain.length-1?8:0}}>
                      <div style={{width:24,height:24,borderRadius:"50%",background:i===0?"#1e2d3d":i===1?"#2d1a5e":"#052e16",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:i===0?"#94a3b8":i===1?"#a78bfa":"#4ade80",flexShrink:0}}>{i+1}</div>
                      <div style={{fontSize:13,color:i===1?"#a78bfa":"#e2e8f0",fontWeight:i===1?600:400}}>{step}</div>
                      {i<chain.length-1&&<div style={{marginLeft:"auto",color:"#475569"}}>→</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {problems.length===0?(
              <div style={{...S.card,padding:40,textAlign:"center",color:"#475569"}}><div style={{fontSize:32,marginBottom:8}}>✅</div><div>No problems logged today.</div></div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {problems.map(p=>{
                  const chain=ESCALATION[p.type];
                  const nextLevel=chain[(p.escalation_step||0)+1];
                  return(
                    <div key={p.id} style={{...S.card,padding:"18px 22px",borderColor:p.resolved?"#1e3a20":"#3d1515"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,flexWrap:"wrap",gap:10}}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                            <span style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>{p.emp_name}</span>
                            <span className="badge" style={{background:p.type==="customer"?"#0c2340":"#1a0a2e",color:p.type==="customer"?"#60a5fa":"#c084fc"}}>{p.type==="customer"?"👤 Customer":"📦 Product"}</span>
                            {p.resolved&&<span className="badge" style={{background:"#052e16",color:"#4ade80"}}>✅ Resolved</span>}
                          </div>
                          <div style={{fontSize:13,color:"#cbd5e1"}}>{p.description}</div>
                          <div style={{fontSize:10,color:"#475569",marginTop:4}}>Logged at {p.time}</div>
                        </div>
                        {!p.resolved&&nextLevel&&(
                          <button className="btn" onClick={()=>escalateProblem(p.id)} style={{background:"linear-gradient(135deg,#d97706,#b45309)",color:"#fff",padding:"7px 14px",fontSize:12}}>↑ Escalate to {nextLevel}</button>
                        )}
                      </div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {chain.map((step,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:5,background:i<=(p.escalation_step||0)?(i===(p.escalation_step||0)?"#0c2340":"#052e16"):"#0a1628",borderRadius:6,padding:"5px 10px",border:`1px solid ${i===(p.escalation_step||0)?"#3b82f6":"#1e2d3d"}`}}>
                            <span style={{width:6,height:6,borderRadius:"50%",background:i<(p.escalation_step||0)?"#22c55e":i===(p.escalation_step||0)?"#3b82f6":"#334155"}}/>
                            <span style={{fontSize:11,color:i<=(p.escalation_step||0)?"#e2e8f0":"#475569"}}>{step}</span>
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

        {/* CUSTOMER SMS */}
        {tab==="comms"&&(
          <div className="fade-in">
            {deliveries.length===0?(
              <div style={{...S.card,padding:48,textAlign:"center",color:"#475569"}}><div style={{fontSize:32,marginBottom:8}}>💬</div><div>Add deliveries first.</div></div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {deliveries.map(d=>{
                  const sc=STATUS_COLORS[d.status]||STATUS_COLORS["Scheduled"];
                  const msg=customerMsg[d.id];
                  const sent=msgSent[d.id];
                  return(
                    <div key={d.id} style={{...S.card,padding:"18px 22px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,flexWrap:"wrap",gap:10}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>{d.customer}</div>
                          <div style={{fontSize:11,color:"#64748b"}}>{d.phone} · {(d.items||[]).map(i=>`${i.qty}x ${i.name}`).join(", ")} · {d.delivery_window||d.window}</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span className="badge" style={{background:sc.bg,color:sc.text}}><span style={{width:5,height:5,borderRadius:"50%",background:sc.dot}}/>{d.status}</span>
                          <button className="btn" onClick={()=>generateSMS(d)} disabled={sendingMsg===d.id}
                            style={{background:sendingMsg===d.id?"#1e2d3d":"linear-gradient(135deg,#2563eb,#1d4ed8)",color:sendingMsg===d.id?"#475569":"#fff",padding:"7px 14px",fontSize:12}}>
                            {sendingMsg===d.id?"⏳ Writing...":"✨ Generate SMS"}
                          </button>
                        </div>
                      </div>
                      {msg?(
                        <div style={{background:"#0a1628",borderRadius:9,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                          <div>
                            <div style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Preview</div>
                            <div style={{fontSize:13,color:"#e2e8f0",lineHeight:1.6}}>{msg}</div>
                            <div style={{fontSize:10,color:msg.length>150?"#f59e0b":"#475569",marginTop:4}}>{msg.length}/160 chars</div>
                          </div>
                          <button className="btn" onClick={()=>setMsgSent(p=>({...p,[d.id]:true}))}
                            style={{background:sent?"#052e16":"#1e2d3d",color:sent?"#4ade80":"#94a3b8",padding:"7px 14px",fontSize:12,flexShrink:0}}>
                            {sent?"✓ Sent":"📤 Send"}
                          </button>
                        </div>
                      ):(
                        <div style={{background:"#0a1628",borderRadius:9,padding:"12px 16px",fontSize:12,color:"#334155",fontStyle:"italic"}}>Click "Generate SMS" to write a message.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TEAM */}
        {tab==="team"&&(
          <div className="fade-in">
            <div style={{...S.card,padding:"22px 26px",marginBottom:24,borderColor:"#1e3a5f"}}>
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:18}}>➕ Add New Employee</div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,marginBottom:14}}>
                <div><div style={{fontSize:11,color:"#475569",marginBottom:5}}>Full Name</div><input value={newEmp.name} onChange={e=>setNewEmp(p=>({...p,name:e.target.value}))} placeholder="e.g. Maria Lopez" style={S.input}/></div>
                <div><div style={{fontSize:11,color:"#475569",marginBottom:5}}>Role</div><select value={newEmp.role} onChange={e=>setNewEmp(p=>({...p,role:e.target.value}))} style={S.select}>{ROLES.map(r=><option key={r}>{r}</option>)}</select></div>
                <div><div style={{fontSize:11,color:"#475569",marginBottom:5}}>Language</div><select value={newEmp.lang} onChange={e=>setNewEmp(p=>({...p,lang:e.target.value}))} style={S.select}><option value="en">English 🇺🇸</option><option value="es">Spanish 🇲🇽</option></select></div>
              </div>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,color:"#475569",marginBottom:8}}>Work Days</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {ALL_DAYS.map(d=>(
                    <label key={d} style={{fontSize:12,cursor:"pointer",padding:"5px 12px",borderRadius:6,background:newEmp.workdays.includes(d)?"#0c2340":"#1e2d3d",color:newEmp.workdays.includes(d)?"#60a5fa":"#64748b",border:`1px solid ${newEmp.workdays.includes(d)?"#3b82f6":"#1e2d3d"}`}}>
                      <input type="checkbox" checked={newEmp.workdays.includes(d)} onChange={e=>setNewEmp(p=>({...p,workdays:e.target.checked?[...p.workdays,d]:p.workdays.filter(x=>x!==d)}))} style={{display:"none"}}/>{d}
                    </label>
                  ))}
                </div>
              </div>
              <button className="btn" onClick={addEmployee} style={{background:"linear-gradient(135deg,#059669,#047857)",color:"#fff",padding:"10px 22px",fontSize:13}}>➕ Add to Team</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
              {employees.map(emp=>(
                <div key={emp.id} style={{...S.card,padding:"18px 22px",display:"flex",alignItems:"flex-start",gap:14}}>
                  <div style={{width:44,height:44,borderRadius:"50%",background:avatarBg(emp),display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#fff",flexShrink:0}}>{emp.avatar}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>{emp.name}{(emp.is_manager||emp.isManager)?" 👑":""}{emp.lang==="es"?" 🇲🇽":""}</div>
                    <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{emp.role}</div>
                    <div style={{display:"flex",gap:5,marginTop:8,flexWrap:"wrap"}}>
                      {(emp.workdays||[]).map(d=><span key={d} style={{fontSize:10,background:"#0c2340",color:"#60a5fa",borderRadius:4,padding:"2px 7px",fontWeight:600}}>{d}</span>)}
                    </div>
                  </div>
                  {!(emp.is_manager||emp.isManager)?(
                    confirmDelete===emp.id?(
                      <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
                        <div style={{fontSize:11,color:"#f87171"}}>Remove?</div>
                        <div style={{display:"flex",gap:6}}>
                          <button className="btn" onClick={async()=>{await sb.from("employees").delete().eq("id",emp.id);setEmployees(p=>p.filter(e=>e.id!==emp.id));setConfirmDelete(null);}} style={{background:"#dc2626",color:"#fff",padding:"5px 12px",fontSize:11}}>Yes</button>
                          <button className="btn" onClick={()=>setConfirmDelete(null)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"5px 12px",fontSize:11}}>Cancel</button>
                        </div>
                      </div>
                    ):(
                      <button className="btn" onClick={()=>setConfirmDelete(emp.id)} style={{background:"#1e2d3d",color:"#64748b",padding:"7px 12px",fontSize:12,flexShrink:0}}>✕ Remove</button>
                    )
                  ):(
                    <span style={{fontSize:11,color:"#7c3aed",background:"#1e1038",borderRadius:6,padding:"5px 10px",flexShrink:0,fontWeight:600}}>Owner</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EDIT TASK TEMPLATES */}
        {tab==="basetasks"&&(
          <div className="fade-in">
            <div style={{marginBottom:16,fontSize:13,color:"#94a3b8"}}>These tasks appear on every employee's list on the matching days. Edit, delete, or add new ones here.</div>
            {["en","es"].map(lang=>(
              <div key={lang} style={{marginBottom:28}}>
                <div style={{...S.label}}>{lang==="en"?"🇺🇸 English Templates":"🇲🇽 Spanish Templates (Ricky & Alberto)"}</div>
                <div style={{...S.card,overflow:"hidden",marginBottom:12}}>
                  {baseTasks[lang].map((task,i)=>(
                    <div key={task.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 20px",borderBottom:i<baseTasks[lang].length-1?"1px solid #0f1923":"none"}}>
                      <div style={{width:7,height:7,borderRadius:"50%",background:task.priority==="high"?"#ef4444":task.priority==="med"?"#f59e0b":"#475569",marginTop:5,flexShrink:0}}/>
                      <div style={{flex:1}}>
                        {editingBaseTask&&editingBaseTask.id===task.id&&editingBaseTask.lang===lang?(
                          <div style={{display:"flex",gap:8}}>
                            <input value={editBaseTaskVal} onChange={e=>setEditBaseTaskVal(e.target.value)}
                              style={{flex:1,background:"#0a1628",border:"1px solid #3b82f6",borderRadius:6,padding:"6px 10px",fontSize:13,color:"#e2e8f0"}}/>
                            <button className="btn" onClick={()=>{setBaseTasks(prev=>({...prev,[lang]:prev[lang].map(t=>t.id===task.id?{...t,text:editBaseTaskVal}:t)}));setEditingBaseTask(null);}}
                              style={{background:"#1d4ed8",color:"#fff",padding:"5px 12px",fontSize:12}}>Save</button>
                            <button className="btn" onClick={()=>setEditingBaseTask(null)} style={{background:"#1e2d3d",color:"#94a3b8",padding:"5px 10px",fontSize:12}}>✕</button>
                          </div>
                        ):(
                          <div style={{fontSize:13,color:"#e2e8f0"}}>{task.text}</div>
                        )}
                        <div style={{display:"flex",gap:5,marginTop:5,flexWrap:"wrap"}}>
                          <span style={{fontSize:10,background:"#1e2d3d",color:"#94a3b8",borderRadius:4,padding:"2px 6px"}}>{task.category}</span>
                          {task.days.map(d=><span key={d} style={{fontSize:10,background:"#0c2340",color:"#60a5fa",borderRadius:4,padding:"2px 6px"}}>{d}</span>)}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:5,flexShrink:0}}>
                        <button className="btn" onClick={()=>{setEditingBaseTask({id:task.id,lang});setEditBaseTaskVal(task.text);}} style={{background:"#1e2d3d",color:"#60a5fa",padding:"4px 9px",fontSize:11}}>Edit</button>
                        <button className="btn" onClick={()=>setBaseTasks(prev=>({...prev,[lang]:prev[lang].filter(t=>t.id!==task.id)}))} style={{background:"#2d0a0a",color:"#f87171",padding:"4px 9px",fontSize:11}}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                <AddBaseTaskRow lang={lang} setBaseTasks={setBaseTasks} S={S}/>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
