const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const SID = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const PHONE = process.env.TWILIO_PHONE;

  if (!SID || !TOKEN) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Twilio not configured" }) };
  }

  try {
    // Fetch last 50 inbound messages from Twilio
    const auth = Buffer.from(`${SID}:${TOKEN}`).toString("base64");
    const url = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json?Direction=inbound&To=${encodeURIComponent(PHONE)}&PageSize=50`;
    
    const res = await fetch(url, {
      headers: { "Authorization": `Basic ${auth}` }
    });
    
    const data = await res.json();
    
    if (!data.messages) {
      return { statusCode: 200, headers, body: JSON.stringify({ count: 0, messages: [] }) };
    }

    // Save to Supabase
    const sb = createClient(
      "https://nmlhuufmvvqvbyoebrwe.supabase.co",
      process.env.SUPABASE_SERVICE_KEY || "sb_publishable_TRQCQpgnv0NDRt7eIE6t-Q_fEINezez"
    );

    let saved = 0;
    for (const msg of data.messages) {
      // Check if already saved
      const { data: existing } = await sb.from("sms_replies")
        .select("id").eq("message_sid", msg.sid).limit(1);
      
      if (!existing || existing.length === 0) {
        await sb.from("sms_replies").insert({
          id: Date.now() + saved,
          from_number: msg.from,
          to_number: msg.to,
          body: msg.body,
          message_sid: msg.sid,
          received_at: msg.date_created,
          customer_name: "",
          delivery_id: null,
        });
        saved++;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        count: data.messages.length,
        saved,
        messages: data.messages.map(m => ({
          sid: m.sid,
          from: m.from,
          body: m.body,
          date: m.date_created
        }))
      })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
