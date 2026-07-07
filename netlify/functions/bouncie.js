// Server-side proxy for the Bouncie GPS API.
// Bouncie uses OAuth 2.0, so a single "API key" cannot call /vehicles directly.
// The flow (from Bouncie's own API client) is:
//   1) POST client_id + client_secret + authorization code to the token endpoint
//      to get a short-lived access_token.
//   2) GET /vehicles with header  Authorization: <access_token>  (no "Bearer").
// The Bouncie authorization code is reusable, so this runs fresh each request.
// Credentials come from Netlify env vars if set, else from the request body so
// the in-app setup screen keeps working.
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
    const clientId = process.env.BOUNCIE_CLIENT_ID || body.client_id;
    const clientSecret = process.env.BOUNCIE_CLIENT_SECRET || body.client_secret;
    const code = process.env.BOUNCIE_CODE || body.code;
    const redirectUri = process.env.BOUNCIE_REDIRECT_URI || body.redirect_uri || "https://americasmattress.netlify.app";

    if (!clientId || !clientSecret || !code) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing Client ID, Client Secret, or authorization code." }) };
    }

    // 1) Exchange the authorization code for an access token.
    const tokenRes = await fetch("https://auth.bouncie.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    const tokenText = await tokenRes.text();
    let tokenData;
    try { tokenData = JSON.parse(tokenText); } catch (e) { tokenData = {}; }

    if (!tokenRes.ok || !tokenData.access_token) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: "Bouncie authorization failed",
          detail: tokenData.error_description || tokenData.error || tokenText || "No access token returned",
        }),
      };
    }

    // 2) Use the access token to fetch the vehicles.
    const vehRes = await fetch("https://api.bouncie.dev/v1/vehicles", {
      headers: { "Authorization": tokenData.access_token, "Content-Type": "application/json" },
    });

    const vehText = await vehRes.text();
    let vehData;
    try { vehData = JSON.parse(vehText); } catch (e) { vehData = { raw: vehText }; }
    return { statusCode: vehRes.status, headers, body: JSON.stringify(vehData) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
