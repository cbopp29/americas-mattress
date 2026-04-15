exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_PHONE = process.env.TWILIO_PHONE;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Twilio credentials not configured in Netlify environment variables" }),
    };
  }

  try {
    const { to, body } = JSON.parse(event.body);

    if (!to || !body) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing to or body" }) };
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64"),
        },
        body: new URLSearchParams({ From: TWILIO_PHONE, To: to, Body: body }).toString(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: data.message || "Twilio error", code: data.code }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, sid: data.sid }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
