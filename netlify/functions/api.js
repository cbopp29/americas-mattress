const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://nmlhuufmvvqvbyoebrwe.supabase.co";
const SUPABASE_KEY = "sb_publishable_TRQCQpgnv0NDRt7eIE6t-Q_fEINezez";
const API_KEY = "Amatt2026MarcusyDev";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Auth check
  const apiKey = event.headers["x-api-key"] || event.queryStringParameters?.key;
  if (apiKey !== API_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized — invalid API key" }) };
  }

  const method = event.httpMethod;
  const path = event.path.replace("/.netlify/functions/api", "").replace(/^\//, "");
  const segments = path.split("/").filter(Boolean);
  const resource = segments[0];
  const id = segments[1];

  try {
    // ── GET — Read data ──────────────────────────────────────────────────────
    if (method === "GET") {
      // Summary / overview
      if (!resource || resource === "summary") {
        const [del, emp, sig, train, comp, liab, prob] = await Promise.all([
          sb.from("deliveries").select("*"),
          sb.from("employees").select("id,name,role,workdays,is_manager,lang"),
          sb.from("signatures").select("*").order("signed_at", { ascending: false }).limit(20),
          sb.from("trainings").select("*").order("created_at", { ascending: false }),
          sb.from("training_completions").select("*"),
          sb.from("liability_forms").select("*").order("signed_at", { ascending: false }).limit(20),
          sb.from("problems").select("*").order("time", { ascending: false }).limit(20),
        ]);

        const today = new Date().toISOString().split("T")[0];
        const todayDels = (del.data || []).filter(d => d.delivery_date === today);
        const delivered = todayDels.filter(d => d.status === "Delivered").length;
        const pending = todayDels.filter(d => d.status === "Scheduled").length;
        const inTransit = todayDels.filter(d => d.status === "In Transit").length;

        return {
          statusCode: 200, headers,
          body: JSON.stringify({
            summary: {
              today: today,
              deliveries_today: todayDels.length,
              delivered_today: delivered,
              pending_today: pending,
              in_transit_today: inTransit,
              total_deliveries: (del.data || []).length,
              total_employees: (emp.data || []).length,
              total_signatures: (sig.data || []).length,
              open_problems: (prob.data || []).filter(p => !p.resolved).length,
            },
            employees: emp.data,
            recent_signatures: sig.data,
            recent_problems: prob.data,
            trainings: train.data,
            training_completions: comp.data,
            recent_liability_forms: liab.data,
          }),
        };
      }

      // Deliveries
      if (resource === "deliveries") {
        if (id) {
          const { data } = await sb.from("deliveries").select("*").eq("id", id).single();
          return { statusCode: 200, headers, body: JSON.stringify(data) };
        }
        const date = event.queryStringParameters?.date;
        const status = event.queryStringParameters?.status;
        const driver = event.queryStringParameters?.driver;
        let query = sb.from("deliveries").select("*").order("stop_order", { ascending: true });
        if (date) query = query.eq("delivery_date", date);
        if (status) query = query.eq("status", status);
        if (driver) query = query.eq("assigned_to", driver);
        const { data } = await query;
        return { statusCode: 200, headers, body: JSON.stringify(data) };
      }

      // Employees
      if (resource === "employees") {
        const { data } = await sb.from("employees").select("id,name,role,workdays,is_manager,lang,avatar");
        return { statusCode: 200, headers, body: JSON.stringify(data) };
      }

      // Signatures
      if (resource === "signatures") {
        const search = event.queryStringParameters?.search;
        let query = sb.from("signatures").select("*").order("signed_at", { ascending: false });
        if (search) query = query.or(`customer.ilike.%${search}%,ticket_number.ilike.%${search}%`);
        const { data } = await query;
        return { statusCode: 200, headers, body: JSON.stringify(data) };
      }

      // Trainings
      if (resource === "trainings") {
        const [train, comp] = await Promise.all([
          sb.from("trainings").select("*").order("created_at", { ascending: false }),
          sb.from("training_completions").select("*"),
        ]);
        return { statusCode: 200, headers, body: JSON.stringify({ trainings: train.data, completions: comp.data }) };
      }

      // Problems
      if (resource === "problems") {
        const { data } = await sb.from("problems").select("*").order("time", { ascending: false });
        return { statusCode: 200, headers, body: JSON.stringify(data) };
      }

      // Liability forms
      if (resource === "liability") {
        const { data } = await sb.from("liability_forms").select("*").order("signed_at", { ascending: false });
        return { statusCode: 200, headers, body: JSON.stringify(data) };
      }

      // Messages
      if (resource === "messages") {
        const deliveryId = event.queryStringParameters?.delivery_id;
        let query = sb.from("messages").select("*").order("created_at", { ascending: false }).limit(50);
        if (deliveryId) query = query.eq("delivery_id", deliveryId);
        const { data } = await query;
        return { statusCode: 200, headers, body: JSON.stringify(data) };
      }

      return { statusCode: 404, headers, body: JSON.stringify({ error: "Unknown resource. Available: summary, deliveries, employees, signatures, trainings, problems, liability, messages" }) };
    }

    // ── POST — Create / Write (requires confirmation) ────────────────────────
    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");

      // Require explicit confirm flag for writes
      if (!body._confirm) {
        return {
          statusCode: 400, headers,
          body: JSON.stringify({
            error: "Write operations require _confirm: true in the request body",
            hint: "Add _confirm: true to confirm you want to make this change",
            resource, data: body,
          }),
        };
      }

      delete body._confirm;

      if (resource === "deliveries") {
        const { data, error } = await sb.from("deliveries").insert(body).select();
        if (error) return { statusCode: 400, headers, body: JSON.stringify({ error: error.message }) };
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
      }

      if (resource === "messages") {
        const { data, error } = await sb.from("messages").insert(body).select();
        if (error) return { statusCode: 400, headers, body: JSON.stringify({ error: error.message }) };
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
      }

      return { statusCode: 400, headers, body: JSON.stringify({ error: "POST not supported for this resource" }) };
    }

    // ── PATCH — Update ───────────────────────────────────────────────────────
    if (method === "PATCH") {
      const body = JSON.parse(event.body || "{}");

      if (!body._confirm) {
        return {
          statusCode: 400, headers,
          body: JSON.stringify({
            error: "Write operations require _confirm: true in the request body",
            resource, id, data: body,
          }),
        };
      }

      delete body._confirm;

      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: "ID required for PATCH" }) };

      if (resource === "deliveries") {
        const { data, error } = await sb.from("deliveries").update(body).eq("id", id).select();
        if (error) return { statusCode: 400, headers, body: JSON.stringify({ error: error.message }) };
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
      }

      if (resource === "employees") {
        const { data, error } = await sb.from("employees").update(body).eq("id", id).select();
        if (error) return { statusCode: 400, headers, body: JSON.stringify({ error: error.message }) };
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
      }

      return { statusCode: 400, headers, body: JSON.stringify({ error: "PATCH not supported for this resource" }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
