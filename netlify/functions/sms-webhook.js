const { createClient } = require("@supabase/supabase-js");

// Turn a Twilio MessageSid into a stable positive integer id so the same
// message can never be inserted twice (the table's primary key is a number).
function sidToId(sid) {
  if (!sid) return 0;
  let h = 0;
  for (let i = 0; i < sid.length; i++) {
    h = (h * 31 + sid.charCodeAt(i)) % 1000000000000;
  }
  return h;
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "text/xml",
  };

  // Twilio sends POST with form-encoded body
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // Parse Twilio's form-encoded body
    const params = new URLSearchParams(event.body || "");
    const from = params.get("From") || "";
    const body = params.get("Body") || "";
    const messageSid = params.get("MessageSid") || "";
    const to = params.get("To") || "";

    if (from && body) {
      const sb = createClient(
        "https://nmlhuufmvvqvbyoebrwe.supabase.co",
        process.env.SUPABASE_SERVICE_KEY || "sb_publishable_TRQCQpgnv0NDRt7eIE6t-Q_fEINezez"
      );

      // Store in sms_replies table. Note: the table only has
      // id, from_number, body, received_at, customer_name, delivery_id —
      // do NOT send to_number/message_sid or the insert fails (PGRST204).
      // Derive a stable id from the Twilio MessageSid so re-delivered
      // webhooks don't create duplicates.
      await sb.from("sms_replies").upsert({
        id: sidToId(messageSid) || Date.now(),
        from_number: from,
        body: body,
        received_at: new Date().toISOString(),
        customer_name: "",
        delivery_id: null,
      }, { onConflict: "id", ignoreDuplicates: true });
    }

    // Respond with empty TwiML so Twilio doesn't send an auto-reply
    return {
      statusCode: 200,
      headers,
      body: `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    };
  } catch (err) {
    console.error("Webhook error:", err);
    return {
      statusCode: 200,
      headers,
      body: `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    };
  }
};
