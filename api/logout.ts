export default function handler(req, res) {
  // Clear the secure cookie
  res.setHeader('Set-Cookie', `refresh_token=; HttpOnly; Path=/; Max-Age=0; Secure; SameSite=Strict`);
  res.status(200).json({ success: true });
}
