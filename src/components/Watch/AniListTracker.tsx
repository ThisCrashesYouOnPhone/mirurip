import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { SiAnilist } from 'react-icons/si';
import { useAuth } from '../../client/useAuth';
import {
  fetchAniListMediaListEntry,
  updateAniListStatus,
  type AniListMediaListEntry,
} from '../../client/anilistSync';

const STATUS_OPTIONS = [
  ['CURRENT', 'Watching'],
  ['PLANNING', 'Plan to watch'],
  ['COMPLETED', 'Completed'],
  ['REPEATING', 'Re-watching'],
  ['PAUSED', 'Paused'],
  ['DROPPED', 'Dropped'],
] as const;
const NO_SCORE = 0;

const Card = styled.section`
  margin-top: 1rem;
  padding: 0.85rem;
  width: 100%;
  min-width: 0;
  border-radius: var(--global-border-radius);
  background: var(--global-div-tr);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.65rem;
  font-weight: bold;
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
`;

const Control = styled.select`
  flex: 1 1 8rem;
  min-width: 0;
  padding: 0.45rem;
  border: none;
  border-radius: var(--global-border-radius);
  background: var(--global-div);
  color: var(--global-text);
`;

const NumberInput = styled.input`
  flex: 0 1 5rem;
  min-width: 4rem;
  padding: 0.45rem;
  border: none;
  border-radius: var(--global-border-radius);
  background: var(--global-div);
  color: var(--global-text);
`;

const Action = styled.button`
  padding: 0.5rem 0.7rem;
  border: none;
  border-radius: var(--global-border-radius);
  background: var(--primary-accent);
  color: #fff;
  font-weight: bold;
  cursor: pointer;
  flex: 1 1 9rem;
  min-width: 0;
`;

const Message = styled.p`
  margin: 0.4rem 0 0;
  font-size: 0.8rem;
  opacity: 0.78;
`;

const Tracking = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--primary-accent);
  font-size: 0.78rem;
  white-space: nowrap;
`;

const LiveDot = styled.span`
  width: 0.48rem;
  height: 0.48rem;
  border-radius: 50%;
  background: var(--primary-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-accent) 20%, transparent);
