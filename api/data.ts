// api/data.ts
import { google } from 'googleapis';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { spreadsheetId, range, values, append } = req.body;

  // Setup Auth using Service Account ENV variables
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    if (append) {
      await sheets.spreadsheets.values.append({
        spreadsheetId, range, valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId, range, valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
