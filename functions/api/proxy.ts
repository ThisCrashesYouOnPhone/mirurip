// functions/api/proxy.ts
// Cloudflare Pages Function: HLS stream proxy with CORS bypass
// Proxies .m3u8 manifests and .ts segments from krussdomi.com with correct Referer headers

interface Env {}

const KAA_REFERER = 'https://krussdomi.com/';
const KAA_ORIGIN = 'https://krussdomi.com';

const PROXY_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Origin, Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: PROXY_HEADERS });
}

// Vidstack/HLS clients may probe a manifest with HEAD before issuing GET.
// Pages Functions do not route HEAD requests through onRequestGet, so handle
// it explicitly and return the upstream status/metadata without a body.
export async function onRequestHead(context: { request: Request; env: Env }) {
  const reqUrl = new URL(context.request.url);
  const targetUrl = reqUrl.searchParams.get('url');

  if (!targetUrl) {
    return new Response(null, { status: 400, headers: PROXY_HEADERS });
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return new Response(null, { status: 400, headers: PROXY_HEADERS });
  }

  if (parsedTarget.protocol !== 'https:') {
    return new Response(null, { status: 403, headers: PROXY_HEADERS });
  }

  const blockedHostPatterns = ['localhost', '127.', '192.168.', '10.', '172.16.', '0.0.0.0', '::1'];
  if (blockedHostPatterns.some((pattern) => parsedTarget.hostname.includes(pattern))) {
    return new Response(null, { status: 403, headers: PROXY_HEADERS });
  }

  const requestedReferer = reqUrl.searchParams.get('referer');
  let upstreamReferer = KAA_REFERER;
  let upstreamOrigin = KAA_ORIGIN;
  if (requestedReferer) {
    try {
      const candidate = new URL(requestedReferer);
      if (candidate.protocol === 'https:') {
        upstreamReferer = candidate.href;
        upstreamOrigin = candidate.origin;
      }
    } catch {
      // Use the provider default for malformed referers.
    }
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: upstreamReferer,
        Origin: upstreamOrigin,
        Accept: '*/*',
      },
      signal: AbortSignal.timeout(10000),
    });
    const headers: Record<string, string> = { ...PROXY_HEADERS };
    ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'].forEach((name) => {
      const value = upstreamRes.headers.get(name);
      if (value) headers[name] = value;
    });
    const normalizedContentType = getMediaContentType(parsedTarget, headers['content-type'] || '');
    if (normalizedContentType) headers['content-type'] = normalizedContentType;
    return new Response(null, { status: upstreamRes.status, headers });
  } catch {
    return new Response(null, { status: 504, headers: PROXY_HEADERS });
  }
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const reqUrl = new URL(context.request.url);
  const targetUrl = reqUrl.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'url param required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...PROXY_HEADERS },
    });
  }

  // Validate the target URL — block SSRF targets, allow all external HTTPS CDN domains
  // (KAA uses many rotating CDN hostnames like narutokun.xyz, advancedairesearchlab.xyz, etc.)
  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...PROXY_HEADERS },
    });
  }

  // Only allow HTTPS, block private/localhost SSRF targets
  if (parsedTarget.protocol !== 'https:') {
    return new Response(JSON.stringify({ error: 'Only HTTPS upstream URLs are allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...PROXY_HEADERS },
    });
  }
  const blockedHostPatterns = ['localhost', '127.', '192.168.', '10.', '172.16.', '0.0.0.0', '::1'];
  if (blockedHostPatterns.some((p) => parsedTarget.hostname.includes(p))) {
    return new Response(JSON.stringify({ error: 'Blocked host' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...PROXY_HEADERS },
    });
  }

  // Forward Range header for video seeking
  const rangeHeader = context.request.headers.get('Range');
  const isAniZone = parsedTarget.hostname === 'anizone.to' || parsedTarget.hostname.endsWith('.anizone.to');
  const requestedReferer = reqUrl.searchParams.get('referer');
  let upstreamReferer = isAniZone ? 'https://anizone.to/' : KAA_REFERER;
  let upstreamOrigin = isAniZone ? 'https://anizone.to' : KAA_ORIGIN;
  if (requestedReferer) {
    try {
      const candidate = new URL(requestedReferer);
      if (candidate.protocol === 'https:') {
        upstreamReferer = candidate.href;
        upstreamOrigin = candidate.origin;
      }
    } catch {
      // Ignore malformed caller-provided referers and use provider defaults.
    }
  }
  const upstreamHeaders: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    Referer: upstreamReferer,
    Origin: upstreamOrigin,
    Accept: '*/*',
    // Force no compression so we can read/rewrite text m3u8 manifests cleanly
    'Accept-Encoding': 'identity',
  };
  if (rangeHeader) {
    upstreamHeaders['Range'] = rangeHeader;
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(targetUrl, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(15000),
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Upstream fetch failed: ${err.message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...PROXY_HEADERS },
    });
  }

  const contentType = upstreamRes.headers.get('content-type') || '';
  const isDub = reqUrl.searchParams.get('dub') === 'true';

  // For WebVTT / SRT / ASS subtitle files: normalize them to WebVTT so the
  // browser's native text-track parser can consume every provider format.
  if (
    targetUrl.includes('.vtt') ||
    targetUrl.includes('.srt') ||
    targetUrl.includes('.ass') ||
    targetUrl.includes('subst.krussdomi.com') ||
    targetUrl.includes('subbl.krussdomi.com') ||
    contentType.includes('text/vtt')
  ) {
    const vttText = await upstreamRes.text();
    const isAss = targetUrl.includes('.ass') || /^\s*\[Script Info\]/i.test(vttText);
    const formattedVtt = isAss ? assToWebVtt(vttText) : toWebVtt(vttText);
    return new Response(formattedVtt, {
      status: upstreamRes.status,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        ...PROXY_HEADERS,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  // For .m3u8 manifests: rewrite all URLs so segments are also proxied
  if (
    targetUrl.includes('.m3u8') ||
    contentType.includes('mpegurl') ||
    contentType.includes('x-mpegURL')
  ) {
    let manifestText = await upstreamRes.text();

    // Get base URL for resolving relative paths
    const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
    // Self-referencing proxy base
    const proxyBase = `${reqUrl.origin}/api/proxy?url=`;
    const refererParam = `&referer=${encodeURIComponent(upstreamReferer)}`;

    const hasEnglishAudio = manifestText.includes('NAME="English"') || manifestText.includes('LANGUAGE="eng"');

    // Rewrite lines that are URLs (absolute or relative), and adjust audio tracks for Dub if requested
    const rewritten = manifestText
      .split('\n')
      .map((line) => {
        let trimmed = line.trim();
        if (!trimmed) return line;

        // If user requested Dub and English audio track is available, prioritize English as DEFAULT
        if (isDub && hasEnglishAudio && trimmed.startsWith('#EXT-X-MEDIA:TYPE=AUDIO')) {
          if (trimmed.includes('LANGUAGE="eng"') || trimmed.includes('NAME="English"')) {
            trimmed = trimmed.replace(/DEFAULT=[A-Z]+/g, 'DEFAULT=YES').replace(/AUTOSELECT=[A-Z]+/g, 'AUTOSELECT=YES');
            if (!trimmed.includes('DEFAULT=')) trimmed += ',DEFAULT=YES';
            if (!trimmed.includes('AUTOSELECT=')) trimmed += ',AUTOSELECT=YES';
          } else if (trimmed.includes('LANGUAGE="jpn"') || trimmed.includes('NAME="Japanese"')) {
            trimmed = trimmed.replace(/DEFAULT=[A-Z]+/g, 'DEFAULT=NO').replace(/AUTOSELECT=[A-Z]+/g, 'AUTOSELECT=NO');
          }
          line = trimmed;
        }

        // For #EXT-X-MEDIA, #EXT-X-I-FRAME-STREAM-INF, etc: rewrite URI="..." attributes
        if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
            let resolved: string;
            if (uri.startsWith('http://') || uri.startsWith('https://')) {
              resolved = uri;
            } else {
              resolved = new URL(uri, baseUrl).href;
            }
            const extra = `${isDub ? '&dub=true' : ''}${refererParam}`;
            return `URI="${proxyBase}${encodeURIComponent(resolved)}${extra}"`;
          });
        }

        // Skip other # comment lines
        if (trimmed.startsWith('#')) return line;

        // Absolute URL
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          const extra = `${isDub ? '&dub=true' : ''}${refererParam}`;
          return `${proxyBase}${encodeURIComponent(trimmed)}${extra}`;
        }
        // Relative URL — resolve against manifest base
        const resolved = new URL(trimmed, baseUrl).href;
        const extra = `${isDub ? '&dub=true' : ''}${refererParam}`;
        return `${proxyBase}${encodeURIComponent(resolved)}${extra}`;
      })
      .join('\n');

    return new Response(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        ...PROXY_HEADERS,
        'Cache-Control': 'public, max-age=60',
      },
    });
  }

  // For .ts segments and other binary content: stream through
  const responseHeaders: Record<string, string> = { ...PROXY_HEADERS };
  const passThroughHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
  for (const h of passThroughHeaders) {
    const v = upstreamRes.headers.get(h);
    if (v) responseHeaders[h] = v;
  }
  const normalizedContentType = getMediaContentType(parsedTarget, responseHeaders['content-type'] || '');
  if (normalizedContentType) responseHeaders['content-type'] = normalizedContentType;

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: responseHeaders,
  });
}

