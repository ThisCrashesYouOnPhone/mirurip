import { describe, expect, it } from 'vitest';
import { isOAuthStateValid, parseOAuthCallback } from '../client/oauth';
import { buildAuthUrl } from '../client/authService';

describe('AniList OAuth callback parsing', () => {
  it('always builds a browser-compatible implicit-grant URL', () => {
    const url = new URL(buildAuthUrl('expected-state'));

    expect(url.origin + url.pathname).toBe('https://anilist.co/api/v2/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('49802');
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.has('redirect_uri')).toBe(false);
    expect(url.searchParams.has('state')).toBe(false);
  });

  it('reads implicit-grant tokens and state from the fragment', () => {
    expect(
      parseOAuthCallback(
        '#access_token=simulated-token&token_type=Bearer&state=expected-state',
        '',
      ),
    ).toMatchObject({
      accessToken: 'simulated-token',
      returnedState: 'expected-state',
    });
  });

  it('accepts a matching state and rejects a different state', () => {
    expect(isOAuthStateValid('expected-state', 'expected-state')).toBe(true);
    expect(isOAuthStateValid('expected-state', 'wrong-state')).toBe(false);
  });

  it('reads authorization errors from either callback location', () => {
    expect(
      parseOAuthCallback('', '?error=access_denied&error_description=Cancelled'),
    ).toMatchObject({
      error: 'access_denied',
      errorDescription: 'Cancelled',
    });
  });
});
