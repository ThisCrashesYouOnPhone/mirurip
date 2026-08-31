export type ChapterSkipTime = {
  interval: {
    startTime: number;
    endTime: number;
  };
  skipType: string;
  episodeLength?: number;
  skipId?: string;
};

export type ChapterCue = {
  startTime: number;
  endTime: number;
  text: string;
  type: string; // 'prologue' | 'op' | 'episode' | 'ed' | 'preview' | 'epilogue' | 'recap' | 'chapter'
};

const CHAPTER_TYPES = new Set(['op', 'ed', 'mixed-op', 'mixed-ed', 'recap', 'intro', 'opening', 'ending', 'adelanto', 'preview']);

export const PREVIEW_TYPES = new Set(['preview', 'adelanto']);

export const SKIPPABLE_TYPES = new Set([
  'op',
  'ed',
  'mixed-op',
  'mixed-ed',
  'recap',
  'intro',
  'opening',
  'ending',
]);

/** Preview is only auto-skippable when the user opted into Auto Next and a
 * real next episode exists. An absent interval is never treated as a guess. */
export function shouldAutoSkipPreview(
  autoNext: boolean,
  hasNextEpisode: boolean,
  currentTime: number,
  preview: ChapterSkipTime['interval'] | null,
  alreadySkipped: boolean = false,
): boolean {
  return Boolean(
    autoNext && hasNextEpisode && !alreadySkipped && preview &&
    currentTime >= preview.startTime && currentTime < preview.endTime,
  );
}

export function chapterLabel(skipType: string): string {
  const normalized = (skipType || '').toLowerCase();
  if (normalized.includes('recap')) return 'Recap';
  if (normalized.includes('intro')) return 'Intro';
  if (normalized.includes('ed') || normalized.includes('ending')) return 'Ending';
  if (normalized.includes('preview') || normalized.includes('adelanto')) return 'Preview';
  return 'Opening';
}

/** Detect chapter type category from text label (supports EN, ES, JA, etc.) */
export function detectChapterType(text: string): string {
  const t = (text || '').toLowerCase();
  if (/^op\b|opening|intro|opening\s*\d+/i.test(t)) return 'op';
  if (/^ed\b|ending|ending\s*\d+/i.test(t)) return 'ed';
  if (/recap|resumen/i.test(t)) return 'recap';
  if (/prologue|prólogo|intro\b/i.test(t)) return 'prologue';
  if (/preview|adelanto|avance|next\s*episode/i.test(t)) return 'preview';
  return 'chapter';
}

/** Parse raw WebVTT timestamp (HH:MM:SS.mmm or MM:SS.mmm) into seconds. */
export function parseVttTimestamp(timestamp: string): number {
  const parts = timestamp.trim().split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    return minutes * 60 + seconds;
  }
  return 0;
}

/** Parse raw WebVTT text (e.g. from provider native chapters.vtt) into structured cues and skip markers. */
export function parseWebVttChapters(vttText: string): { cues: ChapterCue[]; skipTimes: ChapterSkipTime[] } {
  if (!vttText || !vttText.includes('-->')) {
    return { cues: [], skipTimes: [] };
  }

  const lines = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const cues: ChapterCue[] = [];
  const skipTimes: ChapterSkipTime[] = [];

  let currentStart = -1;
  let currentEnd = -1;
  let currentText = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      const match = line.match(/((?:\d+:)?\d+:\d+(?:\.\d+)?)\s*-->\s*((?:\d+:)?\d+:\d+(?:\.\d+)?)/);
      if (match) {
        currentStart = parseVttTimestamp(match[1]);
        currentEnd = parseVttTimestamp(match[2]);
        currentText = '';
        // Look ahead for the cue text
        for (let j = i + 1; j < lines.length; j++) {
          const textLine = lines[j].trim();
          if (!textLine || textLine.includes('-->')) {
            break;
          }
          currentText += (currentText ? ' ' : '') + textLine;
        }

        if (currentEnd > currentStart && currentText) {
          const type = detectChapterType(currentText);
          const cue: ChapterCue = {
            startTime: currentStart,
            endTime: currentEnd,
            text: currentText,
            type,
          };
          cues.push(cue);

          if (SKIPPABLE_TYPES.has(type) || type === 'op' || type === 'ed' || type === 'recap') {
            skipTimes.push({
              interval: {
                startTime: currentStart,
                endTime: currentEnd,
              },
              skipType: type,
            });
          }
        }
      }
    }
  }

  return { cues, skipTimes };
}

