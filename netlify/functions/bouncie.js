// Server-side proxy for the Bouncie GPS API.
// The browser cannot call api.bouncie.dev directly (CORS is blocked), so the
// frontend POSTs the API key here and this function makes the request from the
// server, then returns the vehicle data. Prefers a BOUNCIE_API_KEY set in the
// Netlify environment; falls back to a key supplied in the request body so the
// existing "enter your key" UI keeps working.
exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const key = process.env.BOUNCIE_API_KEY || body.key;
    if (!key) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing Bouncie API key" }) };
    }

    const res = await fetch("https://api.bouncie.dev/v1/vehicles", {
      headers: { "Authorization": key, "Content-Type": "application/json" },
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
    return { statusCode: res.status, headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
