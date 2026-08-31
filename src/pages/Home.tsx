import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { HomeCarousel } from '../components/Home/HomeCarousel';
import { HomeSideBar } from '../components/Home/HomeSideBar';
import { EpisodeCard } from '../components/Home/EpisodeCard';
import { CardGrid, StyledCardGrid } from '../components/Cards/CardGrid';
import { SkeletonSlide, SkeletonCard } from '../components/Skeletons/Skeletons';
import {
  fetchTrendingAnime,
  fetchPopularAnime,
  fetchTopAnime,
  fetchTopAiringAnime,
  fetchUpcomingSeasons,
  getNextSeason,
  safeLocalStorageGetJson,
  safeLocalStorageSet,
  safeLocalStorageRemove,
} from '../index';
import type { Paging, Anime, Episode } from '../hooks/animeInterface';

const SimpleLayout = styled.div`
  gap: 1rem;
  margin: 0 auto;
  max-width: 125rem;
  border-radius: var(--global-border-radius);
  display: flex;
  flex-direction: column;
`;

const ContentSidebarLayout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
  width: 100%;

  @media (min-width: 1000px) {
    flex-direction: row;
    justify-content: space-between;
  }
`;

const TabContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  border-radius: var(--global-border-radius);
  width: 100%;
`;

const Tab = styled.div<{ $isActive: boolean }>`
  background: ${({ $isActive }) =>
    $isActive ? 'var(--primary-accent)' : 'transparent'};
  border-radius: var(--global-border-radius);
  border: none;
  cursor: pointer;
  font-weight: bold;
  color: var(--global-text);
  position: relative;
  overflow: hidden;
  margin: 0;
  font-size: 0.8rem;
  padding: 0.8rem 1.2rem;
  transition: background-color 0.2s ease;

  &:hover,
  &:active,
  &:focus {
    background: var(--primary-accent);
  }

  @media (max-width: 500px) {
    padding: 0.5rem 0.8rem;
  }
`;

const Section = styled.section`
  padding: 0rem;
  border-radius: var(--global-border-radius);
`;

const ErrorMessage = styled.div`
  padding: 1rem;
  margin: 1rem 0;
  background-color: #ffdddd;
  border-left: 4px solid #f44336;
  color: #f44336;
  border-radius: var(--global-border-radius);

  p {
    margin: 0;
    font-weight: bold;
  }
`;