/** Format seconds into WebVTT timestamp string (HH:MM:SS.mmm). */
export function formatVttTimestamp(seconds: number): string {
  const totalMilliseconds = Math.round(Math.max(0, seconds) * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${wholeSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

/** Normalize AniSkip results against the real duration of the loaded stream. */
export function normalizeSkipTimes(results: ChapterSkipTime[], duration: number): ChapterSkipTime[] {
  const bestByChapter = new Map<string, ChapterSkipTime>();

  for (const item of results) {
    const type = (item.skipType || '').toLowerCase();
    if (
      !CHAPTER_TYPES.has(type) ||
      !Number.isFinite(item.interval?.startTime) ||
      !Number.isFinite(item.interval?.endTime)
    ) {
      continue;
    }

    const recordedLength = Number(item.episodeLength) || 0;
    const current = bestByChapter.get(chapterLabel(item.skipType));
    const currentDistance = current && duration > 0
      ? Math.abs((Number(current.episodeLength) || duration) - duration)
      : Number.POSITIVE_INFINITY;
    const itemDistance = duration > 0
      ? Math.abs((recordedLength || duration) - duration)
      : 0;
    if (!current || itemDistance < currentDistance) bestByChapter.set(chapterLabel(item.skipType), item);
  }

  const normalized = [...bestByChapter.values()]
    .map((item) => {
      const recordedLength = Number(item.episodeLength) || 0;
      const offset = duration > 0 && recordedLength > 0 ? duration - recordedLength : 0;
      const startTime = Math.max(0, item.interval.startTime + offset);
      const endTime = Math.max(startTime, item.interval.endTime + offset);
      return {
        ...item,
        interval: {
          startTime: duration > 0 ? Math.min(startTime, duration) : startTime,
          endTime: duration > 0 ? Math.min(endTime, duration) : endTime,
        },
      };
    })
    .filter(({ interval }) => interval.endTime > interval.startTime)
    .sort((a, b) => a.interval.startTime - b.interval.startTime);

  // A provider can return overlapping records after duration correction.
  // Keep the first selected chapter intact and trim later chapters so the
  // player receives a deterministic, non-overlapping sequence.
  let previousEnd = 0;
  return normalized
    .map((item) => {
      const startTime = Math.max(previousEnd, item.interval.startTime);
      const endTime = Math.max(startTime, item.interval.endTime);
      previousEnd = endTime;
      return { ...item, interval: { startTime, endTime } };
    })
    .filter(({ interval }) => interval.endTime > interval.startTime);
}

/** Synthesize full Seanime-standard 5-segment chapters from AniSkip data. */
export function synthesizeSeanimeChapters(
  results: ChapterSkipTime[],
  duration: number,
  isMovie: boolean = false,
): ChapterCue[] {
  // Use the actual media duration when it is known. The previous 24-minute
  // floor pushed chapter cues past the end of shorter episodes and could make
  // the player discard the track entirely.
  const effectiveDuration = duration > 0 ? duration : 1440;
  const clamp = (t: number) => Math.min(effectiveDuration, Math.max(0, t));

  const op = results.find((r) => r.skipType === 'op' || r.skipType === 'mixed-op');
  const ed = results.find((r) => r.skipType === 'ed' || r.skipType === 'mixed-ed');
  const recap = results.find((r) => r.skipType === 'recap');
  const preview = results.find((r) => PREVIEW_TYPES.has((r.skipType || '').toLowerCase()));

  if (!op && !ed && !recap && !preview) {
    return [];
  }

  const chapters: ChapterCue[] = [];

  // 1. Cold Open Recap (if starting near 0s)
  if (recap && recap.interval && recap.interval.startTime < 10) {
    const rStart = clamp(recap.interval.startTime);
    const rEnd = clamp(recap.interval.endTime);
    if (rEnd > rStart) {
      chapters.push({ startTime: rStart, endTime: rEnd, text: 'Recap', type: 'recap' });
    }
  }

  // 2. Opening
  if (op && op.interval) {
    const opStart = clamp(op.interval.startTime);
    const opEnd = clamp(op.interval.endTime);

    // Prologue before opening if gap > 5 seconds
    const prevEnd = chapters.length > 0 ? chapters[chapters.length - 1].endTime : 0;
    if (opStart > prevEnd + 5) {
      chapters.push({ startTime: prevEnd, endTime: opStart, text: 'Prologue', type: 'prologue' });
    }

    if (opEnd > opStart) {
      const opText = op.skipType === 'mixed-op' ? 'Mixed Opening' : 'Opening';
      chapters.push({ startTime: opStart, endTime: opEnd, text: opText, type: op.skipType });
    }
  }

  // 3. Episode / Main Content
  const prevEnd = chapters.length > 0 ? chapters[chapters.length - 1].endTime : 0;
  const edStart = ed && ed.interval
    ? clamp(ed.interval.startTime)
    : preview?.interval
      ? clamp(preview.interval.startTime)
      : effectiveDuration;
  if (edStart > prevEnd + 5) {
    const mainText = isMovie ? 'Movie' : 'Episode';
    chapters.push({ startTime: prevEnd, endTime: edStart, text: mainText, type: 'episode' });
  }

  // 4. Ending
  if (ed && ed.interval) {
    const edStartClamped = clamp(ed.interval.startTime);
    const edEndClamped = clamp(ed.interval.endTime);
    if (edEndClamped > edStartClamped) {
      const edText = ed.skipType === 'mixed-ed' ? 'Mixed Ending' : 'Ending';
      chapters.push({ startTime: edStartClamped, endTime: edEndClamped, text: edText, type: ed.skipType });

      // 5. Explicit Preview or ordinary Epilogue. Only an explicit provider
      // chapter is eligible for automatic preview skipping.
      if (preview?.interval) {
        const previewStart = clamp(Math.max(edEndClamped, preview.interval.startTime));
        const previewEnd = clamp(preview.interval.endTime);
        if (previewEnd > previewStart) {
          chapters.push({ startTime: previewStart, endTime: previewEnd, text: 'Preview', type: 'preview' });
        }
      } else if (edEndClamped < effectiveDuration - 5) {
        chapters.push({ startTime: edEndClamped, endTime: effectiveDuration, text: 'Epilogue', type: 'epilogue' });
      }
    }
  } else if (preview?.interval) {
    const previewStart = clamp(preview.interval.startTime);
    const previewEnd = clamp(preview.interval.endTime);
    if (previewEnd > previewStart) {
      chapters.push({ startTime: previewStart, endTime: previewEnd, text: 'Preview', type: 'preview' });
    }
  }

  return chapters.sort((a, b) => a.startTime - b.startTime);
}

/** Build a valid, non-overlapping WebVTT chapter sidecar for Vidstack. */
export function generateChapterVtt(
  results: ChapterSkipTime[] | ChapterCue[],
  duration: number,
  title: string = 'Anime',
  episodeNumber: string = '1',
): string {
  // If given raw ChapterSkipTime[], synthesize full Seanime cues
  const isCues = results.length > 0 && 'text' in results[0];
  const cues: ChapterCue[] = isCues
    ? (results as ChapterCue[])
    : synthesizeSeanimeChapters(results as ChapterSkipTime[], duration);

  if (cues.length === 0) {
    return '';
  }

  let vtt = 'WEBVTT\n\n';
  cues.forEach((cue, index) => {
    vtt += `${index + 1}\n`;
    vtt += `${formatVttTimestamp(cue.startTime)} --> ${formatVttTimestamp(cue.endTime)}\n`;
    vtt += `${cue.text || `${title} - Episode ${episodeNumber}`}\n\n`;
  });

  return vtt;
}
