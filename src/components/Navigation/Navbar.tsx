import React, { useRef, useEffect, useState, useCallback } from 'react';
import styled from 'styled-components';
import {
  useNavigate,
  useSearchParams,
  Link,
  useLocation,
} from 'react-router-dom';
import { DropDownSearch, useAuth } from '../../index';
import { fetchAdvancedSearch, type Anime } from '../..';
import { FiSun, FiMoon, FiX } from 'react-icons/fi';
import { GoCommandPalette } from 'react-icons/go';
import { IoIosSearch } from 'react-icons/io';
import { CgProfile } from 'react-icons/cg';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../client/safeStorage';

const StyledNavbar = styled.div<{ $isExtended?: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  text-align: center;
  margin: 0;
  padding: 1rem;
  background-color: var(--global-primary-bg-tr);
  z-index: 100;
  transition: 0.1s ease-in-out;
  transform: translateZ(0);

  @media (max-width: 500px) {
    padding: 1rem 0.5rem;
  }
`;

const NavbarWrapper = styled.div`
  max-width: 105rem;
  width: 100%;
  min-width: 0;
  margin: auto;
`;

const TopContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
`;

const LogoImg = styled(Link)`
  width: 7rem;
  font-size: 1.2rem;
  font-weight: bold;
  text-decoration: none;
  color: var(--global-text);
  content: var(--logo-text-transparent);
  cursor: pointer;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  transition:
    color 0.2s ease-in-out,
    transform 0.2s ease-in-out;

  &:hover,
  &:active,
  &:focus {
    color: black;
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  @media (max-width: 500px) {
    max-width: 6rem;
  }
`;

const InputContainer = styled.div<{ $isVisible: boolean }>`
  position: relative;
  display: flex;
  flex: 1;
  max-width: 35rem;
  min-height: 2.75rem;
  height: auto;
  align-items: center;
  padding: 0.4rem 0.75rem;
  border-radius: var(--global-border-radius);
  background-color: var(--global-div);
  min-width: 0;
  box-sizing: border-box;

  @media (max-width: 1000px) {
    max-width: 30rem;
  }

  @media (max-width: 500px) {
    max-width: 100%;
    margin-top: 1rem;
    display: ${({ $isVisible }) => ($isVisible ? 'flex' : 'none')};
  }
`;

const RightContent = styled.div`
  gap: 0.5rem;
  display: flex;
  align-items: center;
  height: 2rem;
  flex: 0 0 auto;
`;

const Icon = styled.div<{ $isFocused: boolean }>`
  margin: 0;
  padding: 0 0.25rem;
  color: var(--global-text);
  opacity: ${({ $isFocused }) => ($isFocused ? 1 : 0.5)};
  font-size: 1.2rem;
  transition: opacity 0.2s;
  max-height: 100%;
  display: flex;
  align-items: center;
`;

const SearchInput = styled.input`
  background: transparent;
  border: none;
  color: var(--global-text);
  flex: 1;
  font-size: 0.9rem;
  line-height: 1.4;
  outline: 0;
  padding: 0.25rem 0;
  width: 100%;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;

  &::placeholder {
    color: var(--global-text);
    opacity: 0.6;
  }
`;

const ClearButton = styled.button<{ $query: string }>`
  background: transparent;
  border: none;
  color: var(--global-text);
  font-size: 1.2rem;
  cursor: pointer;
  opacity: ${({ $query }) => ($query ? 0.5 : 0)};
  visibility: ${({ $query }) => ($query ? 'visible' : 'hidden')};
  transition:
    color 0.2s,
    opacity 0.2s;
  max-height: 100%;
  display: flex;
  align-items: center;

  &:hover,
  &:active,
  &:focus {
    color: var(--global-text);
    opacity: 1;
  }
`;

const StyledButton = styled.button<{ isInputToggle?: boolean }>`
  background: transparent;
  background-color: var(--global-div);
  color: var(--global-text);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 1.2rem 0.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--global-border-radius);
  width: auto;
  min-width: 2.25rem;
  height: 100%;
  transition:
    color 0.2s ease-in-out,
    transform 0.1s ease-in-out;
  border: none;

  &:active {
    transform: scale(0.9);
  }

  @media (max-width: 500px) {
    display: flex;
    margin: ${({ isInputToggle }) => (isInputToggle ? '0' : '0')};
    padding: 0.45rem;
  }
`;

const SlashToggleBtn = styled.div<{ $isFocused: boolean }>`
  font-size: 1.2rem;
  cursor: pointer;
  opacity: ${({ $isFocused }) => ($isFocused ? 1 : 0.5)};

  &:hover,
  &:active,
  &:focus {
    opacity: 1;
  }

  @media (max-width: 1000px) {
    display: none;
  }
`;

const detectUserTheme = () => {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return true;
  }
  return false;
};

