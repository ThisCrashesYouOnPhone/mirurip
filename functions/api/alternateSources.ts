const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/133.0.0.0 Safari/537.36';

type Source = {
  url: string;
  quality: string;
  isM3U8: boolean;
  server?: string;
};

type SourceResponse = {
  sources: Source[];
  subtitles?: Array<{ url: string; lang: string; name: string }>;
  skipTimes?: Array<{
    interval: { startTime: number; endTime: number };
    skipType: 'op' | 'ed';
  }>;
  download?: string;
  isDub: boolean;
};

type SubtitleMode = 'hsub' | 'ssub' | 'dub';

/**
 * AniKoto's legacy server-list endpoint currently labels its caption stream
 * `sub` even though the resolved MegaPlay response contains VTT tracks. Keep
 * that provider label separate from Miruro's user-facing modes: H-Sub uses
 * the same video without attaching external captions, while S-Sub attaches
 * the returned VTT tracks.
 */
export function selectAniKotoPanelType(panelTypes: string[], mode: SubtitleMode): string | undefined {
  const normalizedTypes = panelTypes.map((type) => type.trim().toLowerCase());
  const preferredTypes = mode === 'dub'
    ? ['dub', 'dub-1']
    : mode === 'hsub'
      ? ['hsub', 'hsub-1', 'sub', 'sub-1']
      : ['softsub', 'softsub-1', 'ssub', 'ssub-1', 'sub', 'sub-1'];

  return preferredTypes.find((type) => normalizedTypes.includes(type));
}

const HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchWithTimeout(target: string, init: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(target, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getText(target: string, extra: Record<string, string> = {}): Promise<string> {
  const response = await fetchWithTimeout(target, { headers: { ...HEADERS, ...extra } });
  if (!response.ok) throw new Error(`Upstream HTTP ${response.status}: ${new URL(target).hostname}`);
  return response.text();
}

async function getJson<T>(target: string, extra: Record<string, string> = {}): Promise<T> {
  const response = await fetchWithTimeout(target, {
    headers: { ...HEADERS, Accept: 'application/json,*/*', ...extra },
  });
  if (!response.ok) throw new Error(`Upstream HTTP ${response.status}: ${new URL(target).hostname}`);
  return response.json() as Promise<T>;
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function proxied(selfUrl: URL, target: string, referer: string): string {
  return `${selfUrl.origin}/api/proxy?url=${encodeURIComponent(target)}&referer=${encodeURIComponent(referer)}`;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function extractMegaPlaySkipTimes(data: {
  intro?: { start?: number; end?: number } | [number, number];
  outro?: { start?: number; end?: number } | [number, number];
}) {
  const skipTimes: SourceResponse['skipTimes'] = [];
  const add = (
    part: { start?: number; end?: number } | [number, number] | undefined,
    skipType: 'op' | 'ed',
  ) => {
    const startTime = Number(Array.isArray(part) ? part[0] : part?.start);
    const endTime = Number(Array.isArray(part) ? part[1] : part?.end);
    if (Number.isFinite(startTime) && Number.isFinite(endTime) && endTime > startTime && startTime >= 0) {
      skipTimes.push({ interval: { startTime, endTime }, skipType });
    }
  };
  add(data.intro, 'op');
  add(data.outro, 'ed');
  return skipTimes;
}

// ──────────────────────────────────────────────────────────────────────────────
// AniKoto
// ──────────────────────────────────────────────────────────────────────────────
const ANIKOTO = 'https://anikototv.to';
const ANIKOTO_SPOOF_REFERER = 'https://hianimes.re/';

export interface AniKotoAvailability {
  sub: number;
  dub: number;
  source: 'anikoto' | 'kaa';
}

async function findAniKotoShow(title: string): Promise<{ slug: string; id: string; title: string }> {
  const queries = [...new Set([title, title.split(/[:|]/)[0].trim(), title.split(/\s+/).slice(0, 3).join(' ')])]
    .filter((query) => query.length >= 3);
  const candidates: Array<{ slug: string; name: string }> = [];

  for (const query of queries) {
    const html = await getText(`${ANIKOTO}/filter?keyword=${encodeURIComponent(query)}`, { Referer: `${ANIKOTO}/` }).catch(() => '');
    for (const match of html.matchAll(/<a\b[^>]*href=["'](?:https?:\/\/anikototv\.to)?\/watch\/([^"'/?]+)[^>]*>([\s\S]*?)<\/a>/gi)) {
      const name = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!candidates.some((candidate) => candidate.slug === match[1])) candidates.push({ slug: match[1], name });
    }
  }

  if (!candidates.length) throw new Error(`AniKoto: no results for "${title}"`);
  const wanted = normalized(title);
  candidates.sort((a, b) => {
    const score = (candidate: { slug: string; name: string }) => {
      const value = normalized(candidate.name || '');
      const slug = normalized(candidate.slug);
      let points = 0;
      if (value === wanted) points += 500;
      if (value.includes(wanted) || wanted.includes(value)) points += 100;
      if (slug === wanted) points += 500;
      if (slug.startsWith(wanted)) points += 250;
      if (slug.includes(wanted)) points += 100;
      if (/(ova|movie|final|season|part|junior|regrets|lastattack)/i.test(candidate.slug)) points -= 100;
      return points - slug.length / 1000;
    };
    return score(b) - score(a);
  });

  const chosen = candidates[0];
  const page = await getText(`${ANIKOTO}/watch/${chosen.slug}`, { Referer: `${ANIKOTO}/` });
  const id = page.match(/data-id=["'](\d+)["']/i)?.[1];
  if (!id) throw new Error(`AniKoto: show id missing for ${chosen.slug}`);
  return { slug: chosen.slug, id, title: chosen.name || chosen.slug };
}

async function resolveAniKoto(
  title: string,
  episode: number,
  dub: boolean,
  selfUrl: URL,
  subtitleMode: SubtitleMode = dub ? 'dub' : 'ssub',
): Promise<Response> {
  const show = await findAniKotoShow(title);
  const list = await getJson<{ result?: string }>(`${ANIKOTO}/ajax/episode/list/${show.id}`, {
    'X-Requested-With': 'XMLHttpRequest',
    Referer: `${ANIKOTO}/watch/${show.slug}`,
  });
  const tag = [...(list.result || '').matchAll(/<a\b[^>]*data-num=["'](\d+)["'][^>]*>/gi)]
    .map((match) => match[0])
    .find((value) => Number(value.match(/data-num=["'](\d+)["']/i)?.[1]) === episode);
  if (!tag) throw new Error(`AniKoto: episode ${episode} not found`);

  const ids = tag.match(/data-ids=["']([^"']+)["']/i)?.[1];
  if (!ids) throw new Error(`AniKoto: episode ${episode} has no servers`);
  const serverList = await getJson<{ result?: string }>(`${ANIKOTO}/ajax/server/list?servers=${encodeURIComponent(ids)}`, {
    'X-Requested-With': 'XMLHttpRequest',
    Referer: `${ANIKOTO}/`,
  });
  const panels = [...(serverList.result || '').matchAll(/<div\b[^>]*data-type=["']([^"']+)["'][^>]*>[\s\S]*?<\/div>/gi)];
  const selectedType = selectAniKotoPanelType(panels.map((match) => match[1]), subtitleMode);
  const panel = selectedType
    ? panels.find((match) => match[1].toLowerCase() === selectedType)?.[0] || ''
    : '';
  // The requested Miruro mode, not AniKoto's panel label, is authoritative.
  // AniKoto commonly calls its soft-caption panel simply "sub".
  const attachSoftSubtitles = subtitleMode === 'ssub';
  const linkIds = [...panel.matchAll(/data-link-id=["']([^"']+)["']/gi)].map((match) => match[1]).slice(0, 4);
  if (!linkIds.length) throw new Error(`AniKoto: no ${subtitleMode} servers for episode ${episode}`);

  const sources: Source[] = [];
  const subtitles: Array<{ url: string; lang: string; name: string }> = [];
  const subtitleKeys = new Set<string>();
  const sourceKeys = new Set<string>();
  let skipTimes: SourceResponse['skipTimes'] = [];
  for (const linkId of linkIds) {
    const resolved = linkId.startsWith('http')
      ? { result: { url: linkId } }
      : await getJson<{
        result?: {
          url?: string;
          skip_data?: {
            intro?: [number, number];
            outro?: [number, number];
          };
        };
      }>(`${ANIKOTO}/ajax/server?get=${encodeURIComponent(linkId)}`, {
        'X-Requested-With': 'XMLHttpRequest', Referer: `${ANIKOTO}/`,
      }).catch(() => null);
    const embed = resolved?.result?.url;
    if (!embed) continue;
    if (skipTimes.length === 0 && resolved?.result?.skip_data) {
      skipTimes = extractMegaPlaySkipTimes(resolved.result.skip_data);
    }
    const embedHtml = await getText(embed, { Referer: ANIKOTO_SPOOF_REFERER }).catch(() => '');
    const fileId = embedHtml.match(/data-id=["']([^"']+)["']/i)?.[1];
    if (!fileId) continue;
    const origin = new URL(embed).origin;
    const data = await getJson<{
      sources?: { file?: string };
      tracks?: Array<{ file?: string; label?: string; kind?: string }>;
      intro?: { start?: number; end?: number } | [number, number];
      outro?: { start?: number; end?: number } | [number, number];
    }>(
      `${origin}/stream/getSources?id=${encodeURIComponent(fileId)}`,
      { Referer: `${origin}/`, 'X-Requested-With': 'XMLHttpRequest' },
    ).catch(() => null);
    const hls = data?.sources?.file;
    if (!hls) continue;
    if (skipTimes.length === 0 && data) skipTimes = extractMegaPlaySkipTimes(data);
    for (const track of attachSoftSubtitles ? (data?.tracks || []) : []) {
      if (!track.file || track.kind === 'thumbnails') continue;
      const subtitleKey = `${track.file}|${track.label || ''}`;
      if (subtitleKeys.has(subtitleKey)) continue;
      subtitleKeys.add(subtitleKey);
      subtitles.push({
        url: proxied(selfUrl, track.file, `${origin}/`),
        lang: (track.label || 'English').toLowerCase().startsWith('en') ? 'en' : 'und',
        name: track.label || 'English',
      });
    }
    if (!sourceKeys.has(hls)) {
      sourceKeys.add(hls);
      sources.push({ url: proxied(selfUrl, hls, `${origin}/`), quality: 'auto', isM3U8: true, server: 'AniKoto' });
    }
    // For S-Sub, keep checking the available AniKoto servers until at least
    // one actual external subtitle file was found. A plain HLS response is
    // not a soft-sub response and must not be mislabeled as one.
    if (sources.length >= 2 && (subtitleMode !== 'ssub' || subtitles.length > 0)) break;
  }
  if (!sources.length) throw new Error(`AniKoto: no HLS source for episode ${episode}`);
  if (subtitleMode === 'ssub' && subtitles.length === 0) {
    throw new Error(`AniKoto: no ssub subtitles for episode ${episode}`);
  }
  return jsonResponse({ sources, subtitles, skipTimes, isDub: dub, download: `${ANIKOTO}/watch/${show.slug}`, provider: 'anikoto' });
}

/** Count AniKoto subtitle/dub panels without resolving any media manifests. */
export async function getAniKotoAvailability(title: string): Promise<AniKotoAvailability> {
  const show = await findAniKotoShow(title);
  const list = await getJson<{ result?: string }>(`${ANIKOTO}/ajax/episode/list/${show.id}`, {
    'X-Requested-With': 'XMLHttpRequest',
    Referer: `${ANIKOTO}/watch/${show.slug}`,
  });
  const episodes = new Map<number, string>();
  for (const match of (list.result || '').matchAll(/<a\b[^>]*data-num=["'](\d+)["'][^>]*>/gi)) {
    const number = Number(match[1]);
    const ids = match[0].match(/data-ids=["']([^"']+)["']/i)?.[1];
    if (number > 0 && ids) episodes.set(number, ids);
  }

  let sub = 0;
  let dub = 0;
  let failedRequests = 0;
  const episodeEntries = [...episodes.entries()];
  // Large shows make one server-list request per episode prohibitively slow.
  // The availability route falls back to KAA's paginated language metadata for
  // these titles instead of holding an edge request open for hundreds of calls.
  if (episodeEntries.length > 60) {
    throw new Error('AniKoto availability requires a large-series fallback');
  }
  for (let index = 0; index < episodeEntries.length; index += 4) {
    const batch = episodeEntries.slice(index, index + 4);
    const results = await Promise.all(batch.map(async ([, ids]) => {
      const serverList = await getJson<{ result?: string }>(`${ANIKOTO}/ajax/server/list?servers=${encodeURIComponent(ids)}`, {
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${ANIKOTO}/`,
      }).catch(() => {
        failedRequests += 1;
        return null;
      });
      const types = [...(serverList?.result || '').matchAll(/data-type=["']([^"']+)["']/gi)]
        .map((match) => match[1].toLowerCase());
      return {
        hasSub: types.some((type) => /^(hsub|softsub|sub)(?:-\d+)?$/.test(type)),
        hasDub: types.some((type) => /^dub(?:-\d+)?$/.test(type)),
      };
    }));
    results.forEach((result) => {
      if (result.hasSub) sub += 1;
      if (result.hasDub) dub += 1;
    });
  }

  if (episodeEntries.length === 0 || failedRequests > 0 || (sub === 0 && dub === 0)) {
    throw new Error('AniKoto availability could not be determined');
  }
  return { sub, dub, source: 'anikoto' };
}

/**
 * KAA exposes the complete language-specific episode pagination map in the
 * first response. This is a bounded fallback for long shows where probing
 * AniKoto's server list for every episode would be too expensive.
 */
export async function getKaaAvailability(title: string): Promise<AniKotoAvailability> {
  const keywords = title.toLowerCase().replace(/[^\w\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const queries = [...new Set([title, keywords.slice(0, 3).join(' '), keywords[0] || title])].filter(Boolean);
  const candidates: any[] = [];
  for (const query of queries) {
    const response = await fetchWithTimeout('https://kaa.lt/api/fsearch', {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json', Referer: 'https://kaa.lt/', Origin: 'https://kaa.lt' },
      body: JSON.stringify({ query, page: 1 }),
    });
    if (!response.ok) continue;
    const data: any = await response.json();
    candidates.push(...(data.result || []));
    if (candidates.length > 0) break;
  }
  if (candidates.length === 0) throw new Error(`KAA: no availability result for "${title}"`);

  const wanted = keywords.join('');
  candidates.sort((a, b) => {
    const score = (candidate: any) => {
      const value = `${candidate.title || ''} ${candidate.title_en || ''} ${candidate.slug || ''}`
        .toLowerCase().replace(/[^a-z0-9]/g, '');
      let points = value.includes(wanted) ? 100 : 0;
      if (candidate.type === 'tv') points += 10;
      if (/(movie|ova|special)/i.test(candidate.slug || '')) points -= 20;
      return points;
    };
    return score(b) - score(a);
  });

  const countLanguage = async (language: string): Promise<number> => {
    const response = await fetchWithTimeout(
      `https://kaa.lt/api/show/${encodeURIComponent(candidates[0].slug)}/episodes?lang=${language}&page=1`,
      { headers: { ...HEADERS, Referer: 'https://kaa.lt/', Origin: 'https://kaa.lt' } },
    );
    if (!response.ok) throw new Error(`KAA: availability request failed (${response.status})`);
    const data: any = await response.json();
    const episodeNumbers = new Set<string>();
    for (const page of data.pages || []) {
      for (const episode of String(page.eps || '').split(/\s+/).filter(Boolean)) episodeNumbers.add(episode);
    }
    if (episodeNumbers.size === 0) {
      for (const episode of data.result || []) {
        if (episode.episode_number !== undefined) episodeNumbers.add(String(episode.episode_number));
      }
    }
    return episodeNumbers.size;
  };

  const [sub, dub] = await Promise.all([countLanguage('ja-JP'), countLanguage('en-US')]);
  if (sub === 0 && dub === 0) throw new Error('KAA availability could not be determined');
  return { sub, dub, source: 'kaa' };
}

// ──────────────────────────────────────────────────────────────────────────────
// AniNeko
// ──────────────────────────────────────────────────────────────────────────────
const ANINEKO = 'https://anineko.to';

async function findAniNekoSlug(title: string): Promise<string> {
  const html = await getText(`${ANINEKO}/browser?keyword=${encodeURIComponent(title)}`);
  const wanted = normalized(title);
  const candidates: Array<{ slug: string; name: string }> = [];
  for (const block of html.matchAll(/<a\b[^>]*class=["'][^"']*nv-anime-thumb[^"']*["'][^>]*>[\s\S]*?<\/a>/gi)) {
    const href = block[0].match(/href=["'](?:https?:\/\/anineko\.to)?\/watch\/([^"'/?#]+)/i)?.[1];
    if (!href || candidates.some((candidate) => candidate.slug === href)) continue;
    candidates.push({ slug: href, name: block[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() });
  }
  if (!candidates.length) throw new Error(`AniNeko: no results for "${title}"`);
  candidates.sort((a, b) => Number(normalized(b.name).includes(wanted)) - Number(normalized(a.name).includes(wanted)));
  return candidates[0].slug;
}

async function resolveAniNeko(
  title: string,
  episode: number,
  dub: boolean,
  selfUrl: URL,
  subtitleMode: SubtitleMode = dub ? 'dub' : 'ssub',
): Promise<Response> {
  const slug = await findAniNekoSlug(title);
  const html = await getText(`${ANINEKO}/watch/${slug}/ep-${episode}`, { Referer: `${ANINEKO}/watch/${slug}` });
  const wanted = dub ? 'dub' : 'sub';
  const streams: Source[] = [];
  const panels = html.matchAll(/<div\b[^>]*class=["'][^"']*nv-server-grid[^"']*["'][^>]*data-id=["']([^"']+)["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*nv-server-grid|$)/gi);
  for (const panel of panels) {
    if (!panel[1].toLowerCase().includes(wanted)) continue;
    const embeds = [...panel[2].matchAll(/data-video=["']([^"']+)["']/gi)].map((match) => decodeHtml(match[1])).slice(0, 3);
    for (const embed of embeds) {
      const embedHtml = await getText(embed, { Referer: `${ANINEKO}/` }).catch(() => '');
      const hls = embedHtml.match(/(?:const\s+src|file)\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i)?.[1]
        || embedHtml.match(/["'](https?:\/\/[^"']+\/master\.m3u8[^"']*)["']/i)?.[1];
      if (!hls) continue;
      streams.push({ url: proxied(selfUrl, hls, `${new URL(embed).origin}/`), quality: 'auto', isM3U8: true, server: 'AniNeko' });
      if (streams.length >= 2) break;
    }
    if (streams.length) break;
  }
  if (!streams.length) throw new Error(`AniNeko: no HLS source for episode ${episode}`);
  if (subtitleMode === 'ssub') {
    throw new Error(`AniNeko: no ssub subtitles for episode ${episode}`);
  }
  return jsonResponse({ sources: streams, subtitles: [], isDub: dub, download: `${ANINEKO}/watch/${slug}/ep-${episode}`, provider: 'anineko' });
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export async function resolveAlternateSource(
  provider: string,
  title: string,
  episode: number,
  dub: boolean,
  selfUrl: URL,
  anilistId?: string,
  subtitleMode: string = dub ? 'dub' : 'ssub',
): Promise<Response> {
  const mode: SubtitleMode = subtitleMode === 'hsub' || subtitleMode === 'dub' ? subtitleMode : 'ssub';
  if (provider === 'anikoto') return resolveAniKoto(title, episode, dub, selfUrl, mode);
  if (provider === 'anineko') return resolveAniNeko(title, episode, dub, selfUrl, mode);
  throw new Error(`Unknown alternate provider: ${provider}`);
}
