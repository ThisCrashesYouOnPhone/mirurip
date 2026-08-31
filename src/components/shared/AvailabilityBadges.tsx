import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { FaClosedCaptioning, FaMicrophone } from 'react-icons/fa';
import { fetchAniKotoAvailability, type SourceAvailability } from '../../client/sourceAvailability';

const Badges = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin-left: auto;
  flex: 0 0 auto;
  color: var(--global-text);
  opacity: 0.8;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1;
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.18rem;
  min-width: 1.35rem;
  line-height: 1;
  white-space: nowrap;
  svg {
    width: 0.78rem;
    height: 0.78rem;
    flex: 0 0 auto;
    margin: 0;
  }
`;

export const AvailabilityBadges: React.FC<{ animeId: string; title: string }> = ({ animeId, title }) => {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [availability, setAvailability] = useState<SourceAvailability | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    // Fetch only cards that are about to enter the viewport. A wide margin
    // caused every home shelf and sidebar card to fan out availability work
    // during initial page load, especially on long-series pages.
    }, { rootMargin: '50px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !animeId || !title) return;
    let cancelled = false;
    void fetchAniKotoAvailability(animeId, title).then((result) => {
      if (!cancelled) setAvailability(result);
    });
    return () => { cancelled = true; };
  }, [visible, animeId, title]);

  return <Badges ref={hostRef} aria-label={availability ? `Available subtitles: ${availability.sub}, dubs: ${availability.dub}` : undefined}>
    {availability && availability.sub > 0 && <Badge title={`${availability.sub} subtitle episodes`}><FaClosedCaptioning />{availability.sub}</Badge>}
    {availability && availability.dub > 0 && <Badge title={`${availability.dub} dub episodes`}><FaMicrophone />{availability.dub}</Badge>}
  </Badges>;
};
