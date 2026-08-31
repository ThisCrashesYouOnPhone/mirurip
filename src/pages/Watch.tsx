import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaBell } from 'react-icons/fa';
import styled from 'styled-components';
import Image404URL from '/src/assets/404.webp';
import { EpisodeList } from '../components/Watch/EpisodeList';
import { Player } from '../components/Watch/Video/Player';
import { WatchAnimeData as AnimeData } from '../components/Watch/WatchAnimeData';
import { AnimeDataList } from '../components/Watch/AnimeDataList';
import { MediaSource } from '../components/Watch/Video/MediaSource';
import { AniListTracker } from '../components/Watch/AniListTracker';
import { SkeletonPlayer } from '../components/Skeletons/Skeletons';
import { useCountdown } from '../hooks/useCountdown';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageGetJson } from '../client/safeStorage';
import { fetchAnimeEpisodes, fetchAnimeData } from '../hooks/useApi';
import type { Episode } from '../hooks/animeInterface';

const WatchContainer = styled.div``;

const WatchWrapper = styled.div`
  font-size: 0.9rem;
  gap: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: var(--global-primary-bg);
  color: var(--global-text);
  width: 100%;
  min-width: 0;

  @media (min-width: 1000px) {
    flex-direction: row;
    align-items: flex-start;
  }
`;

const DataWrapper = styled.div`
  display: grid;
  gap: 1rem;
  /* Keep the player metadata/source column dominant on desktop. */
  grid-template-columns: minmax(0, 3.25fr) minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  @media (max-width: 1000px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const SourceAndData = styled.div<{ $videoPlayerWidth: string }>`
  width: 100%;
  min-width: 0;
`;

const RalationsTable = styled.div`
  padding: 0;
  margin-top: 1rem;
  @media (max-width: 1000px) {
    margin-top: 0rem;
  }
`;

const VideoPlayerContainer = styled.div`
  position: relative;
  width: 100%;
  border-radius: var(--global-border-radius);
  transform: translateZ(0);
  min-width: 0;

  @media (min-width: 1000px) {
    flex: 1 1 auto;
  }
`;

const EpisodeListContainer = styled.div`
  width: 100%;
  min-width: 0;
  max-height: 100%;
  transform: translateZ(0);

  @media (min-width: 1000px) {
    flex: 1 1 500px;
    max-height: 100%;
  }

  @media (max-width: 1000px) {
    padding-left: 0rem;
  }
`;

const NoEpsFoundDiv = styled.div`
  text-align: center;
  margin-top: 7.5rem;
  margin-bottom: 10rem;
  @media (max-width: 1000px) {
    margin-top: 2.5rem;
    margin-bottom: 6rem;
  }
`;

const NoEpsImage = styled.div`
  margin-bottom: 3rem;
  max-width: 100%;

  img {
    border-radius: var(--global-border-radius);
    max-width: 100%;
    @media (max-width: 500px) {
      max-width: 70%;
    }
  }
`;

const StyledHomeButton = styled.button`
  color: white;
  border-radius: var(--global-border-radius);
  border: none;
  background-color: var(--primary-accent);
  margin-top: 0.5rem;
  font-weight: bold;
  padding: 1rem;
  cursor: pointer;
  transform: translate(-50%, -50%);
  transition: transform 0.2s ease-in-out;
  &:hover,
  &:active,
  &:focus {
    transform: translate(-50%, -50%) scale(1.05);
  }
`;

const IframeTrailer = styled.iframe`
  position: relative;
  border-radius: var(--global-border-radius);
  border: none;
  top: 0;
  left: 0;
  width: 70%;
  height: 25rem;
  @media (max-width: 1000px) {
    width: 100%;
    height: 18rem;
  }
