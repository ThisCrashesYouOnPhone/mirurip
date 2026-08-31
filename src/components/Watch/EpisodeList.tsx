import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay,
  faThList,
  faTh,
  faSearch,
  faImage,
} from '@fortawesome/free-solid-svg-icons';
import { Episode } from '../../index';
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
  safeLocalStorageGetJson,
} from '../../client/safeStorage';

interface Props {
  animeId: string | undefined;
  episodes: Episode[];
  selectedEpisodeId: string;
  onEpisodeSelect: (id: string) => void;
  maxListHeight: string;
}

const ListContainer = styled.div<{ $maxHeight: string }>`
  background-color: var(--global-secondary-bg);
  color: var(--global-text);
  border-radius: var(--global-border-radius);
  overflow: hidden;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  max-height: ${({ $maxHeight }) => $maxHeight};
  transform: translateZ(0);
  @media (max-width: 1000px) {
    max-height: 18rem;
  }
  @media (max-width: 500px) {
    max-height: ${({ $maxHeight }) => $maxHeight};
  }
`;

const EpisodeGrid = styled.div<{ $isRowLayout: boolean }>`
  display: grid;
  grid-template-columns: ${({ $isRowLayout }) =>
    $isRowLayout ? '1fr' : 'repeat(auto-fill, minmax(4rem, 1fr))'};
  gap: 0.29rem;
  padding: 0.4rem;
  overflow-y: auto;
  flex-grow: 1;
  -webkit-overflow-scrolling: touch;
`;

const EpisodeImage = styled.img`
  max-width: 250px;
  max-height: 150px;
  height: auto;
  margin-top: 0.5rem;
  border-radius: var(--global-border-radius);
  object-fit: cover;
  @media (max-width: 500px) {
    max-width: 125px;
    max-height: 80px;
  }
`;

const ListItem = styled.button<{
  $isSelected: boolean;
  $isRowLayout: boolean;
  $isWatched: boolean;
}>`
  transition: padding 0.2s ease-in-out;
  background-color: ${({ $isSelected, $isWatched }) =>
    $isSelected
      ? $isWatched
        ? 'var(--primary-accent)'
        : 'var(--primary-accent-bg)'
      : $isWatched
        ? 'rgba(128, 128, 207, 0.25)'
        : 'var(--global-tertiary-bg)'};

  border: none;
  border-radius: var(--global-border-radius);
  color: ${({ $isSelected, $isWatched }) =>
    $isSelected
      ? 'var(--global-text)'
      : $isWatched
        ? 'var(--primary-accent)'
        : 'grey'};

  padding: ${({ $isRowLayout }) =>
    $isRowLayout ? '0.6rem 0.5rem' : '0.4rem 0'};
  text-align: ${({ $isRowLayout }) => ($isRowLayout ? 'left' : 'center')};
  cursor: pointer;
  justify-content: ${({ $isRowLayout }) =>
    $isRowLayout ? 'space-between' : 'center'};
  align-items: center;

  &:hover,
  &:active,
  &:focus {
    filter: brightness(1.1);
    padding-left: ${({ $isRowLayout }) => ($isRowLayout ? '0.8rem' : '')};
  }
`;

const ControlsContainer = styled.div`
  display: flex;
  align-items: center;
  background-color: var(--global-secondary-bg);
  border-bottom: 1px solid var(--global-shadow);
  padding: 0.25rem 0;
  min-width: 0;
  flex-wrap: wrap;
  gap: 0.25rem;
`;

const SelectInterval = styled.select`
  padding: 0.5rem;
  background-color: var(--global-secondary-bg);
  color: var(--global-text);
  border: none;
  border-radius: var(--global-border-radius);
`;

const LayoutToggle = styled.button`
  background-color: var(--global-secondary-bg);
  border: 1px solid var(--global-shadow);
  padding: 0.5rem;
  margin-right: 0.5rem;
  cursor: pointer;
  color: var(--global-text);
  border-radius: var(--global-border-radius);
  transition: background-color 0.15s, color 0.15s;

  &:hover,
  &:active,
  &:focus {
    background-color: var(--global-button-hover-bg);
  }
`;

