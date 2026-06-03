const { createClient } = require("@supabase/supabase-js");

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

      // Store in sms_replies table
      await sb.from("sms_replies").insert({
        id: Date.now(),
        from_number: from,
        to_number: to,
        body: body,
        message_sid: messageSid,
        received_at: new Date().toISOString(),
        customer_name: "",
        delivery_id: null,
      });
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