const saveThemePreference = (isDarkMode: boolean) => {
  safeLocalStorageSet('themePreference', isDarkMode ? 'dark' : 'light');
};

const getInitialThemePreference = () => {
  const storedThemePreference = safeLocalStorageGet('themePreference', '');
  if (storedThemePreference) {
    return storedThemePreference === 'dark';
  }
  return detectUserTheme();
};

export const Navbar = () => {
  const { isLoggedIn, userData } = useAuth();
  const [isPaddingExtended, setIsPaddingExtended] = useState(false);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [inputContainerWidth, setInputContainerWidth] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const navbarRef = useRef(null);
  const [searchResults, setSearchResults] = useState<Anime[]>([]);
  const debounceTimeout = useRef<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [search, setSearch] = useState({
    isSearchFocused: false,
    searchQuery: searchParams.get('query') || '',
    isDropdownOpen: false,
  });
  const [isInputVisible, setIsInputVisible] = useState(false);
  const [isMobileView, setIsMobileView] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 500 : false,
  );

  const fetchSearchResults = async (query: string) => {
    if (!query.trim()) return;

    try {
      const fetchedData = await fetchAdvancedSearch(query, 1, 5);
      const formattedResults = fetchedData.results.map((anime: Anime) => ({
        id: anime.id,
        title: anime.title,
        image: anime.image,
        type: anime.type,
        totalEpisodes: anime.totalEpisodes,
        rating: anime.rating,
      }));
      setSearchResults(formattedResults as Anime[]);
    } catch (error) {
      console.warn('Failed to fetch search results:', error);
      setSearchResults([]);
    }
  };

  const handleCloseDropdown = useCallback(() => {
    setSearch((prevState) => ({
      ...prevState,
      isDropdownOpen: false,
    }));
  }, []);

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (
      inputContainerRef.current &&
      !inputContainerRef.current.contains(event.target as Node)
    ) {
      handleCloseDropdown();
    }
  }, [handleCloseDropdown]);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleClickOutside]);

  const [isDarkMode, setIsDarkMode] = useState(getInitialThemePreference());

  useEffect(() => {
    document.documentElement.classList.toggle('dark-mode', isDarkMode);
  }, [isDarkMode]);

  const toggleTheme = useCallback(() => {
    const newIsDarkMode = !isDarkMode;
    setIsDarkMode(newIsDarkMode);
    saveThemePreference(newIsDarkMode);
  }, [isDarkMode]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === '/' && inputRef.current) {
        e.preventDefault();
        inputRef.current.focus();
        setSearch((prevState) => ({
          ...prevState,
          isSearchFocused: true,
        }));
      } else if (e.key === 'Escape' && inputRef.current) {
        inputRef.current.blur();
        setSearch((prevState) => ({
          ...prevState,
          isSearchFocused: false,
        }));
        handleCloseDropdown();
      } else if (e.shiftKey && e.key.toLowerCase() === 'd') {
        if (document.activeElement !== inputRef.current) {
          e.preventDefault();
          toggleTheme();
        }
      }
    },
    [toggleTheme, handleCloseDropdown],
  );

  useEffect(() => {
    const listener = handleKeyDown as EventListener;
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
    };
  }, [handleKeyDown]);

  useEffect(() => {
    setSearch((prev) => ({ ...prev, searchQuery: searchParams.get('query') || '' }));
  }, [searchParams]);

  const navigateWithQuery = useCallback(
    (value: string) => {
      const trimmed = (value || '').trim();
      if (!trimmed) return;
      handleCloseDropdown();
      if (inputRef.current) inputRef.current.blur();
      if (location.pathname === '/search') {
        const params = new URLSearchParams(searchParams);
        params.set('query', trimmed);
        setSearchParams(params, { replace: true });
      } else {
        navigate(`/search?query=${encodeURIComponent(trimmed)}`);
      }
    },
    [navigate, location.pathname, searchParams, setSearchParams, handleCloseDropdown],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearch((prev) => ({ ...prev, searchQuery: newValue }));

    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    debounceTimeout.current = window.setTimeout(() => {
      fetchSearchResults(newValue);
      setSearch((prevState) => ({
        ...prevState,
        isDropdownOpen: true,
      }));
    }, 300);
  };

  const handleKeyDownOnInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex !== null && searchResults[selectedIndex]) {
        const animeId = searchResults[selectedIndex].id;
        navigate(`/watch/${animeId}`);
        handleCloseDropdown();
      } else {
        navigateWithQuery(search.searchQuery);
      }
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
      setSearch((prevState) => ({
        ...prevState,
        isDropdownOpen: false,
      }));
      if (inputRef.current) {
        inputRef.current.blur();
      }
    }
  };

  useEffect(() => {
    const updateWidth = () => {
      if (inputContainerRef.current) {
        setInputContainerWidth(inputContainerRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    if (isMobileView) {
      setIsInputVisible(false);
    }
  }, [location.pathname, isMobileView]);

  const handleClearSearch = () => {
    setSearch((prevState) => ({
      ...prevState,
      searchQuery: '',
      isDropdownOpen: false,
    }));
    setSearchResults([]);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  useEffect(() => {
    function handleResize() {
      setIsMobileView(window.innerWidth < 500);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const navigateToProfile = () => {
    if (location.pathname !== '/profile') {
      navigate('/profile');
    }
  };

  return (
    <StyledNavbar $isExtended={isPaddingExtended} ref={navbarRef}>
      <NavbarWrapper>
        <TopContainer>
          <LogoImg
            title='MIRURO.tv'
            to='/home'
            onClick={() => window.scrollTo(0, 0)}
          >
            見るろ の 久遠
          </LogoImg>

          {!isMobileView && (
            <InputContainer
              ref={inputContainerRef}
              $isVisible={isInputVisible}
            >
              <Icon
                $isFocused={search.isSearchFocused}
                style={{ cursor: 'pointer' }}
                onClick={() => navigateWithQuery(search.searchQuery)}
                title='Search'
              >
                <IoIosSearch />
              </Icon>
              <SearchInput
                type='text'
                placeholder='Search Anime'
                value={search.searchQuery}
                onChange={handleInputChange}
                onKeyDown={handleKeyDownOnInput}
                onFocus={() => {
                  setSearch((prevState) => ({
                    ...prevState,
                    isDropdownOpen: true,
                    isSearchFocused: true,
                  }));
                }}
                onClick={() => {
                  setSearch((prevState) => ({
                    ...prevState,
                    isDropdownOpen: true,
                    isSearchFocused: true,
                  }));
                }}
                ref={inputRef}
                aria-label='Search Anime'
              />
              <DropDownSearch
                searchResults={searchResults}
                onClose={handleCloseDropdown}
                isVisible={search.isDropdownOpen}
                selectedIndex={selectedIndex}
                setSelectedIndex={setSelectedIndex}
                searchQuery={search.searchQuery}
                containerWidth={inputContainerWidth}
              />

              <ClearButton
                $query={search.searchQuery}
                onClick={handleClearSearch}
                aria-label='Clear Search'
              >
                <FiX />
              </ClearButton>
              <Icon $isFocused={search.isSearchFocused}>
                <GoCommandPalette />
              </Icon>
            </InputContainer>
          )}
          <RightContent>
            {isMobileView && (
              <StyledButton
                onClick={() => {
                  setIsInputVisible((prev) => !prev);
                  setIsPaddingExtended((prev) => !prev);
                }}
                aria-label='Toggle Search Input'
              >
                <IoIosSearch />
              </StyledButton>
            )}
            <StyledButton onClick={toggleTheme} aria-label='Toggle Dark Mode'>
              {isDarkMode ? <FiSun /> : <FiMoon />}
            </StyledButton>
            <StyledButton onClick={navigateToProfile}>
              {isLoggedIn && userData ? (
                <img
                  src={userData.avatar.large}
                  alt={`${userData.name}'s avatar`}
                  style={{
                    width: '25px',
                    height: '25px',
                    borderRadius: '50%',
                  }}
                />
              ) : (
                <CgProfile />
              )}
            </StyledButton>
          </RightContent>
        </TopContainer>

        {isMobileView && isInputVisible && (
          <InputContainer ref={inputContainerRef} $isVisible={isInputVisible}>
            <Icon
              $isFocused={search.isSearchFocused}
              style={{ cursor: 'pointer' }}
              onClick={() => navigateWithQuery(search.searchQuery)}
              title='Search'
            >
              <IoIosSearch />
            </Icon>
            <SearchInput
              type='text'
              placeholder='Search Anime'
              value={search.searchQuery}
              onChange={handleInputChange}
              onKeyDown={handleKeyDownOnInput}
                onFocus={() => {
                  setSearch((prevState) => ({
                    ...prevState,
                    isDropdownOpen: true,
                    isSearchFocused: true,
                  }));
                }}
                onClick={() => {
                  setSearch((prevState) => ({
                    ...prevState,
                    isDropdownOpen: true,
                    isSearchFocused: true,
                  }));
                }}
              ref={inputRef}
            />
            <DropDownSearch
              searchResults={searchResults}
              onClose={handleCloseDropdown}
              isVisible={search.isDropdownOpen}
              selectedIndex={selectedIndex}
              setSelectedIndex={setSelectedIndex}
              searchQuery={search.searchQuery}
              containerWidth={inputContainerWidth}
            />

            <ClearButton
              $query={search.searchQuery}
              onClick={handleClearSearch}
            >
              <FiX />
            </ClearButton>
            <SlashToggleBtn $isFocused={search.isSearchFocused}>
              <GoCommandPalette />
            </SlashToggleBtn>
          </InputContainer>
        )}
      </NavbarWrapper>
    </StyledNavbar>
  );
};
