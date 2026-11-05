// AI-Sana: Netlify Function (ЖИ прокси). Кілтті Netlify-дағы Environment variables ішіне ANTHROPIC_API_KEY ретінде қойыңыз.
const MODEL = process.env.MODEL || 'claude-sonnet-5-5';
const LIMIT = Number(process.env.RATE_LIMIT || 30); // бір IP-ге 10 минутта
const hits = new Map();
const limited = ip => {
  const now = Date.now(), a = (hits.get(ip) || []).filter(x => now - x < 600000);
  a.push(now); hits.set(ip, a); return a.length > LIMIT;
};
const send = (code, obj) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return send(405, { error: 'POST қажет' });
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return send(500, { error: 'ANTHROPIC_API_KEY орнатылмаған' });
  if (limited(event.headers['x-nf-client-connection-ip'] || 'unknown')) return send(429, { error: 'Сұраныс тым көп, сәл күтіңіз' });
  try {
    const { system, messages } = JSON.parse(event.body || '{}');
    const msgs = (Array.isArray(messages) ? messages : []).slice(-20)
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
    if (!msgs.length) return send(400, { error: 'messages бос' });
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 800, system: String(system || '').slice(0, 2000), messages: msgs })
    });
    const d = await r.json();
    if (!r.ok) return send(502, { error: (d.error && d.error.message) || 'API қатесі' });
    return send(200, { reply: (d.content || []).map(c => c.text || '').join('\n').trim() });
  } catch (e) { return send(400, { error: 'қате сұраныс' }); }
};
