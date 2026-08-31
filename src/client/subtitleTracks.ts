export type SubtitleTrack = {
  id: string;
  url: string;
  lang: string;
  name: string;
};

type RawSubtitleTrack = {
  url?: string;
  lang?: string;
  name?: string;
};

/**
 * Create a short, stable ID for a subtitle URL within an episode. Including
 * the episode prevents React/Vidstack from reusing a track when two episodes
 * happen to point at the same VTT URL; including the URL keeps duplicate
 * English tracks distinct.
 */
export function createSubtitleTrackId(episodeId: string, url: string, lang: string): string {
  const input = `${episodeId}|${url}|${lang}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `sub-${(hash >>> 0).toString(36)}`;
}

export function normalizeSubtitleTracks(
  episodeId: string,
  tracks: RawSubtitleTrack[],
): SubtitleTrack[] {
  const seenUrls = new Set<string>();
  return tracks.reduce<SubtitleTrack[]>((normalized, raw) => {
    const url = raw.url || '';
    if (!url || seenUrls.has(url)) return normalized;
    seenUrls.add(url);
    const lang = raw.lang || 'en';
    normalized.push({
      id: createSubtitleTrackId(episodeId, url, lang),
      url,
      lang,
      name: raw.name || lang || 'English',
    });
    return normalized;
  }, []);
}

export function preferredSubtitleTrack(tracks: SubtitleTrack[]): SubtitleTrack | null {
  return tracks.find((track) => (
    track.lang.toLowerCase().startsWith('en') ||
    track.name.toLowerCase().includes('english')
  )) || tracks[0] || null;
}
