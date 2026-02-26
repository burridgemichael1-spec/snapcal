function runRconCommand({ host, port, password, command, timeoutMs = 7000 }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${host}:${port}/${password}`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('RCON timeout'));
    }, timeoutMs);

    ws.onopen = () => {
      ws.send(JSON.stringify({ Identifier: 1, Message: command, Name: 'WebRcon' }));
    };

    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Unable to connect to RCON endpoint'));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        if (typeof data.Message === 'string') {
          clearTimeout(timer);
          ws.close();
          resolve(data.Message);
        }
      } catch {
        clearTimeout(timer);
        ws.close();
        resolve(event.data?.toString?.() || '');
      }
    };
  });
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const { host, port, password, command } = JSON.parse(event.body || '{}');
    if (!host || !password || !command) return { statusCode: 400, body: JSON.stringify({ error: 'host, password, and command are required' }) };

    const output = await runRconCommand({ host, port: Number(port || 28016), password, command });
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ output }) };
  } catch (error) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: error.message }) };
  }
}
