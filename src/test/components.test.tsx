import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { CardItem } from '../components/Cards/CardItem';
import { EpisodeList } from '../components/Watch/EpisodeList';
import { MediaSource, normalizeSubtitleMode } from '../components/Watch/Video/MediaSource';
import { SettingsProvider, useSettings } from '../components/Profile/SettingsProvider';
import type { Anime, Episode } from '../hooks/animeInterface';

const mockAnime: Anime = {
  id: '1',
  malId: '1',
  title: {
    romaji: 'Cowboy Bebop',
    english: 'Cowboy Bebop',
    native: 'カウボーイビバップ',
    userPreferred: 'Cowboy Bebop',
  },
  trailer: { id: '', site: '', thumbnail: '', thumbnailHash: '' },
  synonyms: [],
  isLicensed: true,
  isAdult: false,
  countryOfOrigin: 'JP',
  image: 'https://img.test/bebop.jpg',
  imageHash: '',
  cover: 'https://img.test/bebop-banner.jpg',
  coverHash: '',
  description: 'Space western bounty hunters.',
  status: 'Completed',
  releaseDate: 1998,
  totalEpisodes: 26,
  currentEpisode: 26,
  rating: 8.8,
  duration: 24,
  genres: ['Action', 'Sci-Fi'],
  studios: ['Sunrise'],
  subOrDub: 'sub',
  season: 'SPRING',
  popularity: 300000,
  type: 'TV',
  startDate: { year: 1998, month: 4, day: 3 },
  endDate: { year: 1999, month: 4, day: 24 },
  recommendations: [],
  characters: [],
  relations: [],
  mappings: [],
  artwork: [],
  episodes: [],
  color: '#2b50aa',
};

describe('Core UI Components & iPad Optimization Verification', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('CardItem renders title, lazy-loads image with async decoding and iPad memory optimizations', () => {
    render(
      <BrowserRouter>
        <CardItem anime={mockAnime} />
      </BrowserRouter>,
    );

    const titles = screen.getAllByText('Cowboy Bebop');
    expect(titles.length).toBeGreaterThanOrEqual(1);

    const img = screen.getByAltText('Cowboy Bebop Cover') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
  });

  it('EpisodeList supports search filtering across episodes', () => {
    const mockEpisodes: Episode[] = [
      { id: 'ep-1', number: 1, title: 'Asteroid Blues', description: '', image: '', imageHash: '', airDate: null },
      { id: 'ep-2', number: 2, title: 'Stray Dog Strut', description: '', image: '', imageHash: '', airDate: null },
      { id: 'ep-3', number: 3, title: 'Honky Tonk Women', description: '', image: '', imageHash: '', airDate: null },
    ];

    const onSelect = vi.fn();

    render(
      <EpisodeList
        animeId="1"
        episodes={mockEpisodes}
        selectedEpisodeId="ep-1"
        onEpisodeSelect={onSelect}
        maxListHeight="30rem"
      />,
    );

    // Initial render displays all episodes
    expect(screen.getByText(/Asteroid Blues/i)).toBeInTheDocument();
    expect(screen.getByText(/Stray Dog Strut/i)).toBeInTheDocument();

    // Type in search bar to filter
    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'Dog' } });

    expect(screen.getByText(/Stray Dog Strut/i)).toBeInTheDocument();
    expect(screen.queryByText(/Asteroid Blues/i)).not.toBeInTheDocument();
  });

  it('MediaSource exposes H-Sub and S-Sub subtitle modes alongside Dub', () => {
    render(
      <BrowserRouter>
        <MediaSource
          sourceType='anikoto'
          setSourceType={vi.fn()}
          language='hsub'
          setLanguage={vi.fn()}
          downloadLink='https://example.com/download'
          episodeId='1'
        />
      </BrowserRouter>,
    );

    expect(screen.getByText('H-Sub')).toBeInTheDocument();
    expect(screen.getByText('S-Sub')).toBeInTheDocument();
    expect(screen.getByText('Dub')).toBeInTheDocument();
  });

  it('normalizeSubtitleMode keeps legacy sub values consistent with the S-Sub UX', () => {
    expect(normalizeSubtitleMode('sub')).toBe('ssub');
    expect(normalizeSubtitleMode('ssub')).toBe('ssub');
    expect(normalizeSubtitleMode('hsub')).toBe('hsub');
    expect(normalizeSubtitleMode('dub')).toBe('dub');
  });

  it('SettingsProvider manages user preferences (autoPlay, autoSkip, autoNext) in safeStorage', () => {
    const TestComponent = () => {
      const { settings, setSettings } = useSettings();
      return (
        <div>
          <span data-testid="autoplay-val">{settings.autoPlay ? 'ON' : 'OFF'}</span>
          <button onClick={() => setSettings({ ...settings, autoPlay: !settings.autoPlay })}>
            Toggle Autoplay
          </button>
        </div>
      );
    };

    render(
      <SettingsProvider>
        <TestComponent />
      </SettingsProvider>,
    );

    expect(screen.getByTestId('autoplay-val').textContent).toBe('ON');

    fireEvent.click(screen.getByText('Toggle Autoplay'));
    expect(screen.getByTestId('autoplay-val').textContent).toBe('OFF');
  });
});
