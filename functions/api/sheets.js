async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const claim = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const unsigned = `${header}.${claim}`;

  // Import the private key
  const pemContents = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\n/g, '');
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const encoder = new TextEncoder();
  const sigBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(unsigned));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${unsigned}.${sig}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const d = await r.json();
  return d.access_token;
}

export async function onRequestPost(context) {
  if (!context.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return new Response(JSON.stringify({ ok: false, error: 'Sheets not configured' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
  try {
    const sa = JSON.parse(context.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const { action, sheetId, tab, values, range } = await context.request.json();
    const token = await getAccessToken(sa);
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
    let result;
    if (action === 'append') {
      const r = await fetch(`${base}/values/${encodeURIComponent(tab + '!A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values })
      });
      result = await r.json();
    } else if (action === 'read') {
      const r = await fetch(`${base}/values/${encodeURIComponent(range || tab + '!A:Z')}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      result = await r.json();
    } else if (action === 'write') {
      const r = await fetch(`${base}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ range, values })
      });
      result = await r.json();
    }
    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
