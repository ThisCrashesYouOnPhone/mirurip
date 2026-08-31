// apolloClient.ts
import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  ApolloProvider,
  makeVar,
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { buildAuthUrl, fetchUserData, UserData } from '../index';
import { safeLocalStorageGet, safeLocalStorageRemove } from './safeStorage';
import { ReactNode, useEffect } from 'react';

// Reactive variables for user authentication state
const isLoggedInVar = makeVar<boolean>(false);
const userDataVar = makeVar<UserData | null>(null);

const httpLink = createHttpLink({
  uri: 'https://graphql.anilist.co',
});

const authLink = setContext((_, { headers }) => {
  const token = safeLocalStorageGet('accessToken', '');
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  };
});

const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path }) =>
      console.warn(
        `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`,
      ),
    );
  }

  if (networkError) console.warn(`[Network error]: ${networkError}`);
});

const client = new ApolloClient({
  link: errorLink.concat(authLink.concat(httpLink)),
  cache: new InMemoryCache(),
});

// Functions for handling authentication
function login() {
  const authUrl = buildAuthUrl();
  window.location.href = authUrl;
}

function logout() {
  safeLocalStorageRemove('accessToken');
  isLoggedInVar(false);
  userDataVar(null);
  window.location.href = '/profile';
  window.dispatchEvent(new CustomEvent('authUpdate'));
}

function handleAuthUpdate() {
  const token = safeLocalStorageGet('accessToken', '');
  if (token) {
    fetchUserData(token)
      .then((data) => {
        userDataVar(data);
        isLoggedInVar(true);
      })
      .catch((err) => {
        console.warn('Failed to fetch user data:', err);
        logout();
      });
  } else {
    isLoggedInVar(false);
    userDataVar(null);
  }
}

export const ApolloClientProvider = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    window.addEventListener('authUpdate', handleAuthUpdate);
    handleAuthUpdate();
    return () => {
      window.removeEventListener('authUpdate', handleAuthUpdate);
    };
  }, []);

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
};

export {
  client as defaultApolloClient,
  login,
  logout,
  isLoggedInVar,
  userDataVar,
};
