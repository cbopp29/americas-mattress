import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "https://nmlhuufmvvqvbyoebrwe.supabase.co",
  "sb_publishable_TRQCQpgnv0NDRt7eIE6t-Q_fEINezez"
);

export default function InventoryPanel({ who = "", isEs = false }) {
  const [items, setItems] = useState([]);
  const [moves, setMoves] = useState([]);
  const [q, setQ] = useState("");
  const [view, setView] = useState("inv");
  const [ready, setReady] = useState(false);
  const [add, setAdd] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [iR, mR] = await Promise.all([
        sb.from("inventory").select("*"),
        sb.from("stock_moves").select("*").order("id", { ascending: false }).limit(120),
      ]);
      if (!alive) return;
      if (iR.data) setItems(iR.data);
      if (mR.data) setMoves(mR.data);
      setReady(true);
    })();
    const ch = sb.channel("inv-ch")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" },
        () => { sb.from("inventory").select("*").then(({ data }) => { if (data) setItems(data); }); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stock_moves" },
        (p) => { setMoves((prev) => [p.new, ...prev].slice(0, 120)); })
      .subscribe();
    return () => { alive = false; sb.removeChannel(ch); };
  }, []);

  async function bump(it, delta) {
    if (delta < 0 && (it.qty || 0) <= 0) return;
    const nq = Math.max(0, (it.qty || 0) + delta);
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, qty: nq } : x)));
    await sb.from("inventory").update({ qty: nq }).eq("id", it.id);
    const mv = { item_id: it.id, bay: it.bay, name: it.name, size: it.size, dir: delta > 0 ? "IN" : "OUT", qty: Math.abs(delta), moved_by: who || "", moved_at: new Date().toISOString() };
    await sb.from("stock_moves").insert(mv);
    setMoves((prev) => [{ ...mv, id: "t" + Date.now() }, ...prev].slice(0, 120));
  }

  async function saveAdd() {
    const bay = (add.bay || "").trim().toUpperCase();
    const name = (add.name || "").trim();
    const size = (add.size || "").trim().toUpperCase();
    const qty = parseInt(add.qty) || 0;
    const sku = (add.sku || "").trim();
    if (!bay || !name) { alert("Bay and name are required"); return; }
    const ex = items.find((x) => x.bay === bay && (x.name || "").toUpperCase() === name.toUpperCase() && (x.size || "").toUpperCase() === size);
    if (ex) { await bump(ex, qty); }
    else {
      const { data } = await sb.from("inventory").insert({ bay, sku, name, size, qty }).select();
      if (data && data[0]) setItems((prev) => [...prev, data[0]]);
      sb.from("stock_moves").insert({ item_id: data && data[0] && data[0].id, bay, name, size, dir: "IN", qty, moved_by: who || "", moved_at: new Date().toISOString() });
    }
    setAdd(null);
  }

  const baynum = (b) => { const n = (b || "").match(/\d+/); return n ? parseInt(n[0]) : 999; };
  const ql = q.trim().toLowerCase();
  const shown = ql ? items.filter((x) => ((x.name || "") + " " + (x.size || "") + " " + (x.bay || "") + " " + (x.sku || "")).toLowerCase().includes(ql)) : items;
  const groups = {}; shown.forEach((x) => { (groups[x.bay] = groups[x.bay] || []).push(x); });
  const bays = Object.keys(groups).sort((a, b) => baynum(a) - baynum(b) || a.localeCompare(b));
  const S = {
    search: { width: "100%", padding: "11px 13px", borderRadius: 10, border: "1px solid #1e2d3d", background: "#0f1923", color: "#e2e8f0", fontSize: 15, marginBottom: 10, boxSizing: "border-box" },
    tabBtn: (on) => ({ flex: 1, padding: "8px", borderRadius: 9, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: on ? "#2563eb" : "#16202b", color: on ? "#fff" : "#7b8aa0" }),
    bay: { display: "flex", alignItems: "center", gap: 8, margin: "14px 0 6px", fontSize: 12, fontWeight: 800, color: "#7b8aa0", letterSpacing: .5 },
    pill: { background: "#16202b", color: "#e2e8f0", borderRadius: 7, padding: "3px 9px" },
    card: { background: "#0f1923", border: "1px solid #1e2d3d", borderRadius: 12, padding: 11, margin: "7px 0", display: "flex", alignItems: "center", gap: 10 },
    op: (bg) => ({ width: 44, height: 44, borderRadius: 11, border: "none", fontSize: 22, fontWeight: 800, color: "#fff", background: bg, cursor: "pointer" }),
  };
  if (!ready) return <div style={{ padding: 30, textAlign: "center", color: "#475569" }}>Loading inventory…</div>;
  return (
    <div style={{ color: "#e2e8f0" }}>
      <input style={S.search} placeholder={isEs ? "Buscar…" : "Search item, bay, SKU, size…"} value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
        <button style={S.tabBtn(view === "inv")} onClick={() => setView("inv")}>{isEs ? "Inventario" : "Inventory"}</button>
        <button style={S.tabBtn(view === "log")} onClick={() => setView("log")}>{isEs ? "Actividad" : "Activity"}</button>
      </div>
      {view === "inv" && (
        <div>
          {bays.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "#475569" }}>{ql ? "No matches." : "No inventory yet."}</div>}
          {bays.map((bay) => {
            const rows = groups[bay];
            const units = rows.reduce((s, r) => s + (r.qty || 0), 0);
            return (
              <div key={bay}>
                <div style={S.bay}><span style={S.pill}>{bay}</span><span style={{ marginLeft: "auto", fontWeight: 600 }}>{units} {isEs ? "u" : "units"}</span></div>
                {rows.map((r) => (
                  <div key={r.id} style={S.card}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9", lineHeight: 1.2 }}>{r.name || "(no name)"}</div>
                      <div style={{ color: "#7b8aa0", fontSize: 12, marginTop: 2 }}>{r.size || ""}{r.sku ? "  ·  " + r.sku : ""}</div>
                    </div>
                    <div style={{ fontSize: 23, fontWeight: 800, minWidth: 30, textAlign: "center", color: (r.qty || 0) <= 1 ? "#fb7185" : "#e2e8f0" }}>{r.qty || 0}</div>
                    <button style={S.op("#f43f5e")} onClick={() => bump(r, -1)}>−</button>
                    <button style={S.op("#22c55e")} onClick={() => bump(r, 1)}>+</button>
                  </div>
                ))}
              </div>
            );
          })}
          <button onClick={() => setAdd({ bay: "", name: "", size: "", qty: "1", sku: "" })} style={{ width: "100%", marginTop: 14, padding: 13, borderRadius: 11, border: "1px dashed #2b3b4d", background: "#0f1923", color: "#60a5fa", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>+ {isEs ? "Agregar inventario" : "Add stock"}</button>
        </div>
      )}
      {view === "log" && (
        <div>
          {moves.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "#475569" }}>{isEs ? "Sin actividad." : "No activity yet."}</div>}
          {moves.map((m) => (
            <div key={m.id} style={S.card}>
              <span style={{ fontWeight: 800, borderRadius: 7, padding: "2px 8px", fontSize: 11, background: m.dir === "OUT" ? "rgba(244,63,94,.15)" : "rgba(34,197,94,.15)", color: m.dir === "OUT" ? "#fb7185" : "#4ade80" }}>{m.dir}{m.qty > 1 ? " ×" + m.qty : ""}</span>
              <span style={{ fontSize: 13, color: "#e2e8f0", flex: 1 }}>{m.name} <span style={{ color: "#7b8aa0" }}>{m.size}</span> · {m.bay}</span>
              <span style={{ fontSize: 11, color: "#7b8aa0", textAlign: "right" }}>{m.moved_by || ""}<br />{m.moved_at ? new Date(m.moved_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</span>
            </div>
          ))}
        </div>
      )}
      {add && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setAdd(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "#0f1923", border: "1px solid #1e2d3d", borderRadius: "16px 16px 0 0", padding: 16, width: "100%", maxWidth: 520 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#f1f5f9", marginBottom: 12 }}>{isEs ? "Agregar inventario" : "Add stock"}</div>
            {[["bay", "Bay (e.g. 7AR)"], ["name", "Name / model"], ["size", "Size (QUEEN)"], ["sku", "Item # (optional)"]].map(([k, ph]) => (
              <input key={k} placeholder={ph} value={add[k]} onChange={(e) => setAdd({ ...add, [k]: e.target.value })} style={{ ...S.search, marginBottom: 8 }} />
            ))}
            <input placeholder="Qty" inputMode="numeric" value={add.qty} onChange={(e) => setAdd({ ...add, qty: e.target.value })} style={{ ...S.search, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 9 }}>
              <button onClick={() => setAdd(null)} style={{ flex: 1, padding: 13, borderRadius: 11, border: "none", background: "#16202b", color: "#e2e8f0", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Cancel</button>
              <button onClick={saveAdd} style={{ flex: 1, padding: 13, borderRadius: 11, border: "none", background: "#2563eb", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
