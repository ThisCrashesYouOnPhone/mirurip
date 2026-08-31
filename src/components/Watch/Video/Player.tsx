import { useEffect, useRef, useState, useCallback } from 'react';
import './PlayerStyles.css';
import {
  isHLSProvider,
  MediaPlayer,
  MediaProvider,
  Poster,
  Track,
  type MediaProviderAdapter,
  type MediaProviderChangeEvent,
  type MediaPlayerInstance,
  type PlayerSrc,
  type TextTrack,
} from '@vidstack/react';
import styled from 'styled-components';
import {
  fetchSkipTimes,
  fetchAnimeStreamingLinks,
  type StreamUnavailable,
  useSettings,
  safeLocalStorageGet,
  safeLocalStorageSet,
  safeLocalStorageGetJson,
  recordAniListProgress,
  flushQueuedAniListProgress,
} from '../../../index';
import {
  defaultLayoutIcons,
  DefaultVideoLayout,
} from '@vidstack/react/player/layouts/default';
import { TbPlayerTrackPrev, TbPlayerTrackNext } from 'react-icons/tb';
import { FaCheck } from 'react-icons/fa6';
import { RiCheckboxBlankFill } from 'react-icons/ri';
import {
  chapterLabel,
  generateChapterVtt,
  normalizeSkipTimes,
  parseWebVttChapters,
  shouldAutoSkipPreview,
  synthesizeSeanimeChapters,
  PREVIEW_TYPES,
  SKIPPABLE_TYPES,
  type ChapterSkipTime,
} from '../../../client/chapterTimes';
import { setupMediaSession } from '../../../client/mediaSession';
import { consumePrefetchedStream, type PrefetchedStream } from '../../../client/playerTransition';
import {
  normalizeSubtitleTracks,
  preferredSubtitleTrack,
  type SubtitleTrack,
} from '../../../client/subtitleTracks';
import { useAuth } from '../../../client/useAuth';
import type { Episode } from '../../../hooks/animeInterface';
import {
  subtitleStyleVariables,
  useSubtitleSettings,
  type SubtitleBackground,
  type SubtitleFontSize,
} from './useSubtitleSettings';

const Button = styled.button<{ $autoskip?: boolean }>`
  padding: 0.25rem;
  font-size: 0.8rem;
  border: none;
  margin-right: 0.25rem;
  border-radius: var(--global-border-radius);
  cursor: pointer;
  background-color: var(--global-div);
  color: var(--global-text);
  svg {
    margin-bottom: -0.1rem;
    color: grey;
  }
  @media (max-width: 500px) {
    font-size: 0.7rem;
  }

  &.active {
    background-color: var(--primary-accent);
  }
  ${({ $autoskip }) =>
    $autoskip &&
    `
    color: #d69e00; 
    svg {
      color: #d69e00; 
    }
  `}
`;

const FloatingSkipButton = styled.button`
  position: absolute;
  bottom: 5.5rem;
  right: 1.5rem;
  z-index: 40;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1.1rem;
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #fff;
  background: rgba(18, 18, 28, 0.88);
  border: 1.5px solid rgba(255, 255, 255, 0.28);
  backdrop-filter: blur(10px);
  border-radius: 9999px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  transition: all 0.2s ease-in-out;
  animation: fadeInSlide 0.3s ease-out;

  &:hover {
    background: var(--primary-accent, #6366f1);
    border-color: var(--primary-accent, #6366f1);
    transform: scale(1.05);
  }
  &:active {
    transform: scale(0.95);
  }

  @media (max-width: 600px) {
    bottom: 4.5rem;
    right: 1rem;
    padding: 0.45rem 0.85rem;
    font-size: 0.78rem;
  }
`;

const SubtitleStatus = styled.div`
  position: absolute;
  left: 50%;
  bottom: 5.5rem;
  z-index: 35;
  max-width: min(90%, 34rem);
  padding: 0.45rem 0.75rem;
  color: #fff;
  background: rgba(18, 18, 28, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 0.4rem;
  font-size: 0.82rem;
  text-align: center;
  pointer-events: none;
  transform: translateX(-50%);

  @media (max-width: 600px) {
    bottom: 4.5rem;
    font-size: 0.75rem;
  }
`;

const SubtitleSettings = styled.div`
  display: grid;
  gap: 0.55rem;
  min-width: 12rem;
  padding: 0.65rem 0.75rem;
  color: var(--media-menu-color, #fff);
  font-size: 0.78rem;

  label {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.75rem;
  }

  select {
    max-width: 7.5rem;
    padding: 0.2rem 0.3rem;
    color: inherit;
    background: var(--media-menu-bg, #181818);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.25rem;
    font: inherit;
  }
`;

function isAppleMobilePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function supportsMseHls(): boolean {
  if (typeof window === 'undefined' || typeof window.MediaSource === 'undefined') return false;
  if (typeof window.MediaSource.isTypeSupported !== 'function') return false;

  // hls.js transmuxes MPEG-TS into fragmented MP4 before handing it to MSE.
  // Test the common H.264/AAC combinations used by the provider rather than
  // testing the provider's intentionally misleading .jpg/.html extensions.
  return [
    'video/mp4; codecs="avc1.640032,mp4a.40.2"',
    'video/mp4; codecs="avc1.4d401f,mp4a.40.2"',
  ].some((type) => window.MediaSource.isTypeSupported(type));
}

type PlayerProps = {
  episodeId: string;
  banner?: string;
  malId?: string;
  animeId?: string;
  updateDownloadLink: (link: string) => void;
  onEpisodeEnd: () => Promise<void>;
  onPrevEpisode: () => void;
  onNextEpisode: () => void;
  animeTitle?: string;
  sourceType?: string;
  language?: string;
  totalEpisodes?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  nextEpisode?: Episode;
  hasPreviousEpisode?: boolean;
};

type StreamingSource = {
  url: string;
  quality: string;
  isM3U8?: boolean;
};

export function Player({
  episodeId,
  banner,
  malId,
  animeId,
  updateDownloadLink,
  onEpisodeEnd,
  onPrevEpisode,
  onNextEpisode,
  animeTitle,
  sourceType = 'anikoto',
  language = 'sub',
  totalEpisodes,
  episodeNumber: selectedEpisodeNumber,
  episodeTitle,
  nextEpisode,
  hasPreviousEpisode = false,
}: PlayerProps) {
  const { userData } = useAuth();
  const player = useRef<MediaPlayerInstance>(null);
  const [src, setSrc] = useState<PlayerSrc>('');
  const [srcLoading, setSrcLoading] = useState<boolean>(true);
  const [sourceError, setSourceError] = useState<StreamUnavailable | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [vttContent, setVttContent] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [skipTimes, setSkipTimes] = useState<ChapterSkipTime[]>([]);
  const [previewInterval, setPreviewInterval] = useState<ChapterSkipTime['interval'] | null>(null);
  const [hasSyncedAniList, setHasSyncedAniList] = useState<boolean>(false);
  const episodeNumber = selectedEpisodeNumber?.toString() || getEpisodeNumber(episodeId);
  const animeVideoTitle = animeTitle || 'Anime';

  const { settings, setSettings } = useSettings();
  const {
    settings: subtitleSettings,
    setSettings: setSubtitleSettings,
  } = useSubtitleSettings();
  const { autoPlay, autoNext, autoSkip } = settings;
  // Older saved sessions used `sub`; keep that legacy value mapped to the
  // current soft-sub mode everywhere in the player.
  const subtitleMode = language === 'sub' ? 'ssub' : language;

  const hasNativeChaptersRef = useRef(false);
  const providerSkipTimesRef = useRef<ChapterSkipTime[]>([]);
  const resumeTimeRef = useRef(0);
  const resumeAppliedRef = useRef(false);
  const lastProgressWriteRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const aniListSyncInFlightRef = useRef(false);
  const autoSyncTriggeredRef = useRef(false);
  const lastAniListSyncAttemptRef = useRef(0);
  const previewSkippedRef = useRef(false);
  const pendingAutoPlayRef = useRef(false);
  const sourceRequestIdRef = useRef(0);
  const skipRequestIdRef = useRef(0);
  const failedSubtitleTrackIdsRef = useRef(new Set<string>());
  const prefetchedStreamRef = useRef<PrefetchedStream<Awaited<ReturnType<typeof fetchAnimeStreamingLinks>>> | null>(null);
  const pipActiveRef = useRef(false);

  function getEpisodeNumber(id: string): string {
    if (!id) return '1';
    const match = id.match(/episode-(\d+(?:-\d+)?)/i);
    if (match) return match[1];
    const parts = id.split('-');
    return parts[parts.length - 1] || '1';
  }

  const streamRequestKey = useCallback((targetEpisodeId: string) => (
    `${targetEpisodeId}|${sourceType}|${language}|${animeId || ''}|${animeVideoTitle}`
  ), [sourceType, language, animeId, animeVideoTitle]);

  const resolveStreamResponse = useCallback((targetEpisodeId: string) => {
    return fetchAnimeStreamingLinks(
      targetEpisodeId,
      sourceType,
      animeVideoTitle,
      subtitleMode === 'dub',
      animeId || '',
      subtitleMode as 'hsub' | 'ssub' | 'dub',
    );
  }, [sourceType, subtitleMode, animeVideoTitle, animeId]);

  const setPreviewFromCues = useCallback((cues: Array<{ startTime: number; endTime: number; type: string }>) => {
    const preview = cues.find((cue) => PREVIEW_TYPES.has(cue.type.toLowerCase()) || cue.type.toLowerCase() === 'preview');
    setPreviewInterval(preview ? { startTime: preview.startTime, endTime: preview.endTime } : null);
  }, []);

  const fetchAndSetAnimeSource = useCallback(async () => {
    const requestId = ++sourceRequestIdRef.current;
    ++skipRequestIdRef.current;
    setSrcLoading(true);
    setSourceError(null);
    // Keep the existing source/player mounted while the next manifest is
    // resolved. Replacing `src` below lets Vidstack/Safari transition the
    // same media element, which is important for iPad PiP continuity.
    player.current?.pause();
    hasNativeChaptersRef.current = false;
    providerSkipTimesRef.current = [];
    previewSkippedRef.current = false;
    setSkipTimes([]);
    setPreviewInterval(null);
    setVttContent('');
    setSubtitleTracks([]);
    setSubtitleError(null);
    failedSubtitleTrackIdsRef.current.clear();
    try {
      const currentKey = streamRequestKey(episodeId);
      const prefetchedResult = consumePrefetchedStream(prefetchedStreamRef.current, currentKey);
      prefetchedStreamRef.current = prefetchedResult.remaining;
      const prefetched = prefetchedResult.response;
      const response = prefetched || await resolveStreamResponse(episodeId);
      if (requestId !== sourceRequestIdRef.current) return;
      if (response && response.sources && response.sources.length > 0) {
        const defaultSource =
          response.sources.find((source: StreamingSource) => source.quality === 'default' || source.quality === 'auto' || source.quality.includes('1080p')) ||
          response.sources[0];
        if (defaultSource) {
          // Pass explicit type so Vidstack detects HLS even when URL has query params like &dub=true
          if (defaultSource.isM3U8 || defaultSource.url.includes('.m3u8')) {
            setSrc({ src: defaultSource.url, type: 'application/x-mpegurl' });
          } else {
            setSrc(defaultSource.url);
          }
        }
        if (response.download) {
          updateDownloadLink(response.download);
        }
        // Store subtitle tracks for rendering in the player
        if (response.subtitles && response.subtitles.length > 0) {
          setSubtitleTracks(normalizeSubtitleTracks(episodeId, response.subtitles));
        } else {
          setSubtitleTracks([]);
        }

        // AniKoto/MegaPlay returns opening and ending windows with the source
        // response. Preserve them instead of throwing them away and falling
        // through to the unreliable legacy AniSkip service.
        if (Array.isArray(response.skipTimes) && response.skipTimes.length > 0) {
          providerSkipTimesRef.current = response.skipTimes;
          const initialSkipTimes = normalizeSkipTimes(response.skipTimes, 0);
          if (initialSkipTimes.length > 0) {
            setSkipTimes(initialSkipTimes);
            setPreviewFromCues(synthesizeSeanimeChapters(initialSkipTimes, 0));
            setVttContent(generateChapterVtt(
              initialSkipTimes,
              0,
              animeVideoTitle,
              episodeNumber,
            ));
          }
        }

        // Check if provider returned native chapters (e.g. AniZone/Crunchyroll chapters.vtt)
        if (response.chapters) {
          try {
            const chapRes = await fetch(response.chapters);
            if (chapRes.ok) {
              const chapText = await chapRes.text();
              const { cues, skipTimes: parsedSkips } = parseWebVttChapters(chapText);
              if (cues.length > 0) {
                hasNativeChaptersRef.current = true;
                setPreviewFromCues(cues);
                setVttContent(chapText);
                setSkipTimes(parsedSkips);
              }
            }
          } catch (chapErr) {
            console.warn('[Player][Chapters] Failed to fetch native provider chapters:', chapErr);
          }
        }
      } else if (requestId === sourceRequestIdRef.current) {
        // Do not leave the previous episode looking playable when the new
        // source failed. The mounted player is still retained for normal
        // transitions, but an empty result should show a clear error state.
        pendingAutoPlayRef.current = false;
        setSourceError(response?.unavailable || {
          code: 'SOURCE_UNAVAILABLE',
          message: 'Cannot play media. Try a different source.',
          retryable: true,
          provider: sourceType,
          mode: subtitleMode as 'hsub' | 'ssub' | 'dub',
        });
        setSrc('');
      }
    } catch (error) {
      console.warn('[Player] Failed to fetch streaming links:', error);
      if (requestId === sourceRequestIdRef.current) {
        pendingAutoPlayRef.current = false;
        setSourceError({
          code: 'RESOLVER_ERROR',
          message: 'Cannot play media. Try a different source.',
          retryable: true,
          provider: sourceType,
          mode: subtitleMode as 'hsub' | 'ssub' | 'dub',
        });
        setSrc('');
      }
    } finally {
      if (requestId === sourceRequestIdRef.current) setSrcLoading(false);
    }
  }, [episodeId, animeVideoTitle, animeId, episodeNumber, streamRequestKey, resolveStreamResponse, setPreviewFromCues, updateDownloadLink, subtitleMode]);

  const fetchAndProcessSkipTimes = useCallback(async (episodeLength = 0) => {
    const requestId = skipRequestIdRef.current;
    const applySkipData = (normalizedSkipTimes: ChapterSkipTime[], chapterLength: number) => {
      if (requestId !== skipRequestIdRef.current) return;
      const chapterCues = synthesizeSeanimeChapters(normalizedSkipTimes, chapterLength);
      setSkipTimes(normalizedSkipTimes);
      setPreviewFromCues(chapterCues);
      setVttContent(generateChapterVtt(
        chapterCues,
        chapterLength,
        animeVideoTitle,
        episodeNumber,
      ));
    };

    // Prefer timestamps supplied by the selected stream provider. These are
    // aligned to the exact file being played and avoid an unnecessary AniSkip
    // request when AniSkip is unavailable.
    if (providerSkipTimesRef.current.length > 0) {
      const normalizedSkipTimes = normalizeSkipTimes(providerSkipTimesRef.current, episodeLength);
      if (normalizedSkipTimes.length > 0) {
        const chapterLength = episodeLength || normalizedSkipTimes.reduce(
          (latest, item) => Math.max(latest, item.interval.endTime),
          0,
        );
        applySkipData(normalizedSkipTimes, chapterLength);
      }
      return;
    }

    // If native chapters were already loaded from provider, skip AniSkip
    if (hasNativeChaptersRef.current) return;

    if ((malId || animeId) && episodeId) {
      const epNum = getEpisodeNumber(episodeId);
      try {
        const response: { found?: boolean; results: ChapterSkipTime[] } = await fetchSkipTimes({
          malId: malId?.toString() || '',
          episodeNumber: epNum,
          episodeLength,
          anilistId: animeId || '',
        });

        const effectiveLength = episodeLength || 1440;
        if (response && response.results && response.results.length > 0) {
          const normalizedSkipTimes = normalizeSkipTimes(response.results, effectiveLength);
          if (normalizedSkipTimes.length > 0) {
            const chapterLength = effectiveLength || normalizedSkipTimes.reduce(
              (latest, item) => Math.max(latest, item.interval.endTime),
              0,
            );
            const chapterCues = synthesizeSeanimeChapters(normalizedSkipTimes, chapterLength);
            const vttGenerated = generateChapterVtt(chapterCues, chapterLength, animeVideoTitle, episodeNumber);
            if (vttGenerated) {
              if (requestId !== skipRequestIdRef.current) return;
              setVttContent(vttGenerated);
              setSkipTimes(normalizedSkipTimes);
              setPreviewFromCues(chapterCues);
              return;
            }
          }
        }

        // Keep the chapters track absent when no real chapter data exists.
        // A synthetic whole-episode cue makes the chapter menu look usable
        // while hiding the fact that the skip lookup failed.
        setVttContent('');
        setSkipTimes([]);
        setPreviewInterval(null);
      } catch (error) {
        console.warn('[Player][Chapters] Failed to fetch skip times:', error);
      }
    }
  }, [malId, animeId, episodeId, animeVideoTitle, episodeNumber, setPreviewFromCues]);

  useEffect(() => {
    const savedTime = parseFloat(safeLocalStorageGet('currentTime', '0'));
    resumeTimeRef.current = Number.isFinite(savedTime) && savedTime > 0 ? savedTime : 0;
    resumeAppliedRef.current = false;
    lastProgressWriteRef.current = 0;
    lastUiUpdateRef.current = 0;
    aniListSyncInFlightRef.current = false;
    autoSyncTriggeredRef.current = false;
    lastAniListSyncAttemptRef.current = 0;
    setCurrentTime(resumeTimeRef.current);
    setHasSyncedAniList(false);
    fetchAndSetAnimeSource();
  }, [episodeId, fetchAndSetAnimeSource]);

  // Resolve only the next episode's source metadata. This does not load
  // media segments; Vidstack will request those only after the source is
  // attached to the mounted player.
  useEffect(() => {
    prefetchedStreamRef.current = null;
    if (!nextEpisode?.id) return;

    let cancelled = false;
    const key = streamRequestKey(nextEpisode.id);
    const timer = window.setTimeout(() => {
      void resolveStreamResponse(nextEpisode.id)
        .then((response) => {
          if (!cancelled && response?.sources?.length) {
            prefetchedStreamRef.current = { key, episodeId: nextEpisode.id, response };
          }
        })
        .catch((error) => {
          if (!cancelled) console.warn('[Player] Next episode prefetch failed:', error);
        });
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [nextEpisode?.id, streamRequestKey, resolveStreamResponse]);

  function onProviderChange(
    provider: MediaProviderAdapter | null,
    _nativeEvent: MediaProviderChangeEvent,
  ) {
    if (isHLSProvider(provider)) {
      const isAppleMobile = isAppleMobilePlatform();
      // iPadOS supports MSE even when Safari presents a desktop-class Mac
      // user agent. AniKoto's player uses hls.js successfully for this same
      // provider, whose segment URLs have misleading file extensions. Use
      // the byte-oriented hls.js path whenever MSE can actually handle the
      // H.264/AAC output, and keep native HLS as the real fallback for older
      // iPhone/iPad engines without usable MSE.
      if (isAppleMobile && !supportsMseHls()) return;
      provider.library = () => import('hls.js');
      // Keep the buffer bounded on low-RAM devices without forcing a lower
      // resolution. This controls queued media, not the selected rendition.
      provider.config = {
        maxBufferLength: 15,
        maxMaxBufferLength: 30,
        maxBufferSize: 30 * 1024 * 1024,
        backBufferLength: 10,
        enableWorker: true,
      };
    }
  }

  function onLoadedMetadata() {
    if (player.current) {
      const duration = player.current.duration;
      if (Number.isFinite(duration) && duration > 0) {
        // Apply the saved position once after the media element knows its
        // duration. Doing this from the currentTime state effect causes a
        // seek feedback loop because timeupdate also updates that state.
        if (!resumeAppliedRef.current && resumeTimeRef.current > 0 && resumeTimeRef.current < duration - 2) {
          player.current.currentTime = resumeTimeRef.current;
          resumeAppliedRef.current = true;
        }
        // Re-query with the real stream duration so AniSkip can select and
        // align the correct cut of the episode.
        void fetchAndProcessSkipTimes(duration);
      }
      selectRequestedAudioTrack();
      // Subtitle tracks are resolved after the player has mounted. Use the
      // same identity-based synchronizer as text-tracks-change.
      syncSubtitleTrackModes();

      if (pendingAutoPlayRef.current) {
        pendingAutoPlayRef.current = false;
        const playPromise = player.current.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          void playPromise.catch((error) => {
            // iPadOS may require a user gesture after a source replacement.
            // Leave the new episode loaded so its visible play control can be
            // used instead of trapping the player in a loading state.
            console.warn('[Player] Automatic next-episode playback was rejected:', error);
          });
        }
      }
    }
  }

  const syncSubtitleTrackModes = useCallback(() => {
    const media = player.current;
    if (!media?.textTracks) return;

    const tracks = media.textTracks.toArray().filter(
      (track) => track.kind === 'subtitles' || track.kind === 'captions',
    );
    // Never let a stale external track remain visible for H-Sub or Dub. H-Sub
    // is video-only here; if the provider has no baked captions, the user can
    // choose another server instead of seeing a misleading soft-sub track.
    if (subtitleMode !== 'ssub') {
      tracks.forEach((track) => { track.mode = 'disabled'; });
      return;
    }

    if (!tracks.length) return;
    // Only choose from tracks belonging to the current response. Provider
    // injected tracks and tracks from an older source must never win merely
    // because they share the same language label.
    const availableSubtitleTracks = subtitleTracks.filter(
      (track) => !failedSubtitleTrackIdsRef.current.has(track.id),
    );
    if (!availableSubtitleTracks.length) {
      tracks.forEach((track) => { track.mode = 'disabled'; });
      return;
    }
    const targetTrack = preferredSubtitleTrack(availableSubtitleTracks);
    tracks.forEach((track) => {
      track.mode = track.id === targetTrack?.id ? 'showing' : 'disabled';
    });
  }, [subtitleMode, subtitleTracks]);

  useEffect(() => {
    const media = player.current;
    const textTracks = media?.textTracks;
    if (!textTracks || subtitleMode !== 'ssub' || !subtitleTracks.length) return;

    const managedIds = new Set(subtitleTracks.map((track) => track.id));
    const listeners = new Map<string, {
      track: TextTrack;
      onLoad: EventListener;
      onError: EventListener;
    }>();

    const attachTrackDiagnostics = (track: TextTrack) => {
      if (!managedIds.has(track.id) || listeners.has(track.id)) return;

      const metadata = subtitleTracks.find((item) => item.id === track.id);
      const onLoad: EventListener = () => {
        failedSubtitleTrackIdsRef.current.delete(track.id);
        setSubtitleError(null);
        syncSubtitleTrackModes();
      };
      const onError: EventListener = (event) => {
        failedSubtitleTrackIdsRef.current.add(track.id);
        console.warn('[Player][Subtitles] Track failed to load:', {
          episodeId,
          trackId: track.id,
          url: metadata?.url,
          readyState: track.readyState,
          error: event instanceof ErrorEvent ? event.message : 'unknown track error',
        });

        const allTracksFailed = subtitleTracks.every((item) => (
          failedSubtitleTrackIdsRef.current.has(item.id)
        ));
        if (allTracksFailed || preferredSubtitleTrack(subtitleTracks)?.id === track.id) {
          setSubtitleError('Subtitles unavailable. Try another server.');
        }
        syncSubtitleTrackModes();
      };

      track.addEventListener('load', onLoad);
      track.addEventListener('error', onError);
      listeners.set(track.id, { track, onLoad, onError });
    };

    textTracks.toArray().forEach(attachTrackDiagnostics);
    const onTrackAdded: EventListener = (event) => {
      const addedTrack = (event as CustomEvent<TextTrack>).detail;
      if (addedTrack) attachTrackDiagnostics(addedTrack);
    };
    textTracks.addEventListener('add', onTrackAdded);

    return () => {
      textTracks.removeEventListener('add', onTrackAdded);
      listeners.forEach(({ track, onLoad, onError }) => {
        track.removeEventListener('load', onLoad);
        track.removeEventListener('error', onError);
      });
    };
  }, [episodeId, subtitleMode, subtitleTracks, syncSubtitleTrackModes]);

  const selectRequestedAudioTrack = useCallback(() => {
    if (language !== 'dub' || !player.current) return;
    const tracks = player.current.audioTracks.toArray();
    const englishIndex = tracks.findIndex((track) => {
      const languageName = `${track.language} ${track.label}`.toLowerCase();
      return languageName.startsWith('en') || languageName.includes('english') || languageName.includes('eng');
    });
    if (englishIndex >= 0 && player.current.audioTracks.selectedIndex !== englishIndex) {
      player.current.remoteControl.changeAudioTrack(englishIndex);
    }
  }, [language]);

  useEffect(() => setupMediaSession({
    title: animeVideoTitle,
    episodeTitle,
    episodeNumber,
    artwork: banner,
    onPlay: () => {
      const playPromise = player.current?.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        void playPromise.catch((error) => console.warn('[Player][MediaSession] Play rejected:', error));
      }
    },
    onPause: () => player.current?.pause(),
    onNext: nextEpisode ? onNextEpisode : undefined,
    onPrevious: hasPreviousEpisode ? onPrevEpisode : undefined,
  }), [animeVideoTitle, episodeTitle, episodeNumber, banner, nextEpisode, hasPreviousEpisode, onNextEpisode, onPrevEpisode]);

  const handlePictureInPictureChange = useCallback((isActive: boolean) => {
    pipActiveRef.current = isActive;
  }, []);

  const handlePictureInPictureError = useCallback((error: unknown) => {
    console.warn('[Player][PiP] Picture-in-picture change failed:', error);
  }, []);

  const syncCurrentProgress = useCallback(() => {
    const media = player.current;
    const parsedAnimeId = Number(animeId);
    const parsedEpisode = Number(episodeNumber);
    if (!media || !Number.isFinite(parsedAnimeId) || !Number.isFinite(parsedEpisode) || parsedAnimeId <= 0) return;
    const duration = media.duration;
    const percentage = duration > 0 ? (media.currentTime / duration) * 100 : 0;
    if (
      percentage < 80 ||
      hasSyncedAniList ||
      aniListSyncInFlightRef.current ||
      autoSyncTriggeredRef.current ||
      Date.now() - lastAniListSyncAttemptRef.current < 5000
    ) return;

    lastAniListSyncAttemptRef.current = Date.now();
    aniListSyncInFlightRef.current = true;
    void recordAniListProgress(parsedAnimeId, parsedEpisode, totalEpisodes, userData?.id)
      .then((result) => {
        if (result) {
          autoSyncTriggeredRef.current = true;
          setHasSyncedAniList(true);
        }
      })
      .catch((error) => console.warn('[Player] AniList progress auto-sync error:', error))
      .finally(() => { aniListSyncInFlightRef.current = false; });
  }, [animeId, episodeNumber, totalEpisodes, hasSyncedAniList, userData?.id]);

  useEffect(() => {
    // A queued update may have been created before OAuth finished or on a
    // different route. Flush as soon as this authenticated player mounts.
    flushQueuedAniListProgress();
    const flush = () => {
      void syncCurrentProgress();
      flushQueuedAniListProgress();
    };
    const handleAuthUpdate = () => flushQueuedAniListProgress();
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') flush();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('online', flush);
    window.addEventListener('authUpdate', handleAuthUpdate);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('online', flush);
      window.removeEventListener('authUpdate', handleAuthUpdate);
    };
  }, [syncCurrentProgress]);

  function onTimeUpdate() {
    if (player.current) {
      const time = player.current.currentTime;
      const duration = player.current.duration || 1;
      const playbackPercentage = (time / duration) * 100;
      const now = Date.now();

      // Keep the skip affordance responsive without rerendering the complete
      // player on every native timeupdate event.
      if (now - lastUiUpdateRef.current >= 250) {
        lastUiUpdateRef.current = now;
        setCurrentTime(time);
      }

      // localStorage is synchronous. Persisting the entire episode map on
      // every timeupdate can block older Safari main threads while the player
      // is decoding. A one-second cadence is sufficient for resume tracking.
      if (now - lastProgressWriteRef.current >= 1000 || playbackPercentage >= 99) {
        lastProgressWriteRef.current = now;
        const playbackInfo = {
          currentTime: time,
          playbackPercentage,
        };

        const allPlaybackInfo = safeLocalStorageGetJson<Record<string, any>>('all_episode_times', {});
        allPlaybackInfo[episodeId] = playbackInfo;
        safeLocalStorageSet('all_episode_times', JSON.stringify(allPlaybackInfo));
      }

      // Auto AniList synchronization when playback exceeds 80%.
      syncCurrentProgress();

      // Auto Skip Opening and Ending
      if (autoSkip && skipTimes.length > 0) {
        const skipInterval = skipTimes.find(
          ({ interval, skipType }) => SKIPPABLE_TYPES.has(skipType.toLowerCase()) &&
            time >= interval.startTime && time < interval.endTime,
        );
        if (skipInterval) {
          player.current.currentTime = skipInterval.interval.endTime;
        }
      }

      // Previews are intentionally separate from opening/ending skips. Only
      // jump over a verified provider/AniSkip Preview when Auto Next can
      // actually advance to another episode.
      if (
        shouldAutoSkipPreview(
          autoNext,
          Boolean(nextEpisode),
          time,
          previewInterval,
          previewSkippedRef.current,
        )
      ) {
        previewSkippedRef.current = true;
        player.current.currentTime = previewInterval.endTime;
      }
    }
  }

  const toggleAutoPlay = () => setSettings({ ...settings, autoPlay: !autoPlay });
  const toggleAutoNext = () => setSettings({ ...settings, autoNext: !autoNext });
  const toggleAutoSkip = () => setSettings({ ...settings, autoSkip: !autoSkip });

  const handlePlaybackEnded = async () => {
    // Flush progress even when Auto Next is disabled or this is the final
    // episode; AniList tracking is independent of navigation preferences.
    syncCurrentProgress();
    if (!autoNext || !nextEpisode) return;
    pendingAutoPlayRef.current = true;
    const wasInPip = pipActiveRef.current;
    try {
      await onEpisodeEnd();
    } catch (error) {
      pendingAutoPlayRef.current = false;
      console.error(`[Player] Error moving to next episode${wasInPip ? ' during PiP' : ''}:`, error);
    }
  };

  const srcUrl = typeof src === 'string'
    ? src
    : !Array.isArray(src) && 'src' in src && typeof src.src === 'string'
      ? src.src
      : '';
  const availableSkip = skipTimes.find(({ interval, skipType }) =>
    SKIPPABLE_TYPES.has(skipType.toLowerCase()) &&
    currentTime >= Math.max(0, interval.startTime - 5) && currentTime < interval.endTime,
  );
  const skipTargets = skipTimes.reduce<ChapterSkipTime[]>((targets, item) => {
    if (!SKIPPABLE_TYPES.has(item.skipType.toLowerCase())) return targets;
    const label = chapterLabel(item.skipType);
    return targets.some((target) => chapterLabel(target.skipType) === label)
      ? targets
      : [...targets, item];
  }, []);

  return (
    <div style={{ animation: 'popIn 0.25s ease-in-out' }}>
      {!srcUrl ? (
        <div
          style={{
            aspectRatio: '16/9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            borderRadius: 'var(--global-border-radius)',
          }}
        >
          {srcLoading ? (
            <div style={{ color: '#fff', opacity: 0.7, fontSize: '0.9rem' }}>
              ⏳ Resolving stream…
            </div>
          ) : (
            <div style={{ color: '#fff', opacity: 0.82, fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>
              <div>⚠️ {sourceError?.message || 'Cannot play media. Try a different source.'}</div>
              <button
                type='button'
                onClick={() => { void fetchAndSetAnimeSource(); }}
                style={{ marginTop: '0.75rem', padding: '0.45rem 0.8rem', cursor: 'pointer' }}
              >
                Retry source
              </button>
            </div>
          )}
        </div>
      ) : (
        <MediaPlayer
          key={`${language}-${sourceType}`}
          className='player'
          style={subtitleStyleVariables(subtitleSettings)}
          title={`${animeVideoTitle} - Episode ${episodeNumber}`}
          src={src}
          viewType='video'
          autoplay={autoPlay}
          crossorigin
          playsinline
          onLoadedMetadata={onLoadedMetadata}
          onAudioTracksChange={selectRequestedAudioTrack}
          onTextTracksChange={syncSubtitleTrackModes}
          onProviderChange={onProviderChange}
          onTimeUpdate={onTimeUpdate}
          onPictureInPictureChange={handlePictureInPictureChange}
          onPictureInPictureError={handlePictureInPictureError}
          onPause={() => syncCurrentProgress()}
          ref={player}
          aspectRatio='16/9'
          // The stream URL has already been resolved before MediaPlayer is
          // mounted. Using `load="play"` here makes Vidstack consume the
          // first tap just to call startLoading(), leaving the user to tap
          // the play button a second time. Preload the manifest instead so
          // one gesture can start playback immediately, while the bounded
          // HLS buffer keeps this safe for low-memory Apple devices.
          load='eager'
          posterLoad='eager'
          streamType='on-demand'
          keyTarget='player'
          onEnded={handlePlaybackEnded}
        >
          <MediaProvider>
            <Poster className='vds-poster' src={banner} alt='' />
            {vttContent ? (
              <Track
                key={`chapters-content-${episodeId}-${vttContent.length}`}
                kind='chapters'
                content={vttContent}
                type='vtt'
                label='Chapters'
                lang='en-US'
                default
              />
            ) : null}
            {subtitleTracks.map((track) => {
              return (
                <Track
                  key={`sub-${episodeId}-${track.id}`}
                  id={track.id}
                  kind='subtitles'
                  src={track.url}
                  label={track.name}
                  lang={track.lang}
                  type='vtt'
                />
              );
            })}
          </MediaProvider>
          {subtitleError && subtitleMode === 'ssub' && (
            <SubtitleStatus role='status' aria-live='polite'>
              {subtitleError}
            </SubtitleStatus>
          )}
          <DefaultVideoLayout
            icons={defaultLayoutIcons}
            slots={{
              captionsMenuItemsEnd: subtitleMode === 'ssub' ? (
                <SubtitleSettings aria-label='Subtitle appearance settings'>
                  <label>
                    Size
                    <select
                      aria-label='Subtitle size'
                      value={subtitleSettings.fontSize}
                      onChange={(event) => setSubtitleSettings((current) => ({
                        ...current,
                        fontSize: event.target.value as SubtitleFontSize,
                      }))}
                    >
                      <option value='small'>Small</option>
                      <option value='medium'>Medium</option>
                      <option value='large'>Large</option>
                      <option value='extra-large'>Extra large</option>
                    </select>
                  </label>
                  <label>
                    Background
                    <select
                      aria-label='Subtitle background'
                      value={subtitleSettings.background}
                      onChange={(event) => setSubtitleSettings((current) => ({
                        ...current,
                        background: event.target.value as SubtitleBackground,
                      }))}
                    >
                      <option value='none'>Outline only</option>
                      <option value='semi'>Semi-transparent</option>
                      <option value='black'>Solid black</option>
                    </select>
                  </label>
                </SubtitleSettings>
              ) : null,
            }}
          />
          {availableSkip && (
            <FloatingSkipButton
              onClick={(e) => {
                e.stopPropagation();
                if (player.current) player.current.currentTime = availableSkip.interval.endTime;
              }}
            >
              Skip {chapterLabel(availableSkip.skipType)} ➔
            </FloatingSkipButton>
          )}
        </MediaPlayer>
      )}
      <div
        className='player-menu'
        style={{
          backgroundColor: 'var(--global-div-tr)',
          borderRadius: 'var(--global-border-radius)',
        }}
      >
        <Button onClick={toggleAutoPlay}>
          {autoPlay ? <FaCheck /> : <RiCheckboxBlankFill />} Autoplay
        </Button>
        <Button $autoskip onClick={toggleAutoSkip}>
          {autoSkip ? <FaCheck /> : <RiCheckboxBlankFill />} Auto Skip
        </Button>
        {skipTargets.map((skipTarget) => (
          <Button
            key={`skip-${chapterLabel(skipTarget.skipType)}`}
            onClick={() => {
              if (player.current) player.current.currentTime = skipTarget.interval.endTime;
            }}
          >
            Skip {chapterLabel(skipTarget.skipType)}
          </Button>
        ))}
        {availableSkip && !skipTargets.some((target) => chapterLabel(target.skipType) === chapterLabel(availableSkip.skipType)) && (
          <Button onClick={() => {
            if (player.current) player.current.currentTime = availableSkip.interval.endTime;
          }}>
            Skip {chapterLabel(availableSkip.skipType)}
          </Button>
        )}
        <Button onClick={onPrevEpisode}>
          <TbPlayerTrackPrev /> Prev
        </Button>
        <Button onClick={onNextEpisode}>
          <TbPlayerTrackNext /> Next
        </Button>
        <Button onClick={toggleAutoNext}>
          {autoNext ? <FaCheck /> : <RiCheckboxBlankFill />} Auto Next
        </Button>
      </div>
    </div>
  );
}
