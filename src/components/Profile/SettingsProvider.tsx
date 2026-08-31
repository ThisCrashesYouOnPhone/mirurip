import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../client/safeStorage';

interface SettingsContextType {
  settings: {
    autoSkip: boolean;
    autoPlay: boolean;
    autoNext: boolean;
    defaultLanguage: string;
    defaultServers: string;
    customBackendUrl: string;
  };
  setSettings: (settings: Partial<SettingsContextType['settings']>) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({
  children,
}) => {
  const [settings, setSettingsState] = useState({
    autoSkip: safeLocalStorageGet('autoSkip', 'false') === 'true',
    autoPlay: safeLocalStorageGet('autoPlay', 'true') === 'true',
    autoNext: safeLocalStorageGet('autoNext', 'true') === 'true',
    defaultLanguage: safeLocalStorageGet('defaultLanguage', 'sub'),
    defaultServers: safeLocalStorageGet('defaultServers', 'default'),
    customBackendUrl: safeLocalStorageGet('custom_backend_url', ''),
  });

  useEffect(() => {
    safeLocalStorageSet('autoSkip', settings.autoSkip ? 'true' : 'false');
    safeLocalStorageSet('autoPlay', settings.autoPlay ? 'true' : 'false');
    safeLocalStorageSet('autoNext', settings.autoNext ? 'true' : 'false');
    safeLocalStorageSet('defaultLanguage', settings.defaultLanguage);
    safeLocalStorageSet('defaultServers', settings.defaultServers);
    safeLocalStorageSet('custom_backend_url', settings.customBackendUrl);
  }, [settings]);

  const setSettings = (
    newSettings: Partial<SettingsContextType['settings']>,
  ) => {
    setSettingsState((prev) => {
      const updatedSettings = { ...prev, ...newSettings };
      return updatedSettings;
    });
  };

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};
