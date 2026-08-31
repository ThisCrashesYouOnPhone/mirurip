import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styled from 'styled-components';
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from '../client/safeStorage';
import { isOAuthStateValid, parseOAuthCallback } from '../client/oauth';

const Message = styled.div`
  text-align: center;
  margin-top: 5rem;
  font-size: 1.25rem;
  font-weight: bold;
  color: var(--global-text);
`;

const Callback = () => {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const { accessToken, error, errorDescription, returnedState } =
      parseOAuthCallback(window.location.hash, window.location.search);
    const expectedState = safeLocalStorageGet('csrf_token');

    const finishLogin = () => {
      safeLocalStorageRemove('csrf_token');
      window.dispatchEvent(new CustomEvent('authUpdate'));
      navigate('/profile', { replace: true });
    };

    // AniList's implicit grant returns the token in the URL fragment. The
    // fragment is never sent to the server, which keeps this compatible with
    // Cloudflare Pages and avoids a client-side authorization-code exchange.
    if (accessToken) {
      // AniList returns state when it is supplied. Reject a mismatched value;
      // accepting a missing value keeps compatibility with older responses.
      if (!isOAuthStateValid(expectedState, returnedState)) {
        safeLocalStorageRemove('csrf_token');
        setErrorMessage('AniList login could not be verified. Please try again.');
        return;
      }

      safeLocalStorageSet('accessToken', accessToken);
      finishLogin();
      return;
    }

    if (error === 'access_denied') {
      setErrorMessage('Authorization revoked. Please click "Authorize" to grant access.');
      return;
    }

    if (error) {
      setErrorMessage(errorDescription || `AniList login failed: ${error}`);
      return;
    }

    // Authorization-code exchange is intentionally opt-in. It requires a
    // server-side client secret and is not part of the static Pages flow.
    const code = queryParams.get('code');
    const codeFlowEnabled = import.meta.env.VITE_ENABLE_AUTH_CODE_FLOW === 'true';

    if (code) {
      if (!codeFlowEnabled) {
        setErrorMessage('This deployment uses browser login. Please start again from the profile page.');
        return;
      }

      const endpoints = [
        '/api/exchange-token',
        '/.netlify/functions/exchange-token',
        '/exchange-token',
      ];

      const tryExchange = async () => {
        for (const endpoint of endpoints) {
          try {
            const response = await axios.post(endpoint, { code });
            if (response.data?.accessToken) {
              safeLocalStorageSet('accessToken', response.data.accessToken);
              finishLogin();
              return;
            }
          } catch {
            // Try next endpoint fallback
          }
        }
        setErrorMessage('Failed to exchange authorization code. Please try logging in again.');
      };

      void tryExchange();
    }
  }, [navigate]);

  return (
    <Message>{errorMessage ? `${errorMessage}` : 'Logging in to AniList...'}</Message>
  );
};

export default Callback;
