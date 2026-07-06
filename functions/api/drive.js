const HUDDLE_FOLDER_ID = '1bp2C0O4mIG7EfwRY40idPsP6WJtYTbMg';

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const claim = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const unsigned = `${header}.${claim}`;
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
    return new Response(JSON.stringify({ ok: false, error: 'Drive not configured' }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
  try {
    const sa = JSON.parse(context.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const body = await context.request.json();
    const { action } = body;
    const token = await getAccessToken(sa);

    let result;

    if (action === 'list') {
      // List CSV files in huddle folder, newest first
      const q = encodeURIComponent(`'${HUDDLE_FOLDER_ID}' in parents and mimeType='text/csv' and trashed=false`);
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime+desc&fields=files(id,name,createdTime,size)&pageSize=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      result = await r.json();

    } else if (action === 'upload') {
      // Upload CSV content to huddle folder
      const { filename, content } = body;
      const metadata = JSON.stringify({ name: filename, parents: [HUDDLE_FOLDER_ID] });
      const boundary = 'drvboundary';
      const body_parts = [
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n`,
        `--${boundary}\r\nContent-Type: text/csv\r\n\r\n${content}\r\n`,
        `--${boundary}--`
      ].join('');
      const r = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: body_parts
        }
      );
      result = await r.json();

    } else if (action === 'download') {
      // Download a file by ID and return its text content
      const { fileId } = body;
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const text = await r.text();
      result = { content: text };

    } else {
      return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
    }

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
