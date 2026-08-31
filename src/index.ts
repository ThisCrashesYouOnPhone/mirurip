// * ==== Components ====
// Shared components
export { StatusIndicator } from './components/shared/StatusIndicator';
export { AvailabilityBadges } from './components/shared/AvailabilityBadges';

// Basic UI Components
export { Navbar } from './components/Navigation/Navbar';
export { Footer } from './components/Navigation/Footer';
export { DropDownSearch } from './components/Navigation/DropSearch';
export { SearchFilters } from './components/Navigation/SearchFilters';
export { ShortcutsPopup } from './components/ShortcutsPopup';
export { ThemeProvider, useTheme } from './components/ThemeContext';

// Cards
export * from './components/Cards/CardGrid';
export { CardItem } from './components/Cards/CardItem';

// Home Page Specific
export { EpisodeCard } from './components/Home/EpisodeCard';
export { HomeCarousel } from './components/Home/HomeCarousel';
export { HomeSideBar } from './components/Home/HomeSideBar';

// Skeletons for Loading States
export {
  SkeletonCard,
  SkeletonSlide,
  SkeletonPlayer,
} from './components/Skeletons/Skeletons';

// Watching Anime Functionality
export { EpisodeList } from './components/Watch/EpisodeList';
export { Player } from './components/Watch/Video/Player';
export { MediaSource } from './components/Watch/Video/MediaSource';
export { AniListTracker } from './components/Watch/AniListTracker';
export { WatchAnimeData } from './components/Watch/WatchAnimeData';
export { AnimeDataList } from './components/Watch/AnimeDataList';
export { Seasons } from './components/Watch/Seasons';

// User Components
export {
  SettingsProvider,
  useSettings,
} from './components/Profile/SettingsProvider';
export { WatchingAnilist } from './components/Profile/WatchingAnilist';

// * ==== Hooks ====
export * from './hooks/useApi';
export * from './hooks/animeInterface';
export * from './hooks/useScroll';
export * from './hooks/useTIme';
export * from './hooks/useFilters';
export * from './hooks/useCountdown';

// * ==== Client ====
export { ApolloClientProvider } from './client/ApolloClient';
export * from './client/userInfoTypes';
export * from './client/authService';
export * from './client/useAuth';
export * from './client/safeStorage';
export * from './client/anilistSync';
export * from './client/anilistProgress';
export * from './client/streamService';
