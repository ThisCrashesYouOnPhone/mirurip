// /hooks/useCountdown.ts
import { useState, useEffect } from 'react';

export const formatCountdown = (distance: number): string => {
  if (distance <= 0) return 'Airing now or aired';
  const days = Math.floor(distance / (1000 * 60 * 60 * 24));
  const hours = Math.floor(
    (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
  );
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((distance % (1000 * 60)) / 1000);
  return `${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`;
};

export const useCountdown = (targetDate: number | null): string => {
  const [timeLeft, setTimeLeft] = useState(() => targetDate ? formatCountdown(targetDate - Date.now()) : '');

  useEffect(() => {
    if (!targetDate) {
      setTimeLeft('');
      return;
    }

    const update = () => setTimeLeft(formatCountdown(targetDate - Date.now()));
    update();
    const timer = setInterval(() => {
      const distance = targetDate - Date.now();
      if (distance <= 0) {
        clearInterval(timer);
        update();
      } else {
        setTimeLeft(formatCountdown(distance));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  return timeLeft;
};
