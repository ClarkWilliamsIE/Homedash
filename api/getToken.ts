// Lets the Homedash panel inside Home Assistant (kitchen iPad, home network) call this API.
// Add more allowed sites with the ALLOWED_ORIGINS environment variable (comma-separated).
const HOME_ORIGIN = /^https?:\/\/(homeassistant\.local|[a-z0-9-]+\.local|localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
const NABU_CASA = /^https:\/\/[a-z0-9]+\.ui\.nabu\.casa$/;

function applyCors(req: any, res: any): boolean {
  const origin: string | undefined = req.headers?.origin;
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (origin && (HOME_ORIGIN.test(origin) || NABU_CASA.test(origin) || extra.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  // Allow the Home Assistant panel (kitchen iPad) to call this from your home network
  if (applyCors(req, res)) return;

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Check if the PIN sent from the frontend matches your secure environment variable
  const { pin } = req.body;
  if (pin !== process.env.FAMILY_PIN) {
    return res.status(401).json({ error: 'Incorrect PIN' });
  }

  // 2. If the PIN is correct, fetch the Google Token
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token'
      })
    });

    const tokens = await response.json();

    if (!tokens.access_token) {
      throw new Error("Failed to get access token");
    }

    // 3. Send the Google token back to the frontend, plus (if set up) how to reach Home Assistant
    // through Tailscale, so the phone app can show the lights and music when it's reachable.
    res.status(200).json({
      access_token: tokens.access_token,
      ...(process.env.HA_URL && process.env.HA_TOKEN ? { ha_url: process.env.HA_URL, ha_token: process.env.HA_TOKEN } : {}),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
