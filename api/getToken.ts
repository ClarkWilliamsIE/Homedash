export default async function handler(req, res) {
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

    // 3. Send the Google token back to the frontend
    res.status(200).json({ access_token: tokens.access_token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
