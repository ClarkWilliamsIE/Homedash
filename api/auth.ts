export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.body.code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: 'postmessage', // Required for Google's popup flow
        grant_type: 'authorization_code'
      })
    });
    
    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error("Failed to authenticate");

    // Securely store the refresh token in an HttpOnly cookie (expires in 1 year)
    if (tokens.refresh_token) {
      res.setHeader('Set-Cookie', `refresh_token=${tokens.refresh_token}; HttpOnly; Path=/; Max-Age=${60*60*24*365}; Secure; SameSite=Strict`);
    }

    res.status(200).json({ access_token: tokens.access_token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
