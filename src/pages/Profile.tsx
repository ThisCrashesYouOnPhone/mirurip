import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useAuth } from '../client/useAuth';
import { EpisodeCard } from '../components/Home/EpisodeCard';
import { WatchingAnilist } from '../components/Profile/WatchingAnilist';
import { IoLogOutOutline } from 'react-icons/io5';
import { SiAnilist } from 'react-icons/si';
import { CgProfile } from 'react-icons/cg';
import { useNavigate } from 'react-router-dom';
import { FiSettings } from 'react-icons/fi';
import { safeLocalStorageSet } from '../client/safeStorage';

const TopContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  gap: 1rem;

  @media (min-width: 1000px) {
    flex-direction: row;
    justify-content: space-between;
  }
`;

const UserInfoContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

const ProfileContainer = styled.div`
  position: relative;
  padding: 1.5rem;
  background-color: var(--global-div-tr);
  border-radius: var(--global-border-radius);
  text-align: center;
  font-size: 0.9rem;
  flex: 1;
  justify-content: center;
  align-items: center;
  p {
    margin: 0.75rem;
  }
  img {
    border-radius: var(--global-border-radius);
    width: 100px;
    height: 100px;
    object-fit: cover;
  }
`;

const PreferencesContainer = styled.div`
  max-width: 80rem;
  margin: auto;
  padding: 0.25rem;
`;

const SettingsIconBtn = styled.button`
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: var(--global-div);
  color: var(--global-text);
  border: none;
  border-radius: var(--global-border-radius);
  padding: 0.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease;

  &:hover,
  &:active {
    transform: scale(1.05);
  }
`;

const Loginbutton = styled.div`
  border-radius: var(--global-border-radius);
  display: flex;
  cursor: pointer;
  padding: 0.75rem;
  justify-content: center;
  align-items: center;
  background-color: var(--global-div);
  color: var(--global-text);
  transition: 0.1s ease-in-out;
  width: 11rem;
  margin: 1rem auto 0 auto;
  &:hover,
  &:active,
  &:focus {
    transform: scale(1.025);
  }
  &:active {
    transform: scale(0.975);
  }

  .svg-wrapper {
    margin-bottom: -0.2rem;
    margin-left: 0.5rem;
    font-size: 1.25rem;
  }
`;

export const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { isLoggedIn, userData, login, logout } = useAuth();
  const [tokenInput, setTokenInput] = useState('');

  useEffect(() => {
    document.title =
      isLoggedIn && userData ? `${userData.name} | Profile` : 'Profile | Miruro';
  }, [isLoggedIn, userData]);

  const handleSettingsClick = () => {
    navigate('/profile/settings');
  };

  const handleManualToken = () => {
    if (!tokenInput.trim()) return;
    safeLocalStorageSet('accessToken', tokenInput.trim());
    window.dispatchEvent(new CustomEvent('authUpdate'));
    window.location.reload();
  };

  return (
    <PreferencesContainer>
      <TopContainer>
        <ProfileContainer>
          <SettingsIconBtn onClick={handleSettingsClick} title='Settings'>
            <FiSettings size={20} />
          </SettingsIconBtn>
          {isLoggedIn && userData ? (
            <>
              <img
                src={userData.avatar?.large}
                alt={`${userData.name}'s avatar`}
              />
              <p>
                Welcome, <b>{userData.name}</b>
              </p>
              {userData.statistics && (
                <>
                  <p>
                    Anime watched: <b>{userData.statistics.anime.count}</b>
                  </p>
                  <p>
                    Total episodes watched:{' '}
                    <b>{userData.statistics.anime.episodesWatched}</b>
                  </p>
                  <p>
                    Total minutes watched:{' '}
                    <b>{userData.statistics.anime.minutesWatched}</b>
                  </p>
                  {userData.statistics.anime.meanScore && (
                    <p>
                      Average score:{' '}
                      <b>{userData.statistics.anime.meanScore.toFixed(1)}</b>
                    </p>
                  )}
                </>
              )}
              <Loginbutton onClick={logout}>
                <b>Log out </b>
                <span className='svg-wrapper'>
                  <IoLogOutOutline />
                </span>
              </Loginbutton>
            </>
          ) : (
            <UserInfoContainer>
              <CgProfile size={'4.5rem'} style={{ marginBottom: '0.75rem', opacity: 0.7 }} />
              <p>
                <b>Guest User</b>
              </p>
              <p>Log in with AniList to sync your watch progress and anime list.</p>
              <Loginbutton onClick={login}>
                <b>Log in with </b>
                <span className='svg-wrapper'>
                  <SiAnilist />
                </span>
              </Loginbutton>

              <div style={{ marginTop: '1.5rem', width: '100%', maxWidth: '350px' }}>
                <p style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '0.5rem' }}>
                  Or paste AniList Token manually:
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="password"
                    placeholder="Paste AniList Access Token..."
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--global-border-radius)',
                      border: '1px solid var(--global-border, #444)',
                      background: 'var(--global-div)',
                      color: 'var(--global-text)',
                      fontSize: '0.85rem',
                    }}
                  />
                  <button
                    onClick={handleManualToken}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: 'var(--global-border-radius)',
                      border: 'none',
                      background: 'var(--primary-accent, #595991)',
                      color: '#fff',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </UserInfoContainer>
          )}
        </ProfileContainer>
      </TopContainer>
      <EpisodeCard />
      <WatchingAnilist />
    </PreferencesContainer>
  );
};

export default Profile;
