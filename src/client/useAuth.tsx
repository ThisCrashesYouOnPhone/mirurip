import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { UserData } from './userInfoTypes'; // Adjust the path as necessary
import {
  fetchUserData,
  buildAuthUrl,
} from './authService'; // Adjust the path as necessary
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
} from './safeStorage';

type AuthContextType = {
  isLoggedIn: boolean;
  userData: UserData | null;
  username: string | null; // This property must be handled
  login: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [authLoading, setAuthLoading] = useState(true); // Add a loading state for auth status

  // Calculate username from userData
  const username = userData ? userData.name : null; // Assuming 'username' is a property of UserData

  const refreshAuth = useCallback(async () => {
    const token = safeLocalStorageGet('accessToken');
    if (token) {
      setAuthLoading(true);
      try {
        const data = await fetchUserData(token);
        setUserData(data);
        setIsLoggedIn(true);
      } catch (err) {
        console.error('Failed to fetch user data:', err);
        safeLocalStorageRemove('accessToken');
        setUserData(null);
        setIsLoggedIn(false);
      } finally {
        setAuthLoading(false);
      }
    } else {
      setUserData(null);
      setIsLoggedIn(false);
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
    window.addEventListener('authUpdate', refreshAuth);
    return () => window.removeEventListener('authUpdate', refreshAuth);
  }, [refreshAuth]);

  const login = () => {
    try {
      const authUrl = buildAuthUrl();
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error building AniList auth URL:', error);
    }
  };

  const logout = () => {
    safeLocalStorageRemove('accessToken');
    safeLocalStorageRemove('csrf_token');
    setIsLoggedIn(false);
    setUserData(null);
    setAuthLoading(true); // Reset auth loading state on logout
    window.location.href = '/profile';
    window.dispatchEvent(new CustomEvent('authUpdate'));
  };

  // Prevent rendering of children if authentication status is unknown
  if (authLoading) {
    return null; // Or you could return a loading spinner or a similar component
  }

  return (
    <AuthContext.Provider
      value={{ isLoggedIn, userData, username, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
