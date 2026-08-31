import { useState, useEffect, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { useSearchParams } from 'react-router-dom';
import { SearchFilters } from '../components/Navigation/SearchFilters';
import { CardGrid, StyledCardGrid } from '../components/Cards/CardGrid';
import { SkeletonCard } from '../components/Skeletons/Skeletons';
import { fetchAdvancedSearch } from '../hooks/useApi';
import type { Anime } from '../hooks/animeInterface';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;

  @media (min-width: 1500px) {
    margin-left: 8rem;
    margin-right: 8rem;
    margin-top: 2rem;
  }
`;

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const sortParam = searchParams.get('sort');
  const initialQuery = searchParams.get('query') || '';

  let initialSortDirection: 'DESC' | 'ASC' = 'DESC';
  if (sortParam) {
    initialSortDirection = sortParam.endsWith('_DESC') ? 'DESC' : 'ASC';
  }
  const initialSortValue = sortParam
    ? sortParam.replace(/(_DESC|_ASC)$/, '')
    : 'POPULARITY_DESC';

  const initialSort = {
    value: initialSortValue,
    label:
      initialSortValue.replace('_DESC', '').charAt(0) +
      initialSortValue.replace('_DESC', '').slice(1).toLowerCase(),
  };
  const genresParam = searchParams.get('genres');
  const initialGenres = genresParam
    ? genresParam.split(',').map((value) => ({ value, label: value }))
    : [];

  const initialYear = {
    value: searchParams.get('year') || '',
    label: searchParams.get('year') || 'Any',
  };

  const initialSeason = {
    value: searchParams.get('season') || '',
    label: searchParams.get('season') || 'Any',
  };

  const initialFormat = {
    value: searchParams.get('format') || '',
    label: searchParams.get('format') || 'Any',
  };

  const initialStatus = {
    value: searchParams.get('status') || '',
    label: searchParams.get('status') || 'Any',
  };

  // State hooks
  const [query, setQuery] = useState(initialQuery);
  const [selectedGenres, setSelectedGenres] = useState(initialGenres);
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [selectedSeason, setSelectedSeason] = useState(initialSeason);
  const [selectedFormat, setSelectedFormat] = useState(initialFormat);
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const [selectedSort, setSelectedSort] = useState(initialSort);
  const [sortDirection, setSortDirection] = useState<'DESC' | 'ASC'>(
    initialSortDirection,
  );

  const [animeData, setAnimeData] = useState<Anime[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasNextPage, setHasNextPage] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const delayTimeout = useRef<number | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = query ? `${query} | Search Results` : 'Search Anime | Miruro';
    return () => {
      document.title = previousTitle;
    };
  }, [query]);

  const updateSearchParams = () => {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (selectedGenres.length > 0) {
      params.set('genres', selectedGenres.map((g) => g.value).join(','));
    }
    if (selectedYear.value) params.set('year', selectedYear.value);
    if (selectedSeason.value) params.set('season', selectedSeason.value);
    if (selectedFormat.value) params.set('format', selectedFormat.value);
    if (selectedStatus.value) params.set('status', selectedStatus.value);
    const sortBase = selectedSort.value.replace(/(_DESC|_ASC)$/, '');
    const sortValue = sortDirection === 'DESC' ? `${sortBase}_DESC` : `${sortBase}_ASC`;
    params.set('sort', sortValue);

    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    setPage(1);
    const scrollToTopWithDelay = () => {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 200);
    };
    scrollToTopWithDelay();
  }, [
    query,
    selectedGenres,
    selectedYear,
    selectedSeason,
    selectedFormat,
    selectedStatus,
    selectedSort,
    sortDirection,
  ]);

  const initiateFetchAdvancedSearch = useCallback(async () => {
    setIsLoading(true);
    const sortBase = selectedSort.value.replace('_DESC', '');
    const sortParam = sortDirection === 'DESC' ? `${sortBase}_DESC` : sortBase;
    try {
      const fetchedData = await fetchAdvancedSearch(query, page, 18, {
        genres: selectedGenres.map((g) => g.value),
        year: selectedYear.value,
        season: selectedSeason.value,
        format: selectedFormat.value,
        status: selectedStatus.value,
        sort: [sortParam],
      });
      setAnimeData((prev) =>
        page === 1
          ? (fetchedData.results as Anime[])
          : [...prev, ...(fetchedData.results as Anime[])],
      );
      setHasNextPage(fetchedData.hasNextPage);
    } catch (err) {
      console.warn('Error fetching search data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [
    query,
    page,
    selectedGenres,
    selectedYear,
    selectedSeason,
    selectedFormat,
    selectedStatus,
    selectedSort,
    sortDirection,
  ]);

  const handleLoadMore = () => {
    setPage((prevPage) => prevPage + 1);
  };

  useEffect(() => {
    const newQuery = searchParams.get('query') || '';
    if (newQuery !== query) {
      setQuery(newQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    if (delayTimeout.current !== null) clearTimeout(delayTimeout.current);

    delayTimeout.current = window.setTimeout(() => {
      initiateFetchAdvancedSearch();
    }, 50);

    return () => {
      if (delayTimeout.current !== null) clearTimeout(delayTimeout.current);
    };
  }, [initiateFetchAdvancedSearch]);

  return (
    <Container>
      <SearchFilters
        query={query}
        setQuery={setQuery}
        selectedGenres={selectedGenres}
        setSelectedGenres={setSelectedGenres}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        selectedSeason={selectedSeason}
        setSelectedSeason={setSelectedSeason}
        selectedFormat={selectedFormat}
        setSelectedFormat={setSelectedFormat}
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
        selectedSort={selectedSort}
        setSelectedSort={setSelectedSort}
        sortDirection={sortDirection}
        setSortDirection={setSortDirection}
        updateSearchParams={updateSearchParams}
      />

      <div>
        {isLoading && page === 1 ? (
          <StyledCardGrid>
            {Array.from({ length: 18 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </StyledCardGrid>
        ) : (
          <CardGrid
            animeData={animeData}
            hasNextPage={hasNextPage}
            onLoadMore={handleLoadMore}
          />
        )}
        {!isLoading && animeData.length === 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '15vh',
              fontWeight: 'bold',
              fontSize: '1.2rem',
              color: 'var(--global-text)',
            }}
          >
            No anime found matching your filters.
          </div>
        )}
      </div>
    </Container>
  );
};

export default Search;
