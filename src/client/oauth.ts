export type OAuthCallbackParams = {
  accessToken: string | null;
  error: string | null;
  errorDescription: string | null;
  returnedState: string | null;
};

/**
 * Reads both possible OAuth response locations. AniList's implicit grant uses
 * the fragment; query parsing is retained for errors and explicitly enabled
 * authorization-code deployments.
 */
export const parseOAuthCallback = (
  hash: string,
  search: string,
): OAuthCallbackParams => {
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(search);

  return {
    accessToken: hashParams.get('access_token'),
    error: hashParams.get('error') || queryParams.get('error'),
    errorDescription:
      hashParams.get('error_description') || queryParams.get('error_description'),
    returnedState: hashParams.get('state') || queryParams.get('state'),
  };
};

export const isOAuthStateValid = (
  expectedState: string,
  returnedState: string | null,
): boolean =>
  !expectedState || !returnedState || expectedState === returnedState;
