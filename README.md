<div align="center">

# MIRURIP

An optimized Miruro fork focused on reliable playback, mobile browsers, and low-memory iPad devices.

[![Build](https://github.com/ThisCrashesYouOnPhone/mirurip/actions/workflows/ci.yml/badge.svg)](https://github.com/ThisCrashesYouOnPhone/mirurip/actions/workflows/ci.yml)
[![Stars](https://img.shields.io/github/stars/ThisCrashesYouOnPhone/mirurip?style=flat&logo=github)](https://github.com/ThisCrashesYouOnPhone/mirurip/stargazers)
[![Forks](https://img.shields.io/github/forks/ThisCrashesYouOnPhone/mirurip?style=flat&logo=github)](https://github.com/ThisCrashesYouOnPhone/mirurip/network/members)
[![Issues](https://img.shields.io/github/issues/ThisCrashesYouOnPhone/mirurip?style=flat&logo=github)](https://github.com/ThisCrashesYouOnPhone/mirurip/issues)
[![Last commit](https://img.shields.io/github/last-commit/ThisCrashesYouOnPhone/mirurip?style=flat)](https://github.com/ThisCrashesYouOnPhone/mirurip/commits/main)
[![License](https://img.shields.io/github/license/ThisCrashesYouOnPhone/mirurip?style=flat)](LICENSE)
[![Repository views](https://gitviews.com/repo/ThisCrashesYouOnPhone/mirurip.svg)](https://github.com/ThisCrashesYouOnPhone/mirurip)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ThisCrashesYouOnPhone/mirurip)

</div>

## About

MiruRip is a maintained, performance-oriented fork of [Miruro](https://github.com/Miruro-no-kuon/Miruro). It keeps the original React/Vite experience while adding a more defensive playback pipeline, typed edge functions, AniList tracking, mobile-safe layouts, and source-aware subtitle handling.

This project is intended for personal, non-commercial use. Review the included [license](LICENSE), the terms of each upstream service, and the laws applicable to you before deploying it.

## What this fork adds

### Playback and source reliability

- Separate **H-Sub**, **S-Sub**, and **Dub** modes. A hard-sub stream is never presented as a soft-sub track, and a missing dub never silently falls back to subtitles.
- AniKoto is the primary resolver, followed by AniNeko and KAA according to the configured source order.
- Clear, retryable unavailable-source states replace infinite loading when an episode, language, manifest, or resolver is unavailable.
- HLS proxying preserves manifest and segment URLs while forwarding the required referer and range behavior.
- Native Apple HLS and hls.js/MSE are selected based on actual device capability. No fixed 360p or 720p quality cap is imposed.
- Bounded HLS buffers, worker-based transmuxing, throttled UI updates, and one-second progress persistence reduce memory pressure on older iPads without forcing low resolution.

### Subtitle and chapter handling

- Soft subtitles load as declarative, URL-backed WebVTT tracks managed by Vidstack.
- Subtitle tracks have stable episode-and-URL identities, preventing duplicate English tracks or an old episode’s track from being selected.
- Failed subtitle VTTs are diagnosed and reported instead of leaving an empty caption track selected.
- Opening, ending, recap, and verified preview intervals are converted into chapter metadata without corrupting the HLS manifest.
- Auto-skip and the visible skip button use the same normalized timing data.
- Preview skipping only occurs when Auto Next is enabled and another episode exists.
- Responsive captions use the rendered player size, including fullscreen, with selectable size and background preferences in the player’s Captions menu.
- Caption preferences persist safely in local storage, including private browsing and quota-limited iOS environments.

### iPad, phone, and desktop behavior

- The same media element remains mounted during episode changes whenever possible, improving PiP continuity.
- The next episode’s stream metadata is prefetched without downloading media segments.
- Media Session play, pause, next, and previous actions are supported where the browser exposes them.
- Safari/iPadOS autoplay and PiP limitations are handled gracefully: when automatic restart is rejected, the next episode remains loaded with a normal play action available.
- Layouts use bounded widths, responsive grids, safe overflow rules, and mobile-sized controls so content does not exceed the viewport.
- Caption overlays retain their full Vidstack dimensions while positioning text above the controls on small screens.

### AniList integration

- OAuth callback handling for browser-based AniList login.
- Episode metadata includes release dates, airing countdowns, and released-episode filtering.
- Season cards traverse linked TV/ONA prequels and sequels, deduplicate entries, and sort them chronologically.
- The player shows a tracking banner with current status and progress.
- New titles can be added automatically after 80% playback, including when the user starts at a later episode.
- Progress is monotonic and synchronized on the 80% threshold, pause, episode end, page hide, visibility changes, reconnect, and authenticated remount.
- Failed updates are queued for bounded retry instead of being silently lost during PiP or background transitions.
- Scores are validated and the UI provides one score control with a **No score** option.

### Metadata, caching, and availability

- AniKoto metadata and availability requests are deduplicated and cached at the client/edge layers where appropriate.
- Availability badges are lazy and only shown when a trustworthy count is available; zeroes are not invented after failed requests.
- Long-series fallback metadata avoids one request per visible card and reduces rate-limit pressure.
- Browser storage remains device-local, while shared edge/API caches can benefit multiple devices requesting the same data.

## Deploy to Cloudflare

The primary button deploys MiruRip as a Cloudflare Worker with static assets. At build time, Wrangler compiles the existing file-based Pages Functions in `functions/` into one Worker and preserves their routes; the Worker falls back to the bundled Vite assets for the app. No API-route refactor is required. The deploy screen offers a repository-privacy checkbox; its choice belongs to the deploying GitHub account.

The button creates a deployment in the visitor’s own Cloudflare account. It needs no API key for the standard configuration. The project has no required Cloudflare KV, D1, or R2 binding. Only the optional AniList authorization-code flow needs an `ANILIST_CLIENT_SECRET` Worker secret.

For a new Worker deployment, use the button above or run:

```powershell
npm ci
npm run deploy:worker
```

### Manual Cloudflare Pages alternative

Pages remains supported for anyone who prefers it. Use `npm run build:pages` as the build command so Pages continues to discover and deploy the original `functions/` directory directly.

1. Fork this repository and open **Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git**.
2. Select your fork and the `main` branch.
3. Use these build settings:

   - Framework preset: **None**
   - Build command: `npm run build:pages`
   - Build output directory: `dist`
   - Root directory: `/`

4. Add only the optional values you need from [env.example](env.example) under the Pages project’s production and preview environments. For the authorization-code AniList flow, also configure `ANILIST_CLIENT_SECRET` as a server-side secret.
5. Save and deploy. Future pushes to `main` will create production deployments; other branches can be configured as previews.

For direct upload from a trusted local machine:

```powershell
npm ci
npm run build:pages
$env:CLOUDFLARE_API_TOKEN=(Get-Content 'cft.txt').Trim()
$env:CLOUDFLARE_ACCOUNT_ID='YOUR_ACCOUNT_ID'
npx wrangler pages deploy dist --project-name YOUR_PAGES_PROJECT --commit-dirty=true
```

Never commit `cft.txt`, API tokens, OAuth secrets, HAR files, or provider credentials. The repository ignore rules exclude these local artifacts by default.

## Local development

Requirements: Node.js 20 or newer and npm. Bun is also supported, but `package-lock.json` is intentionally tracked for reproducible npm/Cloudflare builds.

```bash
git clone https://github.com/ThisCrashesYouOnPhone/mirurip.git
cd mirurip
npm ci
```

For local overrides, copy [env.example](env.example) to `.env`. Do not add a client secret to a Vite-prefixed browser variable; set `ANILIST_CLIENT_SECRET` only in your Worker/Pages secret configuration when using the authorization-code flow.

Copy [env.example](env.example) to `.env.local`, then start the development server:

```bash
npm run dev
```

To run a production build locally:

```bash
npm run build
npm run preview
```

## Testing

Run the complete Vitest suite:

```bash
npm test
```

Run the focused player/source tests:

```bash
npx vitest run src/test/subtitleSettings.test.ts src/test/subtitleTracks.test.ts src/test/streamService.test.ts src/test/components.test.tsx functions/api/alternateSources.test.ts
```

The CI workflow runs the tests and production build on pushes and pull requests.

## Repository metrics

This repository includes a scheduled [lowlighter/metrics](https://github.com/lowlighter/metrics) workflow. It generates `metrics.svg` with repository activity, languages, stargazers, and traffic where GitHub permits access. Run it manually from the **Actions → Repository metrics** tab after the first push; scheduled runs refresh it automatically.

The README also includes live badges for build status, stars, forks, issues, last commit, license, repository views, and a [Star History chart](https://star-history.com/#ThisCrashesYouOnPhone/mirurip&Date):

[![Star History Chart](https://api.star-history.com/svg?repos=ThisCrashesYouOnPhone/mirurip&type=Date)](https://star-history.com/#ThisCrashesYouOnPhone/mirurip&Date)

Repository view counters are third-party request-time services and can be blocked by privacy tools or image caching. They should be treated as an indication, not authoritative GitHub Analytics data.

## Architecture notes

- `src/` contains the React/Vite client and player UI.
- `functions/api/` contains Cloudflare Pages Functions for proxying, streaming resolution, chapters, AniKoto metadata, and availability.
- `src/client/` contains typed stream, subtitle, chapter, AniList, storage, and Media Session helpers.
- `src/test/` contains Miruro-focused unit and component regression tests.
- `tools/` contains optional local diagnostics; captured traffic and scratch clones are intentionally not part of the public repository.

Playback URLs can be temporary and provider availability can change independently of this codebase. The source adapter is deliberately isolated so providers can be repaired or removed without changing the player contract.

## Credits

This fork builds on the original [Miruro-no-kuon/Miruro](https://github.com/Miruro-no-kuon/Miruro) project and its upstream dependencies, including React, Vite, Vidstack, hls.js, AniList, and provider APIs. Please preserve attribution when redistributing it.

## License

See [LICENSE](LICENSE). The original project’s custom attribution/non-commercial terms apply unless you have written permission from the rights holders.