const SearchContainer = styled.div`
  display: flex;
  align-items: center;
  background-color: var(--global-secondary-bg);
  border: 1px solid var(--global-shadow);
  padding: 0.5rem;
  gap: 0.25rem;
  margin: 0 0.5rem;
  border-radius: var(--global-border-radius);
  flex: 1 1 10rem;
  min-width: 0;
`;

const SearchInput = styled.input`
  border: none;
  background-color: transparent;
  color: var(--global-text);
  outline: none;
  width: 100%;

  &::placeholder {
    color: var(--global-placeholder);
  }
`;

const Icon = styled.div`
  color: var(--global-text);
  opacity: 0.5;
  font-size: 0.8rem;
  @media (max-width: 768px) {
    display: none;
  }
`;

const EpisodeNumber = styled.span``;
const EpisodeTitle = styled.span`
  padding: 0.5rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const EpisodeList: React.FC<Props> = ({
  animeId,
  episodes,
  selectedEpisodeId,
  onEpisodeSelect,
  maxListHeight,
}) => {
  const episodeGridRef = useRef<HTMLDivElement>(null);
  const episodeRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const [interval, setInterval] = useState<[number, number]>([0, 99]);
  const [isRowLayout, setIsRowLayout] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [watchedEpisodes, setWatchedEpisodes] = useState<Episode[]>([]);
  const defaultLayoutMode = episodes.some((ep) => ep.title) ? 'list' : 'grid';

  const [displayMode, setDisplayMode] = useState<'list' | 'grid' | 'imageList'>(
    () => {
      const savedMode = animeId
        ? safeLocalStorageGet(`listLayout-[${animeId}]`, defaultLayoutMode)
        : defaultLayoutMode;
      return (savedMode as 'list' | 'grid' | 'imageList') || defaultLayoutMode;
    },
  );

  useEffect(() => {
    if (animeId && watchedEpisodes.length > 0) {
      safeLocalStorageSet(
        `watched-episodes-${animeId}`,
        JSON.stringify(watchedEpisodes),
      );
    }
  }, [animeId, watchedEpisodes]);

  useEffect(() => {
    if (animeId) {
      safeLocalStorageSet(`listLayout-[${animeId}]`, displayMode);
      const watched = safeLocalStorageGetJson<Record<string, Episode[]>>('watched-episodes', {});
      const watchedForAnime = watched[animeId];
      if (watchedForAnime && Array.isArray(watchedForAnime)) {
        setWatchedEpisodes(watchedForAnime);
      }
    }
  }, [animeId, displayMode]);

  const markEpisodeAsWatched = useCallback(
    (id: string) => {
      if (animeId) {
        setWatchedEpisodes((prev) => {
          if (prev.some((e) => e.id === id)) return prev;
          const found = episodes.find((e) => e.id === id);
          if (!found) return prev;
          const updated = [...prev, found];
          const allWatched = safeLocalStorageGetJson<Record<string, Episode[]>>('watched-episodes', {});
          allWatched[animeId] = updated;
          safeLocalStorageSet('watched-episodes', JSON.stringify(allWatched));
          return updated;
        });
      }
    },
    [episodes, animeId],
  );

  const handleEpisodeSelect = useCallback(
    (id: string) => {
      markEpisodeAsWatched(id);
      onEpisodeSelect(id);
    },
    [onEpisodeSelect, markEpisodeAsWatched],
  );

  const intervalOptions = useMemo(() => {
    return episodes.reduce<{ start: number; end: number }[]>((options, _, index) => {
      if (index % 100 === 0) {
        const start = index;
        const end = Math.min(index + 99, episodes.length - 1);
        options.push({ start, end });
      }
      return options;
    }, []);
  }, [episodes]);

  const handleIntervalChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const [start, end] = e.target.value.split('-').map(Number);
    setInterval([start, end]);
  }, []);

  const toggleLayoutPreference = useCallback(() => {
    setDisplayMode((prev) => {
      const next = prev === 'list' ? 'grid' : prev === 'grid' ? 'imageList' : 'list';
      if (animeId) {
        safeLocalStorageSet(`listLayout-[${animeId}]`, next);
      }
      return next;
    });
  }, [animeId]);

  const filteredEpisodes = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return episodes.filter(
      (ep) =>
        ep.title?.toLowerCase().includes(query) ||
        ep.number?.toString().includes(query),
    );
  }, [episodes, searchTerm]);

  const displayedEpisodes = useMemo(() => {
    if (!searchTerm) {
      return episodes.slice(interval[0], interval[1] + 1);
    }
    return filteredEpisodes;
  }, [episodes, filteredEpisodes, interval, searchTerm]);

  useEffect(() => {
    const isGrid = displayMode === 'grid';
    setIsRowLayout(!isGrid);
  }, [displayMode]);

  return (
    <ListContainer $maxHeight={maxListHeight}>
      <ControlsContainer>
        {intervalOptions.length > 1 && (
          <SelectInterval
            onChange={handleIntervalChange}
            value={`${interval[0]}-${interval[1]}`}
          >
            {intervalOptions.map(({ start, end }, index) => (
              <option key={index} value={`${start}-${end}`}>
                Episodes {start + 1} - {end + 1}
              </option>
            ))}
          </SelectInterval>
        )}

        <SearchContainer>
          <Icon>
            <FontAwesomeIcon icon={faSearch} />
          </Icon>
          <SearchInput
            type='text'
            placeholder='Search episodes...'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </SearchContainer>
        <LayoutToggle onClick={toggleLayoutPreference} aria-label='Toggle layout'>
          {displayMode === 'list' && <FontAwesomeIcon icon={faThList} />}
          {displayMode === 'grid' && <FontAwesomeIcon icon={faTh} />}
          {displayMode === 'imageList' && <FontAwesomeIcon icon={faImage} />}
        </LayoutToggle>
      </ControlsContainer>
      <EpisodeGrid
        key={`episode-grid-${displayMode}`}
        $isRowLayout={isRowLayout}
        ref={episodeGridRef}
      >
        {displayedEpisodes.map((episode) => {
          const $isSelected = episode.id === selectedEpisodeId;
          const $isWatched = watchedEpisodes.some((e) => e.id === episode.id);

          return (
            <ListItem
              key={episode.id}
              $isSelected={$isSelected}
              $isRowLayout={isRowLayout}
              $isWatched={$isWatched}
              onClick={() => handleEpisodeSelect(episode.id)}
              aria-selected={$isSelected}
              ref={(el) => (episodeRefs.current[episode.id] = el)}
            >
              {displayMode === 'imageList' ? (
                <>
                  <div>
                    <EpisodeNumber>{episode.number}. </EpisodeNumber>
                    <EpisodeTitle>{episode.title || `Episode ${episode.number}`}</EpisodeTitle>
                  </div>
                  {episode.image && (
                    <EpisodeImage
                      src={episode.image}
                      loading='lazy'
                      decoding='async'
                      alt={`Episode ${episode.number}`}
                    />
                  )}
                </>
              ) : displayMode === 'grid' ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                  }}
                >
                  {$isSelected ? (
                    <FontAwesomeIcon icon={faPlay} />
                  ) : (
                    <EpisodeNumber>{episode.number}</EpisodeNumber>
                  )}
                </div>
              ) : (
                <>
                  <EpisodeNumber>{episode.number}. </EpisodeNumber>
                  <EpisodeTitle>{episode.title || `Episode ${episode.number}`}</EpisodeTitle>
                  {$isSelected && <FontAwesomeIcon icon={faPlay} />}
                </>
              )}
            </ListItem>
          );
        })}
      </EpisodeGrid>
    </ListContainer>
  );
};
