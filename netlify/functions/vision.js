// netlify/functions/vision.js
// Requires environment variable: OPENAI_API_KEY
import OpenAI from "openai";

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  if (!process.env.OPENAI_API_KEY) {
    return { statusCode: 501, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
  }
  try {
    const { image } = JSON.parse(event.body || '{}');
    if (!image) throw new Error('No image provided');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = [
      { type: "text", text: "You are a nutrition assistant. Identify distinct foods in the photo and estimate calories for each based on the visible portion sizes. If uncertain, make a conservative estimate. Respond as strict JSON matching this schema: {\"items\":[{\"name\":string,\"calories\":number,\"confidence\":number}] , \"total\": number}. Confidence is 0..1." },
      { type: "image_url", image_url: { url: image } }
    ];

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }]
    });

    const content = resp.choices?.[0]?.message?.content || "{}";
    let parsed = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const total = typeof parsed.total === 'number' ? parsed.total : items.reduce((a,b)=>a + Number(b.calories||0), 0);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, total })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
