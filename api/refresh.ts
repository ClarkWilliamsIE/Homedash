export default async function handler(req, res) {
  // Grab the hidden cookie
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/refresh_token=([^;]+)/);
  const refresh_token = match ? match[1] : null;

  if (!refresh_token) return res.status(401).json({ error: 'No refresh token found' });

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refresh_token,
        grant_type: 'refresh_token'
      })
    });
    
    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error("Failed to refresh");

    res.status(200).json({ access_token: tokens.access_token });
  } catch (error) {
    res.status(401).json({ error: 'Refresh failed' });
  }
}
