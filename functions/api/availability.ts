import { getAniKotoAvailability, getKaaAvailability } from './alternateSources';
import { getAniKotoApiAvailability } from './anikotoApi';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400',
};

export async function onRequestGet(context: { request: Request; env: { ANIKOTO_API_BASE?: string } }) {
  const url = new URL(context.request.url);
  const title = (url.searchParams.get('title') || '').trim();
  const anilistId = (url.searchParams.get('anilistId') || '').trim() || undefined;
  if (!title) {
    return new Response(JSON.stringify({ error: 'title query parameter required' }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  try {
    let availability;
    try {
      availability = await getAniKotoApiAvailability(title, anilistId, context.env || {});
    } catch (anikotoError) {
      console.warn('[Availability] Structured AniKoto API check failed, using legacy AniKoto/KAA fallback:', anikotoError);
      try {
        availability = await getAniKotoAvailability(title);
      } catch (legacyError) {
        console.warn('[Availability] Legacy AniKoto check failed, using KAA metadata fallback:', legacyError);
        availability = await getKaaAvailability(title);
      }
    }
    return new Response(JSON.stringify({ ...availability, fetchedAt: Date.now() }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      error: 'Availability unavailable',
      message: error?.message || 'Could not determine AniKoto availability',
    }), { status: 502, headers: CORS_HEADERS });
  }
}
