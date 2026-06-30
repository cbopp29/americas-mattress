const { createClient } = require("@supabase/supabase-js");

// Server-side PIN check. The browser must NOT be able to read employee PINs
// (the public key is visible to anyone), so login validation happens here using
// the Supabase SERVICE key. We look up the employee, compare the PIN, and return
// the employee record WITHOUT the pin field on success.
exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  }

  try {
    const { empId, pin } = JSON.parse(event.body || "{}");
    if (empId === undefined || empId === null) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Missing employee" }) };
    }

    // Falls back to the publishable key if the service key isn't set yet, so
    // login keeps working before setup is finished. Once SUPABASE_SERVICE_KEY is
    // set in Netlify AND the pin column is revoked from anon, only this function
    // (service key) can read pins — closing the leak.
    const sb = createClient(
      "https://nmlhuufmvvqvbyoebrwe.supabase.co",
      process.env.SUPABASE_SERVICE_KEY || "sb_publishable_TRQCQpgnv0NDRt7eIE6t-Q_fEINezez"
    );

    const { data, error } = await sb.from("employees").select("*").eq("id", empId).single();
    if (error || !data) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false }) };
    }

    const stored = data.pin == null ? "" : String(data.pin);
    // If a PIN is set it must match. Employees with no PIN can sign in freely.
    if (stored && String(pin || "") !== stored) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false }) };
    }

    const { pin: _omit, ...safe } = data;
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, employee: safe }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