`;

const LOCAL_STORAGE_KEYS = {
  LAST_WATCHED_EPISODE: 'last-watched-',
  WATCHED_EPISODES: 'watched-episodes-',
  LAST_ANIME_VISITED: 'last-anime-visited',
};

const LEGACY_SOURCE_KEYS = new Set(['default', 'embed', 'animegg', 'anidb', 'anibd']);
const normalizeSourceType = (source: string) =>
  LEGACY_SOURCE_KEYS.has(source) ? 'anikoto' : source || 'anikoto';

const Watch: React.FC = () => {
  const videoPlayerContainerRef = useRef<HTMLDivElement>(null);
  const [videoPlayerWidth, setVideoPlayerWidth] = useState('100%');
  const getSourceTypeKey = (id: string | undefined) => `source-[${id}]`;
  const getLanguageKey = (id: string | undefined) => `subOrDub-[${id}]`;

  const updateVideoPlayerWidth = useCallback(() => {
    if (videoPlayerContainerRef.current) {
      const width = `${videoPlayerContainerRef.current.offsetWidth}px`;
      setVideoPlayerWidth(width);
    }
  }, []);

  const [maxEpisodeListHeight, setMaxEpisodeListHeight] = useState<string>('100%');
  const { animeId, animeTitle: _animeTitle, episodeNumber } = useParams<{
    animeId?: string;
    animeTitle?: string;
    episodeNumber?: string;
  }>();

  const navigate = useNavigate();
  const [selectedBackgroundImage, setSelectedBackgroundImage] = useState<string>('');
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState<Episode>({
    id: '0',
    number: 1,
    title: '',
    image: '',
    description: '',
    imageHash: '',
    airDate: '',
  });

  const [animeInfo, setAnimeInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [, setIsEpisodeChanging] = useState(false);
  const [showNoEpisodesMessage, setShowNoEpisodesMessage] = useState(false);
  const [lastKeypressTime, setLastKeypressTime] = useState(0);
  const [sourceType, setSourceType] = useState(() =>
    normalizeSourceType(safeLocalStorageGet(getSourceTypeKey(animeId), 'anikoto')),
  );
  const [language, setLanguage] = useState(() =>
    safeLocalStorageGet(getLanguageKey(animeId), 'ssub'),
  );
  const [downloadLink, setDownloadLink] = useState('');

  const nextEpisodeAiringTime =
    animeInfo && animeInfo.nextAiringEpisode
      ? animeInfo.nextAiringEpisode.airingAt * 1000
      : null;
  const nextEpisodenumber = animeInfo?.nextAiringEpisode?.episode;
  const countdown = useCountdown(nextEpisodeAiringTime);
  const currentEpisodeIndex = episodes.findIndex((ep) => ep.id === currentEpisode.id);
  const nextEpisode = currentEpisodeIndex >= 0 && currentEpisodeIndex < episodes.length - 1
    ? episodes[currentEpisodeIndex + 1]
    : undefined;
  const hasPreviousEpisode = currentEpisodeIndex > 0;
  const routeEpisodeNumber = Number.parseInt(episodeNumber || '', 10);
  const trackerEpisodeNumber = Number.isFinite(routeEpisodeNumber)
    ? routeEpisodeNumber
    : currentEpisode.number;

  const updateWatchedEpisodes = useCallback((episode: Episode) => {
    if (!animeId) return;
    const watchedEpisodes = safeLocalStorageGetJson<Episode[]>(
      LOCAL_STORAGE_KEYS.WATCHED_EPISODES + animeId,
      [],
    );

    const upsertEpisode = (episodes: Episode[]) => {
      const index = episodes.findIndex((ep) => ep.id === episode.id);
      if (index === -1) episodes.push(episode);
      else episodes[index] = { ...episodes[index], ...episode };
      return episodes;
    };

    const updatedEpisodes = upsertEpisode(watchedEpisodes);
    safeLocalStorageSet(
      LOCAL_STORAGE_KEYS.WATCHED_EPISODES + animeId,
      JSON.stringify(updatedEpisodes),
    );

    const allWatched = safeLocalStorageGetJson<Record<string, Episode[]>>(
      'watched-episodes',
      {},
    );
    allWatched[animeId] = upsertEpisode(allWatched[animeId] || []);
    safeLocalStorageSet('watched-episodes', JSON.stringify(allWatched));
  }, [animeId]);

  const handleEpisodeSelect = useCallback(
    async (selectedEpisode: Episode) => {
      setIsEpisodeChanging(true);
      const titleSlug = selectedEpisode.id.split('-episode')[0] || `anime-${animeId}`;
      setCurrentEpisode(selectedEpisode);

      if (animeId) {
        safeLocalStorageSet(
          LOCAL_STORAGE_KEYS.LAST_WATCHED_EPISODE + animeId,
          JSON.stringify({
            id: selectedEpisode.id,
            title: selectedEpisode.title,
            number: selectedEpisode.number,
          }),
        );
      }
      updateWatchedEpisodes(selectedEpisode);

      navigate(
        `/watch/${animeId}/${encodeURI(titleSlug)}/${selectedEpisode.number}`,
        { replace: true },
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      setIsEpisodeChanging(false);
    },
    [animeId, navigate, updateWatchedEpisodes],
  );

  const updateDownloadLink = useCallback((link: string) => {
    setDownloadLink(link);
  }, []);

  const handleEpisodeEnd = async () => {
    const nextIndex = currentEpisodeIndex + 1;
    if (nextIndex >= episodes.length) {
      return;
    }
    await handleEpisodeSelect(episodes[nextIndex]);
  };

  const onPrevEpisode = () => {
    const prevIndex = currentEpisodeIndex - 1;
    if (prevIndex >= 0) {
      handleEpisodeSelect(episodes[prevIndex]);
    }
  };

  const onNextEpisode = () => {
    const nextIndex = currentEpisodeIndex + 1;
    if (nextIndex < episodes.length) {
      handleEpisodeSelect(episodes[nextIndex]);
    }
  };

  useEffect(() => {
    setSourceType(normalizeSourceType(safeLocalStorageGet(getSourceTypeKey(animeId), 'anikoto')));
    setLanguage(safeLocalStorageGet(getLanguageKey(animeId), 'ssub'));
  }, [animeId]);

  useEffect(() => {
    if (animeId) {
      safeLocalStorageSet(getLanguageKey(animeId), language);
      safeLocalStorageSet(getSourceTypeKey(animeId), normalizeSourceType(sourceType));
    }
  }, [language, sourceType, animeId]);

  // Fetch anime metadata
  useEffect(() => {
    let isMounted = true;
    let franchiseTimer: number | null = null;
    const fetchInfo = async () => {
      if (!animeId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        // Render the player from the base AniList record immediately. The
        // bounded franchise traversal is useful for the Seasons panel, but it
        // should never delay first playback on slower devices.
        const info = await fetchAnimeData(animeId, 'anikoto');
        if (isMounted && info) {
          setAnimeInfo(info);

          const existing = safeLocalStorageGetJson<
            Record<string, {
              timestamp?: number;
              titleEnglish?: string;
              titleRomaji?: string;
              image?: string;
              cover?: string;
            }>
          >(LOCAL_STORAGE_KEYS.LAST_ANIME_VISITED, {});
          existing[animeId] = {
            ...existing[animeId],
            timestamp: Date.now(),
            titleEnglish: info.title?.english || '',
            titleRomaji: info.title?.romaji || '',
            image: info.image || '',
            cover: info.cover || '',
          };
          safeLocalStorageSet(
            LOCAL_STORAGE_KEYS.LAST_ANIME_VISITED,
            JSON.stringify(existing),
          );

          // Seasons are below the player and are already represented by the
          // base relation payload. Defer the bounded franchise traversal so
          // it cannot compete with the first manifest/episode requests.
          franchiseTimer = window.setTimeout(() => {
            void fetchAnimeData(animeId, 'anikoto', true).then((franchiseInfo) => {
              if (isMounted && franchiseInfo.franchiseSeasons) {
                setAnimeInfo((current: any) => current
                  ? { ...current, franchiseSeasons: franchiseInfo.franchiseSeasons }
                  : current);
              }
            }).catch((error) => {
              console.warn('Failed to load franchise seasons:', error);
            });
          }, 2500);
        }
      } catch (error) {
        console.warn('Failed to fetch anime data:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInfo();
    return () => {
      isMounted = false;
      if (franchiseTimer !== null) window.clearTimeout(franchiseTimer);
    };
  }, [animeId]);

  // Fetch episodes
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!animeId) return;
      try {
        const isDub = language === 'dub';
        const animeData = await fetchAnimeEpisodes(animeId, undefined, isDub);
        if (isMounted && animeData && animeData.length > 0) {
          setEpisodes(animeData);

          // Find episode to navigate to
          let targetEp: Episode | undefined;
          if (episodeNumber) {
            targetEp = animeData.find((ep: Episode) => ep.number.toString() === episodeNumber.toString());
          } else {
            const savedData = safeLocalStorageGetJson<{ id: string; number: number } | null>(
              LOCAL_STORAGE_KEYS.LAST_WATCHED_EPISODE + animeId,
              null,
            );
            if (savedData) {
              targetEp = animeData.find((ep: Episode) => ep.number === savedData.number);
            }
          }

          const selectedEp = targetEp || animeData[0];
          if (selectedEp) {
            setCurrentEpisode(selectedEp);
            const slug = selectedEp.id.split('-episode')[0] || `anime-${animeId}`;
            navigate(`/watch/${animeId}/${slug}/${selectedEp.number}`, { replace: true });
          }
        }
      } catch (error) {
        console.warn('Failed to fetch episodes:', error);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [animeId, language, episodeNumber, navigate]);

  useEffect(() => {
    if (animeInfo) {
      const banner = animeInfo.cover || animeInfo.image || '';
      setSelectedBackgroundImage(banner);
    }
  }, [animeInfo, currentEpisode]);

  useEffect(() => {
    updateVideoPlayerWidth();
    const handleResize = () => updateVideoPlayerWidth();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateVideoPlayerWidth]);

  useEffect(() => {
    const updateMaxHeight = () => {
      if (videoPlayerContainerRef.current) {
        const height = videoPlayerContainerRef.current.offsetHeight;
        if (height > 0) setMaxEpisodeListHeight(`${height}px`);
      }
    };
    updateMaxHeight();
    window.addEventListener('resize', updateMaxHeight);
    return () => window.removeEventListener('resize', updateMaxHeight);
  }, []);

  // Keyboard navigation Shift+N / Shift+P
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const targetTagName = (event.target as HTMLElement).tagName.toLowerCase();
      if (targetTagName === 'input' || targetTagName === 'textarea') return;
      if (!event.shiftKey || !['N', 'P'].includes(event.key.toUpperCase())) return;

      const now = Date.now();
      if (now - lastKeypressTime < 200) return;
      setLastKeypressTime(now);

      const currentIndex = episodes.findIndex((ep) => ep.id === currentEpisode.id);
      if (event.key.toUpperCase() === 'N' && currentIndex < episodes.length - 1) {
        handleEpisodeSelect(episodes[currentIndex + 1]);
      } else if (event.key.toUpperCase() === 'P' && currentIndex > 0) {
        handleEpisodeSelect(episodes[currentIndex - 1]);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [episodes, currentEpisode, handleEpisodeSelect, lastKeypressTime]);

  useEffect(() => {
    if (animeInfo && animeInfo.title) {
      const title = animeInfo.title.english || animeInfo.title.romaji || 'Anime';
      document.title = `Watch ${title} | Miruro`;
    }
  }, [animeInfo]);

  useEffect(() => {
    if (!loading && episodes.length === 0) {
      setShowNoEpisodesMessage(true);
    } else {
      setShowNoEpisodesMessage(false);
    }
  }, [loading, episodes]);

  return (
    <WatchContainer>
      {animeInfo && animeInfo.status === 'Not yet aired' && animeInfo.trailer?.id ? (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <h2>Time Remaining:</h2>
          {countdown && countdown !== 'Airing now or aired' ? (
            <p>
              <FaBell /> {countdown}
            </p>
          ) : (
            <p>Upcoming</p>
          )}
          <IframeTrailer
            src={`https://www.youtube.com/embed/${animeInfo.trailer.id}`}
            allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
            allowFullScreen
            title='Anime Trailer'
          />
        </div>
      ) : showNoEpisodesMessage ? (
        <NoEpsFoundDiv>
          <h2>No episodes found {':('}</h2>
          <NoEpsImage>
            <img src={Image404URL} alt='404 Not Found' />
          </NoEpsImage>
          <StyledHomeButton onClick={() => navigate('/home')}>Go back Home</StyledHomeButton>
        </NoEpsFoundDiv>
      ) : (
        <WatchWrapper>
          <VideoPlayerContainer ref={videoPlayerContainerRef}>
            {loading ? (
              <SkeletonPlayer />
            ) : (
              <Player
                episodeId={currentEpisode.id}
                malId={animeInfo?.malId}
                animeId={animeId}
                totalEpisodes={animeInfo?.totalEpisodes}
                banner={selectedBackgroundImage}
                updateDownloadLink={updateDownloadLink}
                onEpisodeEnd={handleEpisodeEnd}
                onPrevEpisode={onPrevEpisode}
                onNextEpisode={onNextEpisode}
                animeTitle={animeInfo?.title?.english || animeInfo?.title?.romaji}
                sourceType={sourceType}
                language={language}
                episodeNumber={currentEpisode.number}
                episodeTitle={currentEpisode.title}
                nextEpisode={nextEpisode}
                hasPreviousEpisode={hasPreviousEpisode}
              />
            )}
          </VideoPlayerContainer>
          <EpisodeListContainer style={{ maxHeight: maxEpisodeListHeight }}>
            {loading ? (
              <SkeletonPlayer />
            ) : (
              <EpisodeList
                animeId={animeId}
                episodes={episodes}
                selectedEpisodeId={currentEpisode.id}
                onEpisodeSelect={(epId: string) => {
                  const episode = episodes.find((e) => e.id === epId);
                  if (episode) {
                    handleEpisodeSelect(episode);
                  }
                }}
                maxListHeight={maxEpisodeListHeight}
              />
            )}
          </EpisodeListContainer>
        </WatchWrapper>
      )}
      <DataWrapper>
        <SourceAndData $videoPlayerWidth={videoPlayerWidth}>
          {animeInfo && animeInfo.status !== 'Not yet aired' && (
            <MediaSource
              sourceType={sourceType}
              setSourceType={setSourceType}
              language={language}
              setLanguage={setLanguage}
              downloadLink={downloadLink}
              episodeId={currentEpisode.number ? currentEpisode.number.toString() : '1'}
              episodeTitle={currentEpisode.title}
              episodeAirDate={currentEpisode.airDate}
              airingTime={
                animeInfo && animeInfo.status === 'Ongoing' && countdown !== 'Airing now or aired'
                  ? countdown
                  : undefined
              }
              nextEpisodenumber={nextEpisodenumber}
            />
          )}
          {animeInfo && animeId && (
            <AniListTracker
              mediaId={animeId}
              title={animeInfo.title?.english || animeInfo.title?.romaji || 'Anime'}
              episodeNumber={trackerEpisodeNumber}
              totalEpisodes={animeInfo.totalEpisodes}
            />
          )}
          {animeInfo && <AnimeData animeData={animeInfo} />}
        </SourceAndData>
        <RalationsTable>
          {animeInfo && <AnimeDataList animeData={animeInfo} />}
        </RalationsTable>
      </DataWrapper>
    </WatchContainer>
  );
};

export default Watch;
