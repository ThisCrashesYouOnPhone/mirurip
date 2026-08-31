// src/client/authService.ts
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { UserData, MediaListStatus } from '../index';
import { useQuery, gql } from '@apollo/client';
import { safeLocalStorageGet } from './safeStorage';

// Default public client ID for AniList OAuth if none configured in env
const DEFAULT_CLIENT_ID = '49802'; // AniList client ID
const CANONICAL_REDIRECT_URI = 'https://miruro-bzh.pages.dev/callback';

export const getClientId = (): string => {
  return (
    import.meta.env.VITE_CLIENT_ID ||
    safeLocalStorageGet('custom_anilist_client_id') ||
    DEFAULT_CLIENT_ID
  );
};

export const getRedirectUri = (): string => {
  if (import.meta.env.VITE_REDIRECT_URI) {
    return import.meta.env.VITE_REDIRECT_URI;
  }

  // Cloudflare Pages preview deployments use a different hostname, but the
  // AniList client is registered against the canonical Pages domain. Send
  // OAuth responses there so preview URLs do not trigger AniList's misleading
  // "unsupported_grant_type" error for an unregistered redirect URI.
  const hostname = window.location.hostname;
  if (hostname === 'miruro-bzh.pages.dev' || hostname.endsWith('.miruro-bzh.pages.dev')) {
    return CANONICAL_REDIRECT_URI;
  }

  return `${window.location.origin}/callback`;
};

export const generateCsrfToken = (): string => {
  return uuidv4();
};

/**
 * Builds the authorization URL for AniList OAuth.
 * Defaults to response_type=token (Implicit Grant) which works 100% client-side
 * on static hosting (Netlify, Cloudflare Pages, Vercel) without needing a backend client secret.
 */
export const buildAuthUrl = (csrfToken: string = generateCsrfToken()): string => {
  // Miruro is a browser-only client. Never select authorization-code flow from
  // VITE_CLIENT_SECRET: Vite embeds VITE_* values in the public JavaScript
  // bundle, so a client secret would not be secret and there is no safe browser
  // exchange endpoint to depend on here.
  void csrfToken;
  const authUrl = new URL('https://anilist.co/api/v2/oauth/authorize');
  authUrl.searchParams.set('client_id', getClientId());
  authUrl.searchParams.set('response_type', 'token');

  // AniList's documented implicit flow uses only these two parameters. Its
  // login handoff currently corrupts optional redirect/state parameters into
  // an extra `=null` query item, which then produces unsupported_grant_type.
  // The registered redirect URI is selected by AniList for this flow.

  return authUrl.toString();
};

export const fetchUserData = async (accessToken: string): Promise<UserData> => {
  try {
    const response = await axios.post(
      'https://graphql.anilist.co',
      {
        query: `
          query {
            Viewer {
              id
              name
              avatar {
                large
              }
              statistics {
                anime {
                  count
                  episodesWatched
                  meanScore
                  minutesWatched
                }
              }
            }
          }
        `,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
    );
    const viewer = response.data?.data?.Viewer;
    if (!viewer) throw new Error('Viewer data missing');
    return viewer;
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw new Error('Failed to fetch user data');
  }
};

const GET_USER_ANIME_LIST = gql`
  query GetUserAnimeList($username: String!, $status: MediaListStatus!) {
    MediaListCollection(
      userName: $username
      type: ANIME
      status: $status
      sort: UPDATED_TIME_DESC
    ) {
      lists {
        entries {
          media {
            id
            format
            title {
              romaji
              english
            }
            coverImage {
              large
              color
            }
            status
            episodes
            startDate {
              year
              month
              day
            }
            averageScore
            genres
          }
        }
      }
    }
  }
`;

export const useUserAnimeList = (username: string, status: MediaListStatus) => {
  const { data, loading, error, refetch } = useQuery(GET_USER_ANIME_LIST, {
    variables: { username, status },
    skip: !username || !status,
  });

  return {
    animeList: data?.MediaListCollection,
    loading,
    error,
    refetch,
  };
};
