// netlify/functions/barcode.js
export async function handler(event) {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
  const code = event.queryStringParameters?.code;
  if (!code) return { statusCode: 400, body: 'Missing code' };

  // Open Food Facts API
  const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`;

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Lookup failed');
    const data = await r.json();
    if (data.status !== 1 || !data.product) throw new Error('Not found');
    const p = data.product;
    const name = p.product_name || p.generic_name || 'Unknown product';

    const n = p.nutriments || {};
    let kcalServing = Number(n['energy-kcal_serving']);
    let kcal100g = Number(n['energy-kcal_100g']);
    // If only kJ provided, convert
    if (!kcalServing && Number(n['energy_serving'])) kcalServing = Number(n['energy_serving']) / 4.184;
    if (!kcal100g && Number(n['energy_100g'])) kcal100g = Number(n['energy_100g']) / 4.184;

    // Prefer per serving, fallback to per 100g
    let calories = Math.round(kcalServing || kcal100g || 0);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, calories, brand: p.brands, serving_size: p.serving_size || null })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
