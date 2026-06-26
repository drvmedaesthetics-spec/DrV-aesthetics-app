const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_TOKEN = 'pit-7f03e79d-b1cc-4a5b-aba1-abd6557dde12';
const GHL_LOCATION = 'AiMDXhFsr9dZJdU4SlRI';

export async function onRequestPost(context) {
  const body = await context.request.json();
  const { action, startTime, endTime, contactId, query } = body;

  const headers = {
    'Authorization': `Bearer ${GHL_TOKEN}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json',
  };

  try {
    let data;

    if (action === 'appointments') {
      const params = new URLSearchParams({ locationId: GHL_LOCATION, startTime, endTime });
      const r = await fetch(`${GHL_BASE}/calendars/events?${params}`, { headers });
      data = await r.json();

    } else if (action === 'contact') {
      const r = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers });
      data = await r.json();

    } else if (action === 'contacts_search') {
      const r = await fetch(`${GHL_BASE}/contacts/?locationId=${GHL_LOCATION}&query=${encodeURIComponent(query||'')}&limit=10`, { headers });
      data = await r.json();

    } else if (action === 'create_contact') {
      const { firstName, lastName, phone, email, tags } = body;
      const r = await fetch(`${GHL_BASE}/contacts/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ locationId: GHL_LOCATION, firstName, lastName, phone, email, tags: tags || ['Zoë Lead'] }),
      });
      data = await r.json();

    } else if (action === 'calendar_slots') {
      const { calendarId, startDate, endDate } = body;
      const params = new URLSearchParams({ startDate, endDate, timezone: 'America/New_York' });
      const r = await fetch(`${GHL_BASE}/calendars/${calendarId}/free-slots?${params}`, { headers });
      data = await r.json();

    } else {
      return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
    }

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
