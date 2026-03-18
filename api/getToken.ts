export default async function handler(req, res) {
  try {
    // We use the refresh token saved in your environment variables
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

    res.status(200).json({ access_token: tokens.access_token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