`;

interface AniListTrackerProps {
  mediaId: string | number;
  title: string;
  episodeNumber?: number;
  totalEpisodes?: number;
}

export function AniListTracker({
  mediaId,
  title,
  episodeNumber = 1,
  totalEpisodes,
}: AniListTrackerProps) {
  const { isLoggedIn, login, userData } = useAuth();
  const selectedEpisode = Number.isFinite(episodeNumber) && (episodeNumber || 0) > 0
    ? Math.floor(episodeNumber as number)
    : 1;
  const [entry, setEntry] = useState<AniListMediaListEntry | null>(null);
  const [entryLoaded, setEntryLoaded] = useState(false);
  const [entryLookupFailed, setEntryLookupFailed] = useState(false);
  const [status, setStatus] = useState('CURRENT');
  const [score, setScore] = useState(NO_SCORE);
  const [progress, setProgress] = useState(selectedEpisode);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const numericMediaId = Number(mediaId);
  const validMediaId = Number.isInteger(numericMediaId) && numericMediaId > 0;

  const applyEntry = useCallback((loaded: AniListMediaListEntry) => {
    setEntry(loaded);
    setEntryLoaded(true);
    setEntryLookupFailed(false);
    setStatus(loaded.status || 'CURRENT');
    // AniList's score field is 0–100; the UI intentionally presents 0–10.
    const loadedScore = Number(loaded.score);
    const scoreOnTenScale = loadedScore > 10 ? loadedScore / 10 : loadedScore;
    setScore(Number.isFinite(scoreOnTenScale) && scoreOnTenScale > 0
      ? Math.min(10, Math.round(scoreOnTenScale))
      : NO_SCORE);
    setProgress(Math.max(selectedEpisode, loaded.progress || 0));
  }, [selectedEpisode]);

  const loadEntry = useCallback(async () => {
    if (!isLoggedIn || !validMediaId) return;
    setEntryLoaded(false);
    setEntryLookupFailed(false);
    const loaded = await fetchAniListMediaListEntry(numericMediaId, userData?.id);
    if (loaded === undefined) {
      setEntryLookupFailed(true);
      return;
    }
    setEntryLoaded(true);
    setEntryLookupFailed(false);
    if (loaded) {
      applyEntry(loaded);
    }
  }, [applyEntry, isLoggedIn, numericMediaId, userData?.id, validMediaId]);

  useEffect(() => {
    void loadEntry();
  }, [loadEntry]);

  useEffect(() => {
    const refreshEntry = (event: Event) => {
      const detail = (event as CustomEvent<{ mediaId?: number; entry?: AniListMediaListEntry }>).detail;
      if (detail?.mediaId === numericMediaId && detail.entry) {
        applyEntry(detail.entry);
        setMessage(`Progress synced: episode ${detail.entry.progress}.`);
        return;
      }
      // Manual saves and external updates without an entry payload still use
      // the normal lookup path.
      void loadEntry();
    };
    window.addEventListener('aniListSync', refreshEntry);
    return () => window.removeEventListener('aniListSync', refreshEntry);
  }, [applyEntry, loadEntry, numericMediaId]);

  const save = async () => {
    if (!validMediaId) return;
    setSaving(true);
    setMessage('Saving…');
    try {
      const safeProgress = Math.max(
        entry?.progress || 0,
        progress || 0,
        episodeNumber || 0,
      );
      const saved = await updateAniListStatus(
        numericMediaId,
        status,
        score > NO_SCORE ? score * 10 : undefined,
        safeProgress,
      );
      if (!saved) throw new Error('AniList did not return an updated entry');
      setEntry(saved);
      setProgress(Math.max(safeProgress, saved.progress || 0));
      setMessage(`Saved ${title} to AniList.`);
      window.dispatchEvent(new CustomEvent('aniListSync'));
    } catch {
      setMessage('Could not save to AniList. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card aria-label='AniList tracking controls'>
      <Header>
        <span><SiAnilist /> AniList</span>
        {entry && (
          <Tracking title={`${entry.status || 'CURRENT'} · ${entry.progress || 0} episodes`}>
            <LiveDot />
            Tracking · {entry.progress || 0}{totalEpisodes ? `/${totalEpisodes}` : ''}
          </Tracking>
        )}
      </Header>
      {!isLoggedIn ? (
        <>
          <Message>Log in to add {title}, save progress, and rate it.</Message>
          <Action onClick={login}>Log in with AniList</Action>
        </>
      ) : (
        <>
          {entryLookupFailed && (
            <Message role='status'>AniList status is temporarily unavailable. Your progress will remain queued and retry automatically.</Message>
          )}
          {!entry && entryLoaded && !entryLookupFailed && (
            <Message role='status'>New series detected — add it to your AniList watching list.</Message>
          )}
          <Controls>
            <Control value={status} onChange={(event) => setStatus(event.target.value)} aria-label='AniList status'>
              {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Control>
            <Control value={score} onChange={(event) => setScore(Number(event.target.value))} aria-label='AniList score'>
              <option value={NO_SCORE}>No score</option>
              {[...Array(10)].map((_, index) => <option key={index + 1} value={index + 1}>{index + 1}/10</option>)}
            </Control>
            <NumberInput
              type='number'
              min={0}
              max={totalEpisodes || undefined}
              value={progress}
              onChange={(event) => setProgress(Math.max(0, Number(event.target.value) || 0))}
              aria-label='AniList episode progress'
            />
            <Action onClick={save} disabled={saving}>{saving ? 'Saving…' : entry ? 'Save to AniList' : 'Add to Watching'}</Action>
          </Controls>
          <Message>
            Automatic progress sync activates at 80% watched, never moves progress backwards, and creates a missing entry as Watching.
          </Message>
          {message && <Message role='status'>{message}</Message>}
        </>
      )}
    </Card>
  );
}
