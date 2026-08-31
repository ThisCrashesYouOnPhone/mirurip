// functions/api/stream.ts
// Cloudflare Pages Function: Universal Edge Anime Stream Resolver
// Supports: anikoto (default), anineko, kaa, and anizone

import { resolveAlternateSource } from './alternateSources';
interface Env {}

type SubtitleMode = 'hsub' | 'ssub' | 'dub';

function normalizeSubtitleMode(value: string | null, dub: boolean): SubtitleMode {
  if (value?.toLowerCase() === 'hsub') return 'hsub';
  if (value?.toLowerCase() === 'dub' || dub) return 'dub';
  return 'ssub';
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 12000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const url = new URL(context.request.url);
  const episodeNumber = parseInt(url.searchParams.get('episode') || '1', 10);
  const title = url.searchParams.get('title') || '';
  const provider = url.searchParams.get('provider') || 'anikoto';
  const dub = url.searchParams.get('dub') === 'true';
  const subtitleMode = normalizeSubtitleMode(url.searchParams.get('mode'), dub);
  const anilistId = url.searchParams.get('anilistId') || undefined;

  if (!title) {
    return new Response(JSON.stringify({ error: 'title param required' }), { status: 400, headers: CORS });
  }

  try {
    if (provider === 'anizone') {
      return await resolveAniZone(title, episodeNumber, dub, url, subtitleMode);
    }
    if (provider === 'anikoto' || provider === 'anineko') {
      // Keep the proven AniKoto/AniNeko resolver path for playback. In
      // particular, AniKoto's legacy panels distinguish hsub from ssub;
      // structured catalog APIs do not, so they must not replace this path.
      return await resolveAlternateSource(provider, title, episodeNumber, dub, url, anilistId, subtitleMode);
    }
    if (provider === 'kaa' || provider === 'default') {
      return await resolveKAA(title, episodeNumber, dub, url, subtitleMode);
    }
    throw new Error(`Unknown provider: ${provider}`);
  } catch (err: any) {
    const rawMessage = typeof err?.message === 'string' ? err.message : '';
    const episodeUnavailable = /episode\s+\d+\s+(not found|missing)|episode\s+(not found|missing)/i.test(rawMessage);
    const languageUnavailable = /no\s+(dub|hsub|ssub|softsub|sub)\s+(servers|stream)|language.*(unavailable|not found)/i.test(rawMessage);
    const sourceUnavailable = /no\s+(hls|streaming)\s+(source|servers)|no streaming servers/i.test(rawMessage);
    const code = episodeUnavailable
      ? 'EPISODE_UNAVAILABLE'
      : languageUnavailable
        ? 'LANGUAGE_UNAVAILABLE'
        : sourceUnavailable
          ? 'SOURCE_UNAVAILABLE'
          : 'RESOLVER_ERROR';
    const status = episodeUnavailable || languageUnavailable ? 404 : 502;
    const message = episodeUnavailable
      ? 'This episode is not available from the selected source.'
      : languageUnavailable
        ? `This ${subtitleMode === 'dub' ? 'dub' : subtitleMode} version is not available yet.`
        : 'Cannot play media. Try a different source.';
    return new Response(JSON.stringify({
      error: rawMessage,
      unavailable: {
        code,
        message,
        retryable: !episodeUnavailable && !languageUnavailable,
        provider,
        mode: subtitleMode,
        episode: episodeNumber,
      },
    }), { status, headers: CORS });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// KickAssAnime (KAA) resolver
// ──────────────────────────────────────────────────────────────────────────────
async function resolveKAA(
  title: string,
  episodeNumber: number,
  dub: boolean,
  selfUrl: URL,
  subtitleMode: SubtitleMode = dub ? 'dub' : 'ssub',
) {
  const cleanKeywords = title
    .toLowerCase()
    .replace(/[^\w\s]/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const primaryQuery = cleanKeywords[0] || title;

  // 1. Search
  let results: any[] = [];
  for (const query of [primaryQuery, cleanKeywords.slice(0, 2).join(' ')]) {
    const res = await fetchWithTimeout('https://kaa.lt/api/fsearch', {
      method: 'POST',
      headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/json', 'Referer': 'https://kaa.lt/', 'Origin': 'https://kaa.lt' },
      body: JSON.stringify({ query, page: 1 }),
    });
    const data: any = await res.json();
    results = data.result || [];
    if (results.length > 0) break;
  }

  if (results.length === 0) throw new Error(`KAA: No results for "${primaryQuery}"`);

  // Best-match scoring
  let bestMatch: any = results[0];
  let maxScore = -1;
  for (const r of results) {
    const slug = (r.slug || '').toLowerCase();
    const t = ((r.title || '') + ' ' + (r.title_en || '')).toLowerCase();
    let score = 0;
    for (const kw of cleanKeywords) {
      if (slug.includes(kw) || t.includes(kw)) score += 2;
    }
    if (r.type === 'tv') score += 1;
    if (score > maxScore) { maxScore = score; bestMatch = r; }
  }

  const slug = bestMatch.slug;

  // 2. Episode list & servers for the requested language only. A missing dub
  // must remain a missing dub; never substitute Japanese audio/subtitles.
  const currentLang = dub ? 'en-US' : 'ja-JP';
  let episodes: any[] = [];
  let servers: any[] = [];
  let epSlug = '';
  let epStr = episodeNumber.toString();

  // Try primary language
  const res = await fetchWithTimeout(`https://kaa.lt/api/show/${slug}/episodes?ep=${episodeNumber}&lang=${currentLang}&page=1`, {
    headers: { ...BROWSER_HEADERS, 'Referer': 'https://kaa.lt/', 'Origin': 'https://kaa.lt' },
  });
  let epData: any = await res.json();
  episodes = epData.result || [];

  if (episodes.length > 0) {
    const matchedEp = episodes.find((e: any) => Number(e.episode_number) === episodeNumber) || episodes[0];
    epSlug = matchedEp.slug;
    epStr = matchedEp.episode_string || episodeNumber.toString();

    const epDetailRes = await fetchWithTimeout(`https://kaa.lt/api/show/${slug}/episode/ep-${epStr}-${epSlug}`, {
      headers: { ...BROWSER_HEADERS, 'Referer': 'https://kaa.lt/', 'Origin': 'https://kaa.lt' },
    });
    const epDetailData: any = await epDetailRes.json();
    servers = epDetailData.servers || [];
  }

  if (episodes.length === 0) {
    throw new Error(`KAA: Episode ${episodeNumber} not found`);
  }

  // Prefer VidStreaming (supports ln= language param) or CatStream
  const vidServer = servers.find((s: any) => s.name?.toLowerCase().includes('vidstream'));
  const catServer = servers.find((s: any) => s.name?.toLowerCase().includes('catstream'));
  let chosenServer = vidServer || catServer || servers[0];

  if (!chosenServer?.src) {
    throw new Error(dub ? 'KAA: No dub servers available' : 'KAA: No streaming servers available');
  }

  // For dub: pass ln=en-US if supported
  let playerUrl: string = chosenServer.src;
  if (dub) {
    playerUrl = playerUrl.replace('ln=ja-JP', 'ln=en-US').replace('ln=ja', 'ln=en');
    if (!playerUrl.includes('ln=')) {
      playerUrl += (playerUrl.includes('?') ? '&' : '?') + 'ln=en-US';
    }
  }

  // 4. Extract HLS manifest from player page
  const playerRes = await fetchWithTimeout(playerUrl, {
    headers: {
      'User-Agent': BROWSER_HEADERS['User-Agent'],
      'Referer': 'https://kaa.lt/',
    },
  });
  const playerHtml = await playerRes.text();
  const match = playerHtml.match(/props="([^"]+)"/);
  if (!match) throw new Error('KAA: Failed to parse player manifest');

  const propsStr = match[1].replace(/&quot;/g, '"');
  const props = JSON.parse(propsStr);
  let manifestUrl: string = props.manifest?.[1];
  if (!manifestUrl) throw new Error('KAA: Manifest URL not found');

  if (manifestUrl.startsWith('//')) manifestUrl = 'https:' + manifestUrl;
  else if (!manifestUrl.startsWith('http')) manifestUrl = 'https://' + manifestUrl;

  // Proxy manifest through our own edge to bypass CORS (including dub flag)
  const dubParam = dub ? '&dub=true' : '';
  const proxiedManifestUrl = `${selfUrl.origin}/api/proxy?url=${encodeURIComponent(manifestUrl)}${dubParam}`;

  // Extract all subtitle tracks (VTT and SRT)
  const rawSubs = props.subtitles?.[1] || [];
  const subtitles = subtitleMode === 'ssub' ? rawSubs.map((sub: any) => {
    const subObj = sub?.[1] || sub;
    let src: string = subObj?.src?.[1] || subObj?.src || '';
    if (!src) return null;
    // Normalize malformed URLs (like https:///subbl. -> https://subbl.)
    src = src.replace(/^https?:\/\/\//, 'https://');
    if (src.startsWith('//')) src = 'https:' + src;

    const proxiedSrc = `${selfUrl.origin}/api/proxy?url=${encodeURIComponent(src)}`;
    const lang = subObj?.language?.[1] || subObj?.language || 'en';
    const name = subObj?.name?.[1] || subObj?.name || (lang === 'en' ? 'English' : lang);
    return { url: proxiedSrc, lang, name };
  }).filter(Boolean) : [];
  if (subtitleMode === 'ssub' && subtitles.length === 0) {
    throw new Error(`KAA: no ssub subtitles for episode ${episodeNumber}`);
  }

  return new Response(JSON.stringify({
    sources: [{ url: proxiedManifestUrl, quality: '1080p (Auto)', isM3U8: true }],
    subtitles,
    isDub: dub,
    download: `https://kaa.lt/${slug}/ep-${epStr}-${epSlug}`,
  }), { status: 200, headers: { ...CORS, 'Cache-Control': 'public, max-age=1800' } });
}

// ──────────────────────────────────────────────────────────────────────────────
// AniZone (anizone.to) resolver
// Multi-language HLS streams with soft ASS subtitles via seiryuu.vid-cdn.xyz
// Dub audio is embedded as a separate HLS audio track in the same manifest.
// CORS is locked to anizone.to — manifest & subtitles must be proxied.
// ──────────────────────────────────────────────────────────────────────────────
async function resolveAniZone(
  title: string,
  episodeNumber: number,
  dub: boolean,
  selfUrl: URL,
  subtitleMode: SubtitleMode = dub ? 'dub' : 'ssub',
) {
  const AZ_HEADERS = {
    'User-Agent': BROWSER_HEADERS['User-Agent'],
    'Referer': 'https://anizone.to/',
    'Origin': 'https://anizone.to',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // ── Helper: decode AniZone's double-escaped JSON ──────────────────────────
  // The HTML attribute uses \\u00XX Unicode escapes + \\\/ for slashes.
  // In edge runtime we replicate the browser JSON.parse('...') behaviour.
  function decodeAniZoneJson(raw: string): any {
    // AniZone's HTML contains one or more backslashes before each Unicode
    // escape (for example `\\\\u0022` for a JSON quote). Normalize all of
    // those forms before parsing the resulting JSON.
    const step1 = raw.replace(/\\{1,2}u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    const step2 = step1.replace(/\\+\//g, '/');
    return JSON.parse(step2);
  }

  // ── 1. Search ─────────────────────────────────────────────────────────────
  const searchUrl = `https://anizone.to/anime?search=${encodeURIComponent(title)}`;
  const searchRes = await fetchWithTimeout(searchUrl, { headers: AZ_HEADERS });
  const searchHtml = await searchRes.text();

  // Extract Alpine.js items array from: items: JSON.parse('...')
  const itemsRaw = extractAniZoneJsonArgument(searchHtml, 'items: JSON.parse(');
  let items: any[] = [];
  if (itemsRaw) {
    try {
      items = decodeAniZoneJson(itemsRaw);
    } catch {
      // Fall through to the link-based parser below. AniZone sometimes
      // HTML-escapes or reformats the Alpine payload differently at the edge.
    }
  }
  if (items.length === 0) {
    const seen = new Set<string>();
    for (const match of searchHtml.matchAll(/href=["'](?:https?:\/\/anizone\.to)?\/anime\/([^"'/?#]+)["']/gi)) {
      const slug = match[1];
      if (!seen.has(slug)) {
        seen.add(slug);
        items.push({ slug, main_title: slug.replace(/[-_]+/g, ' ') });
      }
    }
  }
  if (items.length === 0) {
    // Last-resort parser for the escaped Alpine payload. This remains useful
    // when the Worker receives the response with HTML attribute escaping or
    // slightly different whitespace than a normal browser request.
    const seen = new Set<string>();
    for (const match of searchHtml.matchAll(/\\{1,2}u0022slug\\{1,2}u0022:\\{1,2}u0022([^"\\]+)\\{1,2}u0022/gi)) {
      const slug = match[1];
      if (!seen.has(slug)) {
        seen.add(slug);
        items.push({ slug, main_title: slug.replace(/[-_]+/g, ' ') });
      }
    }
  }
  if (items.length === 0) {
    // AniZone blocks requests from some serverless egress IPs with 403. Use
    // the public reader relay for discovery in that case; it exposes the
    // same anime links and the episode snapshot UUID without requiring a
    // browser cookie or clearance token.
    return await resolveAniZoneViaRelay(title, episodeNumber, dub, selfUrl, searchRes.status);
  }
  if (items.length === 0) throw new Error(`AniZone: No results for "${title}"`);

  // ── 2. Score & pick best match ────────────────────────────────────────────
  const cleanTitle = title.toLowerCase();
  const keywords = cleanTitle.split(/\s+/).filter(Boolean);

  let bestSlug = items[0].slug as string;
  let bestScore = -1;
  for (const item of items) {
    const name = ((item.main_title || '') + ' ' + JSON.stringify(item.title_list || {})).toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (name.includes(kw)) score += 2;
    }
    if (item.type === 'TV Series') score += 1;
    if (score > bestScore) { bestScore = score; bestSlug = item.slug; }
  }

  // ── 3. Fetch episode page ─────────────────────────────────────────────────
  const epUrl = `https://anizone.to/anime/${bestSlug}/${episodeNumber}`;
  const epRes = await fetchWithTimeout(epUrl, { headers: AZ_HEADERS });
  const epHtml = await epRes.text();

  // Extract vidstackPlayer(JSON.parse('...')) from x-data attribute
  // Capture the complete JS string, including escaped quotes. A non-greedy
  // `{...}` match breaks as soon as the player payload contains a nested
  // object (which it does for subtitle metadata).
  const playerRaw = extractAniZoneJsonArgument(epHtml, 'vidstackPlayer(JSON.parse(');
  if (!playerRaw) throw new Error(`AniZone: Could not parse player for ep ${episodeNumber}`);

  const playerData = decodeAniZoneJson(playerRaw);
  const masterUrl: string = playerData.src;
  if (!masterUrl || !masterUrl.startsWith('http')) {
    throw new Error('AniZone: Invalid master M3U8 URL: ' + masterUrl);
  }

  // ── 4. Proxy manifest (CORS is locked to anizone.to) ─────────────────────
  const proxiedManifest = `${selfUrl.origin}/api/proxy?url=${encodeURIComponent(masterUrl)}`;

  // ── 5. Build subtitle list ────────────────────────────────────────────────
  // AniZone serves ASS subtitles. We proxy them and expose them.
  // The player will attempt to display them; VTT conversion is handled client-side.
  const rawSubs: any[] = playerData.subtitles || [];
  const subtitles = subtitleMode === 'ssub' ? rawSubs.map((sub: any) => ({
    url: `${selfUrl.origin}/api/proxy?url=${encodeURIComponent(sub.file)}`,
    lang: sub.language,
    name: sub.title,
    format: sub.format || 'ass',
    default: sub.default === true || sub.language === 'en',
  })) : [];
  if (subtitleMode === 'ssub' && subtitles.length === 0) {
    throw new Error(`AniZone: no ssub subtitles for episode ${episodeNumber}`);
  }

  // ── 6. Storyboard & chapters (bonus metadata) ─────────────────────────────
  const storyboard = playerData.storyboard
    ? `${selfUrl.origin}/api/proxy?url=${encodeURIComponent(playerData.storyboard)}`
    : undefined;
  const chapters = playerData.chapter
    ? `${selfUrl.origin}/api/proxy?url=${encodeURIComponent(playerData.chapter)}`
    : undefined;

  // ── 7. Respond ────────────────────────────────────────────────────────────
  // Note: dub audio is a separate HLS audio track in the same manifest.
  // The client player should select the English audio group automatically for dub.
  return new Response(JSON.stringify({
    sources: [{ url: proxiedManifest, quality: '1080p (Auto)', isM3U8: true }],
    subtitles,
    isDub: dub,
    // Pass along dub hint so player can select the right audio track
    audioLanguage: dub ? 'en' : 'ja',
    storyboard,
    chapters,
    download: epUrl,
    provider: 'anizone',
  }), { status: 200, headers: { ...CORS, 'Cache-Control': 'public, max-age=1800' } });
}

// Extract a single-quoted JavaScript string. AniZone terminates these
// arguments with `'),`; using that delimiter also handles the payload's
// escaped backslashes reliably.
function extractAniZoneJsonArgument(source: string, marker: string): string | null {
  const markerStart = source.indexOf(marker);
  const fallbackStart = marker.startsWith('items:')
    ? source.indexOf('items:')
    : source.indexOf('vidstackPlayer(');
  const start = markerStart >= 0 ? markerStart : fallbackStart;
  if (start < 0) return null;
  const quoteStart = source.indexOf("'", start + (markerStart >= 0 ? marker.length : 0));
  if (quoteStart < 0) return null;
  const quoteEnd = source.indexOf("'),", quoteStart + 1);
  return quoteEnd < 0 ? null : source.slice(quoteStart + 1, quoteEnd);
}

async function resolveAniZoneViaRelay(
  title: string,
  episodeNumber: number,
  dub: boolean,
  selfUrl: URL,
  directStatus: number,
) {
  const relayHeaders = {
    'User-Agent': BROWSER_HEADERS['User-Agent'],
    Accept: 'text/plain,text/html;q=0.9,*/*;q=0.8',
  };
  const relaySearchUrl = `https://r.jina.ai/http://anizone.to/anime?search=${encodeURIComponent(title)}`;
  const relaySearchRes = await fetchWithTimeout(relaySearchUrl, { headers: relayHeaders });
  const relaySearch = await relaySearchRes.text();
  if (!relaySearchRes.ok) {
    throw new Error(`AniZone: discovery unavailable (upstream ${directStatus}, relay ${relaySearchRes.status})`);
  }

  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const match of relaySearch.matchAll(/https?:\/\/anizone\.to\/anime\/([A-Za-z0-9_-]+)/gi)) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      slugs.push(match[1]);
    }
  }
  if (slugs.length === 0) throw new Error('AniZone: relay returned no search results');

  const slug = slugs[0];
  const relayEpisodeUrl = `https://r.jina.ai/http://anizone.to/anime/${slug}/${episodeNumber}`;
  const relayEpisodeRes = await fetchWithTimeout(relayEpisodeUrl, { headers: relayHeaders });
  const relayEpisode = await relayEpisodeRes.text();
  if (!relayEpisodeRes.ok) throw new Error(`AniZone: relay episode lookup failed (${relayEpisodeRes.status})`);

  const snapshotMatch = relayEpisode.match(
    /https:\/\/seiryuu\.vid-cdn\.xyz\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/snapshot\.webp/i,
  );
  if (!snapshotMatch) throw new Error(`AniZone: relay episode has no stream snapshot for ep ${episodeNumber}`);

  const streamId = snapshotMatch[1];
  const masterUrl = `https://seiryuu.vid-cdn.xyz/${streamId}/master.m3u8`;
  const proxiedManifest = `${selfUrl.origin}/api/proxy?url=${encodeURIComponent(masterUrl)}${dub ? '&dub=true' : ''}`;

  const chapters = `${selfUrl.origin}/api/proxy?url=${encodeURIComponent(`https://seiryuu.vid-cdn.xyz/${streamId}/chapters.vtt`)}`;
  const storyboard = `${selfUrl.origin}/api/proxy?url=${encodeURIComponent(`https://seiryuu.vid-cdn.xyz/${streamId}/storyboard.vtt`)}`;

  return new Response(JSON.stringify({
    sources: [{ url: proxiedManifest, quality: '1080p (Auto)', isM3U8: true }],
    subtitles: [],
    isDub: dub,
    audioLanguage: dub ? 'en' : 'ja',
    chapters,
    storyboard,
    download: `https://anizone.to/anime/${slug}/${episodeNumber}`,
    provider: 'anizone',
    discovery: 'jina-relay',
  }), { status: 200, headers: { ...CORS, 'Cache-Control': 'public, max-age=900' } });
}