/**
 * AniKoto/MegaPlay intentionally obfuscates MPEG-TS segment extensions and
 * content types. JavaScript HLS players generally append the bytes directly,
 * but native HLS implementations can use the response MIME type while
 * validating a segment. Keep the payload untouched and advertise the actual
 * container to make the proxied stream standards-compliant.
 */
export function getMediaContentType(target: URL, upstreamContentType: string): string {
  const path = target.pathname.toLowerCase();
  const contentType = upstreamContentType.split(';', 1)[0].trim().toLowerCase();

  if (path.endsWith('.ts') || path.endsWith('.m2ts')) return 'video/mp2t';
  if (/\/seg-\d+(?:-[^/]+)?\.(?:jpg|jpeg|html?|js|css|txt|png|webp|ico)$/i.test(path)) {
    return 'video/mp2t';
  }

  return contentType || upstreamContentType;
}

function toWebVtt(text: string): string {
  const body = text.replace(/^\uFEFF?WEBVTT\s*/i, '').trimStart();
  return `WEBVTT\n\n${body}\n`;
}

function assToWebVtt(text: string): string {
  const cues: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!/^Dialogue\s*:/i.test(line)) continue;
    const fields = line.replace(/^Dialogue\s*:\s*/i, '').split(',', 10);
    if (fields.length < 10) continue;
    const start = assTimeToVtt(fields[1]);
    const end = assTimeToVtt(fields[2]);
    if (!start || !end) continue;
    const dialogue = fields[9]
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\N/gi, '\n')
      .replace(/\\n/gi, '\n')
      .trim();
    if (dialogue) cues.push(`${start} --> ${end}\n${dialogue}`);
  }
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

function assTimeToVtt(value: string): string | null {
  const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/);
  if (!match) return null;
  const [, hours, minutes, seconds, centiseconds] = match;
  return `${hours.padStart(2, '0')}:${minutes}:${seconds}.${centiseconds}0`;
}
