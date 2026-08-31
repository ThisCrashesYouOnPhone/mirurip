interface Env {
  VITE_CLIENT_ID?: string;
  ANILIST_CLIENT_SECRET?: string;
  VITE_CLIENT_SECRET?: string;
  VITE_REDIRECT_URI?: string;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const body: any = await context.request.json().catch(() => ({}));
    const { code } = body;

    if (!code) {
      return new Response(JSON.stringify({ error: 'Authorization code is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = {
      client_id: context.env.VITE_CLIENT_ID,
      client_secret: context.env.ANILIST_CLIENT_SECRET || context.env.VITE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: context.env.VITE_REDIRECT_URI,
    };

    const res = await fetch('https://anilist.co/api/v2/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data: any = await res.json();
    if (data.access_token) {
      return new Response(JSON.stringify({ accessToken: data.access_token }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Failed to exchange token', details: data }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Server error', message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
