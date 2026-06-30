const { createClient } = require("@supabase/supabase-js");

// Turn a Twilio MessageSid into a stable positive integer id so re-fetching
// the same messages never creates duplicate rows (the PK is a number).
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

    // The sms_replies table only has: id, from_number, body, received_at,
    // customer_name, delivery_id. Inserting to_number/message_sid causes
    // every write to fail with PGRST204, which is why the table was empty.
    // We derive a stable id from the Twilio SID and upsert so re-fetching
    // is idempotent (no duplicates) without needing a message_sid column.
    let saved = 0;
    for (const msg of data.messages) {
      const rowId = sidToId(msg.sid);
      const { data: existing } = await sb.from("sms_replies")
        .select("id").eq("id", rowId).limit(1);

      if (!existing || existing.length === 0) {
        const { error: insErr } = await sb.from("sms_replies").insert({
          id: rowId,
          from_number: msg.from,
          body: msg.body,
          received_at: msg.date_created,
          customer_name: "",
          delivery_id: null,
        });
        if (!insErr) saved++;
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
