import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import {
  Navbar,
  ThemeProvider,
  Footer,
  ShortcutsPopup,
  ScrollToTop,
  usePreserveScrollOnReload,
  ApolloClientProvider,
  SettingsProvider,
  SkeletonSlide,
} from './index';
import { register } from 'swiper/element/bundle';
import { AuthProvider } from './client/useAuth';
import ReactGA from 'react-ga4';

// Lazy-loaded page components for iPad / low-RAM performance optimization
const Home = lazy(() => import('./pages/Home'));
const Watch = lazy(() => import('./pages/Watch'));
const Search = lazy(() => import('./pages/Search'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() =>
  import('./components/Profile/Settings').then((module) => ({ default: module.Settings })),
);
const About = lazy(() => import('./pages/About'));
const PolicyTerms = lazy(() => import('./pages/PolicyTerms'));
const Page404 = lazy(() => import('./pages/404'));
const Callback = lazy(() => import('./pages/Callback'));

register();

function PageLoader() {
  return (
    <div style={{ minHeight: '60vh', padding: '2rem 1rem' }}>
      <SkeletonSlide />
    </div>
  );
}

function App() {
  usePreserveScrollOnReload();
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;

  useEffect(() => {
    if (measurementId) {
      ReactGA.initialize(measurementId);
    }
  }, [measurementId]);

  return (
    <ApolloClientProvider>
      <Router>
        <AuthProvider>
          <ThemeProvider>
            <SettingsProvider>
              <Navbar />
              <ShortcutsPopup />
              <ScrollToTop />
              <TrackPageViews />
              <div style={{ minHeight: '35rem' }}>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path='/' element={<Home />} />
                    <Route path='/home' element={<Home />} />
                    <Route path='/search' element={<Search />} />
                    <Route path='/watch/:animeId' element={<Watch />} />
                    <Route
                      path='/watch/:animeId/:animeTitle/:episodeNumber'
                      element={<Watch />}
                    />
                    <Route path='/profile' element={<Profile />} />
                    <Route path='/profile/settings' element={<Settings />} />
                    <Route path='/about' element={<About />} />
                    <Route path='/pptos' element={<PolicyTerms />} />
                    <Route path='/callback' element={<Callback />} />
                    <Route path='*' element={<Page404 />} />
                  </Routes>
                </Suspense>
              </div>
              <Footer />
            </SettingsProvider>
          </ThemeProvider>
        </AuthProvider>
      </Router>
    </ApolloClientProvider>
  );
}

function TrackPageViews() {
  const { pathname } = useLocation();
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;

  useEffect(() => {
    if (measurementId) {
      ReactGA.send({ hitType: 'pageview', page: pathname });
    }
  }, [pathname, measurementId]);

  return null;
}

export default App;