const Home = () => {
  const [itemsCount, setItemsCount] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth > 500 ? 24 : 15,
  );

  const [activeTab, setActiveTab] = useState(() => {
    const savedData = safeLocalStorageGetJson<{ tab: string; timestamp: number } | null>('home tab', null);
    if (savedData && Date.now() - savedData.timestamp < 300000) {
      return savedData.tab;
    }
    safeLocalStorageRemove('home tab');
    return 'trending';
  });

  const [state, setState] = useState({
    watchedEpisodes: [] as Episode[],
    trendingAnime: [] as Anime[],
    popularAnime: [] as Anime[],
    topAnime: [] as Anime[],
    topAiring: [] as Anime[],
    Upcoming: [] as Anime[],
    error: null as string | null,
    loading: {
      trending: true,
      popular: true,
      topRated: true,
      topAiring: true,
      Upcoming: true,
    },
  });

  useEffect(() => {
    const handleResize = () => {
      setItemsCount(window.innerWidth > 500 ? 24 : 15);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const allEpisodes = safeLocalStorageGetJson<Record<string, Episode[]>>('watched-episodes', {});
    const latestEpisodes: Episode[] = [];
    Object.keys(allEpisodes).forEach((animeId) => {
      const episodes = allEpisodes[animeId];
      if (Array.isArray(episodes) && episodes.length > 0) {
        latestEpisodes.push(episodes[episodes.length - 1]);
      }
    });
    setState((prevState) => ({
      ...prevState,
      watchedEpisodes: latestEpisodes,
    }));
  }, []);

  useEffect(() => {
    // Request only what the page can display. The previous 1.4 multiplier
    // made the first view wait on dozens of unnecessary AniList records.
    const fetchCount = itemsCount;
    let cancelled = false;
    const fetchData = async () => {
      setState((prevState) => ({
        ...prevState,
        error: null,
        loading: { trending: true, popular: true, topRated: true, topAiring: true, Upcoming: true },
      }));

      // Trending is the critical above-the-fold request. Render it as soon as
      // it arrives, then load secondary shelves without blocking the first view.
      try {
        const trending = await fetchTrendingAnime(1, fetchCount);
        if (!cancelled) {
          setState((prevState) => ({
            ...prevState,
            trendingAnime: filterAndTrimAnime(trending),
            loading: { ...prevState.loading, trending: false },
          }));
        }
      } catch {
        if (!cancelled) {
          setState((prevState) => ({
            ...prevState,
            error: 'An unexpected error occurred while fetching anime listings.',
            loading: { ...prevState.loading, trending: false },
          }));
        }
      }

      const secondaryRequests = [
        ['popularAnime', fetchPopularAnime(1, fetchCount), 'popular'],
        ['topAnime', fetchTopAnime(1, fetchCount), 'topRated'],
        ['topAiring', fetchTopAiringAnime(1, 6), 'topAiring'],
        ['Upcoming', fetchUpcomingSeasons(1, 6), 'Upcoming'],
      ] as const;

      const secondaryResults = await Promise.allSettled(secondaryRequests.map(([, request]) => request));
      if (cancelled) return;
      secondaryResults.forEach((result, index) => {
        const [field, , loadingKey] = secondaryRequests[index];
        if (result.status === 'fulfilled') {
          setState((prevState) => ({
            ...prevState,
            [field]: filterAndTrimAnime(result.value),
            loading: { ...prevState.loading, [loadingKey]: false },
          }));
        } else {
          setState((prevState) => ({
            ...prevState,
            error: 'Some anime listings could not be loaded.',
            loading: { ...prevState.loading, [loadingKey]: false },
          }));
        }
      });
      setState((prevState) => ({
        ...prevState,
        loading: { ...prevState.loading, popular: false, topRated: false, topAiring: false, Upcoming: false },
      }));

    };

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [itemsCount]);

  useEffect(() => {
    document.title = `Miruro | Watch Anime Online, Free Anime Streaming`;
  }, [activeTab]);

  useEffect(() => {
    safeLocalStorageSet('home tab', JSON.stringify({ tab: activeTab, timestamp: Date.now() }));
  }, [activeTab]);

  const filterAndTrimAnime = (animeList: Paging) =>
    (animeList?.results || []).slice(0, itemsCount);

  const renderCardGrid = (
    animeData: Anime[],
    isLoading: boolean,
    hasError: boolean,
  ) => (
    <Section>
      {isLoading || hasError ? (
        <StyledCardGrid>
          {Array.from({ length: itemsCount }, (_, index) => (
            <SkeletonCard key={index} />
          ))}
        </StyledCardGrid>
      ) : (
        <CardGrid
          animeData={animeData}
          hasNextPage={false}
          onLoadMore={() => {}}
        />
      )}
    </Section>
  );

  const handleTabClick = (tabName: string) => {
    setActiveTab(tabName);
  };

  const SEASON = getNextSeason();

  return (
    <SimpleLayout>
      {state.error && (
        <ErrorMessage title='Error Message'>
          <p>ERROR: {state.error}</p>
        </ErrorMessage>
      )}
      {state.loading.trending || state.error ? (
        <SkeletonSlide />
      ) : (
        <HomeCarousel
          data={state.trendingAnime}
          loading={state.loading.trending}
          error={state.error}
        />
      )}
      <EpisodeCard />
      <ContentSidebarLayout>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            gap: '1rem',
          }}
        >
          <TabContainer>
            <Tab
              title='Trending Tab'
              $isActive={activeTab === 'trending'}
              onClick={() => handleTabClick('trending')}
            >
              TRENDING
            </Tab>
            <Tab
              title='Popular Tab'
              $isActive={activeTab === 'popular'}
              onClick={() => handleTabClick('popular')}
            >
              POPULAR
            </Tab>
            <Tab
              title='Top Rated Tab'
              $isActive={activeTab === 'topRated'}
              onClick={() => handleTabClick('topRated')}
            >
              TOP RATED
            </Tab>
          </TabContainer>
          <div>
            {activeTab === 'trending' &&
              renderCardGrid(
                state.trendingAnime,
                state.loading.trending,
                !!state.error,
              )}
            {activeTab === 'popular' &&
              renderCardGrid(
                state.popularAnime,
                state.loading.popular,
                !!state.error,
              )}
            {activeTab === 'topRated' &&
              renderCardGrid(
                state.topAnime,
                state.loading.topRated,
                !!state.error,
              )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              padding: '0.75rem 0',
            }}
          >
            TOP AIRING
          </div>
          <HomeSideBar animeData={state.topAiring} />
          <div
            style={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              padding: '0.75rem 0',
            }}
          >
            UPCOMING {SEASON}
          </div>
          <HomeSideBar animeData={state.Upcoming} />
        </div>
      </ContentSidebarLayout>
    </SimpleLayout>
  );
};

export default Home;
