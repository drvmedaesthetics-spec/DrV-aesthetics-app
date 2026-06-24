const crypto = require('crypto');

async function getAccessToken() {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  })).toString('base64url');
  const unsigned = `${header}.${claim}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const sig = sign.sign(sa.private_key, 'base64url');
  const jwt = `${unsigned}.${sig}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const d = await r.json();
  return d.access_token;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Sheets not configured' }) };
  try {
    const { action, sheetId, tab, values, range } = JSON.parse(event.body);
    const token = await getAccessToken();
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
    let result;
    if (action === 'append') {
      const r = await fetch(`${base}/values/${encodeURIComponent(tab + '!A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values })
      });
      result = await r.json();
    } else if (action === 'read') {
      const r = await fetch(`${base}/values/${encodeURIComponent(range || tab + '!A:Z')}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      result = await r.json();
    }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, result }) };
  } catch (err) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
