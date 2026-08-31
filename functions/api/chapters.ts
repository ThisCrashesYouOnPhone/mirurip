// functions/api/chapters.ts
// Edge Cloudflare Pages Function: Anime Chapter & Skip Time Resolver
// Supports JSON output and direct WebVTT output (?format=vtt) for Vidstack.

const CHAPTER_TYPES = ['op', 'ed', 'mixed-op', 'mixed-ed', 'recap'];
const ANIME_SKIP_ENDPOINT = 'https://api.anime-skip.com/graphql';
// This is a public API client identifier, not an AniList access token.
const ANIME_SKIP_CLIENT_ID = 'ZGfO0sMF3eCwLYf8yMSCJjlynwNGRXWE';

const CORS_JSON = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=1800',
};

const CORS_VTT = {
  'Content-Type': 'text/vtt; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=1800',
};

function formatVttTimestamp(seconds: number): string {
  const totalMs = Math.round(Math.max(0, seconds) * 1000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const wholeSecs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${wholeSecs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function synthesizeSeanimeVtt(results: any[], duration: number, title: string = 'Anime', ep: string = '1'): string {
  const effectiveDuration = duration > 0 ? duration : 1440;
  const clamp = (t: number) => Math.min(effectiveDuration, Math.max(0, t));

  const op = results.find((r: any) => r.skipType === 'op' || r.skipType === 'mixed-op');
  const ed = results.find((r: any) => r.skipType === 'ed' || r.skipType === 'mixed-ed');
  const recap = results.find((r: any) => r.skipType === 'recap');

  const cues: Array<{ start: number; end: number; text: string }> = [];

  // 1. Recap (if near beginning)
  if (recap?.interval && recap.interval.startTime < 10) {
    const rStart = clamp(recap.interval.startTime);
    const rEnd = clamp(recap.interval.endTime);
    if (rEnd > rStart) {
      cues.push({ start: rStart, end: rEnd, text: 'Recap' });
    }
  }

  // 2. Opening
  if (op?.interval) {
    const opStart = clamp(op.interval.startTime);
    const opEnd = clamp(op.interval.endTime);
    const prevEnd = cues.length > 0 ? cues[cues.length - 1].end : 0;
    if (opStart > prevEnd + 5) {
      cues.push({ start: prevEnd, end: opStart, text: 'Prologue' });
    }
    if (opEnd > opStart) {
      cues.push({ start: opStart, end: opEnd, text: op.skipType === 'mixed-op' ? 'Mixed Opening' : 'Opening' });
    }
  }

  // 3. Main Episode Content
  const prevEnd = cues.length > 0 ? cues[cues.length - 1].end : 0;
  const edStart = ed?.interval ? clamp(ed.interval.startTime) : effectiveDuration;
  if (edStart > prevEnd + 5) {
    cues.push({ start: prevEnd, end: edStart, text: 'Episode' });
  }

  // 4. Ending
  if (ed?.interval) {
    const edStartClamped = clamp(ed.interval.startTime);
    const edEndClamped = clamp(ed.interval.endTime);
    if (edEndClamped > edStartClamped) {
      cues.push({ start: edStartClamped, end: edEndClamped, text: ed.skipType === 'mixed-ed' ? 'Mixed Ending' : 'Ending' });
      // 5. Preview / Epilogue
      if (edEndClamped < effectiveDuration - 5) {
        const remaining = effectiveDuration - edEndClamped;
        cues.push({ start: edEndClamped, end: effectiveDuration, text: remaining <= 45 ? 'Preview' : 'Epilogue' });
      }
    }
  }

  if (cues.length === 0) {
    cues.push({ start: 0, end: effectiveDuration, text: `${title} - Episode ${ep}` });
  }

  let vtt = 'WEBVTT\n\n';
  cues.forEach((cue, index) => {
    vtt += `${index + 1}\n`;
    vtt += `${formatVttTimestamp(cue.start)} --> ${formatVttTimestamp(cue.end)}\n`;
    vtt += `${cue.text}\n\n`;
  });
  return vtt;
}

function animeSkipTimestampsToResults(episodes: any[], episodeNumber: string, duration: number) {
  const candidates = episodes
    .filter((episode) => String(episode?.number ?? '') === String(episodeNumber))
    .filter((episode) => Array.isArray(episode?.timestamps) && episode.timestamps.length > 0)
    .map((episode) => {
      const timestamps = episode.timestamps
        .map((timestamp: any) => ({
          at: Number(timestamp?.at),
          name: String(timestamp?.type?.name || ''),
        }))
        .filter((timestamp: any) => Number.isFinite(timestamp.at) && timestamp.at >= 0)
        .sort((a: any, b: any) => a.at - b.at);
      const names = timestamps.map((timestamp: any) => timestamp.name.toLowerCase());
      const hasOpening = names.some((name: string) => /intro|opening/.test(name));
      const hasEnding = names.some((name: string) => /credits|ending/.test(name));
      return { timestamps, score: (hasOpening ? 2 : 0) + (hasEnding ? 2 : 0) + timestamps.length / 100 };
    })
    .sort((a: any, b: any) => b.score - a.score);

  const selected = candidates[0];
  if (!selected) return [];

  const results: any[] = [];
  selected.timestamps.forEach((timestamp: any, index: number) => {
    const name = timestamp.name.toLowerCase();
    const nextAt = selected.timestamps[index + 1]?.at;
    const endTime = Number.isFinite(nextAt) ? nextAt : duration;
    let skipType = '';
    if (/intro|opening/.test(name)) skipType = 'op';
    else if (/credits|ending/.test(name)) skipType = 'ed';
    else if (/recap/.test(name)) skipType = 'recap';
    if (skipType && endTime > timestamp.at) {
      results.push({
        interval: { startTime: timestamp.at, endTime },
        skipType,
        episodeLength: duration || undefined,
      });
    }
  });
  return results;
}

async function fetchAnimeSkipResults(anilistId: string, episode: string, duration: number) {
  if (!/^\d+$/.test(anilistId)) return [];
  const query = `query { findShowsByExternalId(service: ANILIST, serviceId: "${anilistId}") { episodes { number timestamps { at type { name } } } } }`;
  try {
    const response = await fetch(ANIME_SKIP_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Client-ID': ANIME_SKIP_CLIENT_ID,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return [];
    const data: any = await response.json();
    const shows = Array.isArray(data?.data?.findShowsByExternalId)
      ? data.data.findShowsByExternalId
      : [];
    return animeSkipTimestampsToResults(
      shows.flatMap((show: any) => Array.isArray(show?.episodes) ? show.episodes : []),
      episode,
      duration,
    );
  } catch {
    return [];
  }
}

export async function onRequestGet(context: { request: Request }) {
  const requestUrl = new URL(context.request.url);
  const malId = requestUrl.searchParams.get('malId') || '';
  const anilistId = requestUrl.searchParams.get('anilistId') || '';
  const episode = requestUrl.searchParams.get('episode') || '1';
  const episodeLength = parseFloat(requestUrl.searchParams.get('episodeLength') || '0');
  const format = requestUrl.searchParams.get('format') || 'json';
  const title = requestUrl.searchParams.get('title') || 'Anime';

  let results: any[] = [];
  let found = false;

  // Anime Skip is AniList-ID based and currently provides richer section
  // markers than the legacy AniSkip service. Use it first when available.
  results = await fetchAnimeSkipResults(anilistId, episode, episodeLength);
  found = results.length > 0;

  if (!found && malId && /^\d+$/.test(malId)) {
    const upstreamUrls: URL[] = [];

    // The standalone ani-skip project uses this legacy v1 contract. Keep it
    // first for compatibility, then try the documented v2 richer request.
    const legacyUrl = new URL(`https://api.aniskip.com/v1/skip-times/${malId}/${episode}`);
    legacyUrl.searchParams.append('types', 'op');
    legacyUrl.searchParams.append('types', 'ed');
    upstreamUrls.push(legacyUrl);

    const v2Url = new URL(`https://api.aniskip.com/v2/skip-times/${malId}/${episode}/`);
    if (episodeLength > 0) v2Url.searchParams.set('episodeLength', episodeLength.toString());
    CHAPTER_TYPES.forEach((type) => v2Url.searchParams.append('types', type));
    upstreamUrls.push(v2Url);

    for (const upstreamUrl of upstreamUrls) {
      try {
        const upstream = await fetch(upstreamUrl.toString(), {
          headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(4000),
        });
        if (!upstream.ok) continue;
        const data: any = await upstream.json();
        if (data.found && Array.isArray(data.results)) {
          results = data.results;
          found = true;
          break;
        }
      } catch {
        // Try the next compatible AniSkip contract.
      }
    }
  }

  const vttText = synthesizeSeanimeVtt(results, episodeLength, title, episode);

  if (format === 'vtt') {
    return new Response(vttText, { status: 200, headers: CORS_VTT });
  }

  return new Response(JSON.stringify({
    found,
    results,
    vtt: vttText,
  }), { status: 200, headers: CORS_JSON });
}
