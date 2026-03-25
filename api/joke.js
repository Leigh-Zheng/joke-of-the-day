const rateLimit = new Map();

const LIMIT = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting by IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimit.get(ip);

  if (entry) {
    if (now - entry.start < WINDOW_MS) {
      if (entry.count >= LIMIT) {
        return res.status(429).json({ error: `Limit reached. You can generate ${LIMIT} jokes per day. Come back tomorrow!` });
      }
      entry.count++;
    } else {
      rateLimit.set(ip, { start: now, count: 1 });
    }
  } else {
    rateLimit.set(ip, { start: now, count: 1 });
  }

  const { word } = req.body;
  if (!word || typeof word !== 'string' || word.trim().length === 0) {
    return res.status(400).json({ error: 'A word is required.' });
  }

  const cleanWord = word.trim().slice(0, 40);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: 'You are a witty comedian. When given a word, write a single short joke (setup + punchline) that cleverly incorporates that word. Keep it clean, clever, and under 3 sentences. Return ONLY the joke text, nothing else.',
        messages: [{ role: 'user', content: `Word: "${cleanWord}"` }],
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Anthropic API error');

    const joke = data.content?.[0]?.text?.trim();
    if (!joke) throw new Error('No joke returned');

    return res.status(200).json({ joke });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Something went wrong. Try again!' });
  }
}
