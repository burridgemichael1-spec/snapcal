export async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const { feed, plugins = [] } = JSON.parse(event.body || '{}');
    let latest = {};

    if (feed) {
      const resp = await fetch(feed, { headers: { 'Accept': 'application/json' } });
      if (!resp.ok) throw new Error(`Feed request failed (${resp.status})`);
      const body = await resp.json();
      latest = Array.isArray(body)
        ? Object.fromEntries(body.map((x) => [x.name?.toLowerCase(), x.version]))
        : body;
    }

    const merged = plugins.map((plugin) => {
      const latestVersion = latest[plugin.name.toLowerCase()] || null;
      return {
        ...plugin,
        latestVersion,
        outdated: latestVersion ? latestVersion !== plugin.currentVersion : false
      };
    });

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plugins: merged }) };
  } catch (error) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: error.message }) };
  }
}
