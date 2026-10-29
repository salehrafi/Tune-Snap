# Tune Snap — Project Documentation

Tune Snap is a Chromium-based browser extension built with Manifest V3 for capturing the song in the
**current Instagram Reel**, finding it on YouTube, and saving it to a local wishlist. This document
records the detection design, root-cause investigation, scoring model, verification results, and
limitations.

Last updated: 2026-10-30

## 1. Scope and architecture

Supported surface:

- `https://www.instagram.com/*` only.
- Automatic detection only on Instagram Reel URLs (`/reel/<code>/`, `/reels/<code>/`).
- No content script on any other host.
- YouTube search, result selection, Play Now, and the local wishlist are preserved.

```
Popup (React)
  └─ useReelDetection
       ├─ non-Instagram host ──────────────► exact unsupported message, no page contact
       ├─ Instagram non-Reel ──────────────► exact non-Reel message, no detection
       └─ Instagram Reel
            ├─ GET_REEL_TRACK ────────────► content script
            └─ REEL_WATCH_PORT ───────────► popup-lifetime change subscription
                                                │
Content script (Instagram only)                 ▼
  ├─ lib/adapters/instagram.ts
  ├─ lib/detection/dom-sources.ts
  ├─ lib/detection/structured.ts
  ├─ lib/detection/engine.ts
  ├─ lib/adapters/layout.ts
  └─ lib/detection/watch.ts
```

- No backend, remote inference, analytics, or audio capture.
- No background service worker; the popup drives search and the content script answers requests.
- The content script is invisible.
- The extension requests `storage`, `activeTab`, and the Instagram host permission only.
- Compatibility: existing `reeltune.settings.v1`, `reeltune.wishlist.v1`,
  `reeltune.youtube.cache.v1`, and the `reeltune-reel-watch` port name are intentionally unchanged.
  They are internal identifiers, not visible branding, and preserve existing user data/messaging.

## 2. Root-cause investigation

### 2.1 There is no hardcoded song or cached track

A production-source and build scan found no hardcoded song/artist fallback. The stale values seen in
earlier reports came from page selection, not a default constant. Test fixtures use song names only
to reproduce parsing/layout cases.

### 2.2 The earlier detector was single-source and all-or-nothing

The previous path:

1. Queried a few selector families (audio links, music-oriented `aria-label`s, note glyphs).
2. Applied a hard geometry gate requiring a visible `<video>` and a label sharing a non-`<body>`
   container, near the video, within `nearest DOM distance + 1`.
3. Selected the first candidate with the highest parser confidence.
4. Retried for only about 1.2 s for delayed rendering.

This fails when a valid label is in a portal/sidebar, when the page renders late, when only a plain
visible label exists, or when structured metadata is present but the DOM label is missing. It also
has no way to compare conflicting evidence.

### 2.3 Live evidence from a public Instagram Reel

A public Reel was inspected read-only through browser DevTools while logged out:

- The visible audio link (`A2O, A2O LITE•NEON`) was 28 DOM edges from the video.
- The page embedded a structured record:

```json
"music_info": {
  "music_asset_info": {
    "audio_cluster_id": "1034034453030002",
    "title": "NEON",
    "display_artist": "A2O, A2O LITE"
  }
}
```

The earlier path never read that record. It is now the strongest evidence when tied to the current
Reel's code/audio id.

### 2.4 Production-specific lifecycle failure: URL changes did not invalidate the watcher

The reported production behavior was: the first Reel's song was detected, then navigating to a
different Reel kept the old song and never detected the new one. Development mode appeared fine.

Code-level findings:

- The popup-lifetime `startReelWatch` observer was created once per port and scheduled extraction
  **only from DOM mutations**. It had no URL input at all.
- Instagram can commit the SPA URL without a later MutationObserver callback, or update the reused
  label element before committing the URL. In that ordering, no evaluation was scheduled for the
  new URL. The popup's `tabs.onUpdated` was the only fallback, and relying on that event alone was
  not sufficient.
- A transient non-Reel result disconnected the watch port. Once disconnected, the only live path
  for subsequent Reels was gone.
- Async responses were guarded by a request id but not by Reel identity, so a response for the
  previous URL could be applied after navigation.
- Development-mode reload/HMR recreated the content script and masked the persistent production
  observer problem.

This was reproduced before the fix with failing regression tests: a URL-only change produced no
message, and the built bundle re-approved the old `NEON` structured/link evidence under the new Reel
URL.

The smallest fix keeps the existing engine and adds a lifecycle layer:

- the watcher checks stable Reel identity (`reelIdentity`) on a 500 ms interval while the popup is
  open, plus `popstate`/`hashchange`;
- a URL change immediately emits a track-less invalidation for the new URL;
- the previous track is suppressed until the visible music DOM changes or a different track is
  detected, so the old label/structured record cannot be presented as the new Reel;
- the content script keeps a page-lifetime Reel session across popup close/reopen, so a fresh
  request after navigation also rejects the old label rather than trusting it because the watcher
  was not running;
- duplicate watch ports stop the previous observer, keeping one observer/URL poll per page;
- the non-Reel path no longer disconnects the live watcher;
- the popup checks the active tab URL once per second as an SPA fallback, clears the card as soon as
  the URL changes, and rejects async responses whose Reel identity is older than the active URL.

## 3. Implemented detection layers

### 3.1 Structured page metadata (`lib/detection/structured.ts`)

- Scans page `<script>` text locally for `music_asset_info`/`music_info` records with `title`,
  `display_artist`, and `audio_cluster_id`.
- Supports `MusicRecording` JSON-LD as weak evidence.
- Trusts a record strongly only when:
  - its `audio_cluster_id` matches a visible Instagram audio link, or
  - the nearest Reel `"code"`/`"id"`/`"video_id"` before the record matches the URL, or
  - it is the only structured record on the page (reduced context).
- Does not guess between multiple unmatched records; malformed JSON is ignored.
- This is page-resident data. No private API/GraphQL request is made.

### 3.2 DOM and accessibility signals (`lib/detection/dom-sources.ts`)

- Instagram audio links (`/reels/audio/`, `/reel/audio/`, `/audio/`) with text, `aria-label`, `title`.
- `aria-label`, `title`, `aria-description`, music-oriented `data-testid`, `data-audio-title`,
  `data-song-title`, `data-track-title`, and `img[alt]`.
- Labels attached to the video and up to five ancestors.
- Short visible song/artist text in the Reel shell, even without a link/glyph; it must overlap the
  video and must not be a container wrapping the video.
- Music-note text (`♫`, `♪`, ...).
- `navigator.mediaSession.metadata` as weak corroboration.
- `og:`/description caption text for consistency only, never as the sole detection.

### 3.3 Reel context (`lib/adapters/layout.ts`)

- Finds the active `<video>` by visible area, viewport-centre proximity, and playing state.
- Ignores hidden, zero-sized, offscreen, and `aria-hidden` videos.
- Grades each element:
  - hidden/offscreen → 0;
  - inside the active video's nearest container → strong;
  - near the video in a shared container → medium;
  - inside a visible dialog/article/main shell → medium;
  - page-level/body/portal → weak;
  - a shared feed containing several videos → reduced.
- If no video is visible, a visible dialog/article/main can still provide context.

### 3.4 Dynamic observation and SPA handling

- The content script waits up to **1.8 s** for delayed rendering with a request-scoped
  `MutationObserver` (120 ms throttle), then disconnects.
- It observes child/text changes plus `aria-label`, `title`, `href`, `src`, `hidden`, `aria-hidden`.
- Every evaluation reads the current URL and DOM; no previous Reel result is cached.
- While the popup is open, a `REEL_WATCH_PORT` watcher:
  - checks `reelIdentity` on a 500 ms interval and on `popstate`/`hashchange`;
  - emits an immediate track-less invalidation when the Reel identity changes;
  - suppresses the previous track until the visible audio-link DOM changes or a different track is
    found;
  - emits a new detection only when the signature (URL, reason, title, artist, confidence) changes,
    including `no-metadata`.
- The watcher disconnects when the popup closes. It is not a permanent page observer.
- The content script retains a small page-lifetime `ReelSessionState` across popup close/reopen.
  It records the last accepted Reel identity/track and visible music signature. A fresh request for
  another Reel rejects that old track until a different track or changed visible music label is
  seen.
- A non-Reel result does not disconnect the watcher; a transient SPA URL cannot kill live updates.
- A duplicate watch port stops the previous observer, so only one MutationObserver/URL poll runs.
- The popup re-requests detection on `tabs.onUpdated` URL changes (300 ms debounce) and has a one
  active-tab URL check per second as an SPA fallback. A URL change immediately clears the old card.
- Async request responses are checked against both the request URL and the active Reel identity.
- Manual refresh re-reads the page.

### 3.5 Audio fingerprinting — evaluated and not implemented

Audio fingerprinting was considered and rejected for this MVP:

- It needs the `tabCapture` API, a user gesture, an offscreen document, and an AudioWorklet.
- Naming an unknown song requires a comprehensive licensed fingerprint database. Chromaprint-style
  algorithms are open, but there is no free, complete, browser-local music database; practical
  recognition services are paid/account-based.
- Uploading Reel audio raises privacy/consent concerns and is out of scope.
- Tune Snap does not capture, upload, or fingerprint audio.

## 4. Evidence scoring (transparent weighted ensemble)

This is an engineering-weighted ensemble, not a trained classifier.

### 4.1 Source reliability weights

| Source | Weight |
| --- | ---: |
| `structured-music` | 0.92 |
| `audio-link` | 0.86 |
| `audio-label` | 0.68 |
| `music-glyph` | 0.64 |
| `title-attribute` | 0.62 |
| `visible-label` | 0.62 |
| `media-session` | 0.40 |

### 4.2 Context and effective score

```
context  = 0..1 from visibility × Reel association
effective = sourceWeight × (0.55 + 0.45 × context)
```

Corroboration adds at most **0.12** for independent source families. Caption consistency adds at most
**0.05**. Title-only evidence is capped at **0.58**; Media Session alone at **0.40**.

### 4.3 Correlation and de-duplication

Evidence is unioned when items share:

- the same element,
- an ancestor/descendant relationship,
- the same non-empty audio/music href, or
- the same structured-record correlation key.

Only each cluster's strongest source counts. Correlated link text + aria-label + parent text cannot
inflate confidence.

### 4.4 Title/artist consistency

Groups use an order-insensitive key from sorted normalized title and artist. `Artist · Song` and
`Song · Artist` corroborate; structured metadata wins the output-order vote. Remix/live/sped-up
versions stay distinct and are never merged with the original.

### 4.5 Selection thresholds

| Confidence | Requirements |
| --- | --- |
| High | score ≥ 0.80, strong source, context ≥ 0.60, margin ≥ 0.10 |
| Medium | score ≥ 0.60, context ≥ 0.45, margin ≥ 0.07 |
| Low | score ≥ 0.48, context ≥ 0.55, margin ≥ 0.05, not a lone weak label/Media Session |

- Two plausible songs with scores ≥ 0.50 and a margin < 0.10 produce **`ambiguous`**, not a guess.
- No sufficient confidence → `no-metadata` or `ambiguous`.
- A strong current “Original audio” label wins over a weaker neighboring song.
- Diagnostics (score, runner-up, margin, sources, clusters, context) are returned to the popup.

## 5. State, stale-result protection, and restricted pages

- Every detection result clears the previous draft, search results, selected YouTube video, and
  in-flight search id.
- Play/Add are disabled while a detection request is in flight.
- The content script and live watcher never cache a track.
- Hidden/offscreen labels receive zero context; shared-feed labels receive reduced context;
  structured records must match the current Reel/audio id.
- A Reel URL change immediately emits an invalidation, clears the old card, and cancels in-flight
  detection state. The old track cannot be re-approved merely because the old label/structured
  record is still in the DOM.
- A content-script session survives popup close/reopen, so the first request on a new Reel does not
  display the previous Reel's still-mounted label.
- Conflicts produce an explicit “Couldn’t confirm the music” state with manual entry.
- No hardcoded song or fallback track exists.

### Unsupported websites

`findAdapter` recognizes Instagram only. For any other host:

- no content script is injected (manifest match is Instagram only);
- the popup does not send `GET_REEL_TRACK`, open a watch port, or otherwise interact with the page;
- it displays exactly **“This extension works only on Instagram Reels.”**;
- capture controls and manual detection UI are hidden, while the Wishlist tab remains usable.

### Instagram pages that are not Reels

The popup checks `adapter.isReel(url)` before requesting detection. On an Instagram profile, feed,
explore, audio page, etc.:

- no detection request or watch port is opened;
- the popup displays **“Open an Instagram Reel to detect its music.”**;
- Wishlist remains usable.

### Instagram Reels

Only Reel URLs proceed to the content-script request and popup-lifetime watcher. Missing metadata
still allows manual entry, YouTube search, Play Now, and Add to wishlist.

## 6. Permissions and manifest

| Permission | Why | Scope |
| --- | --- | --- |
| `storage` | Wishlist, settings, 6-hour search cache | Extension-local |
| `activeTab` | Read the active tab URL after the toolbar click | Only that tab |
| `host_permissions: https://www.instagram.com/*` | Inject the Instagram content script | Instagram only |

There is no `tabs` permission, no history access, no `<all_urls>`, no Google host permission, and no
other social-platform host. The manifest retains a compatibility floor of 110 for the APIs used.

## 7. Test coverage

The suite currently contains **22 files / 212 tests**:

- Instagram adapter, URL canonicalization, audio-page/non-Reel rejection.
- Instagram-only registry: arbitrary hosts return `unsupported` without page reading.
- Popup messages: exact unsupported-site and non-Reel copy; no capture controls in blocked states.
- Structured `music_asset_info` current/other/unmatched/malformed records.
- Correlated link+aria de-duplication; strong-vs-weak conflicts; remix conflicts.
- Plain visible labels, data attributes, title-only evidence, original-audio precedence.
- Hidden/offscreen/preloaded/shared-feed/page-level labels; deep nesting.
- Delayed rendering, navigation during wait, popup-lifetime watcher and cleanup.
- Production lifecycle regressions: URL-only SPA change, DOM-before-URL change, old structured
  record under a new URL, same-song new audio link, repeated same-Reel detection, stale async
  response rejection.
- Reel session across popup close/reopen: stale old track suppression, new-track acceptance,
  same-song-new-link acceptance, missing-metadata retention, stable track keys.
- Wishlist storage, dedupe, legacy migration, malformed data, persistence across reloads.
- YouTube client, ranking, cache, settings, messaging, and UI helpers.

## 8. Verification performed

- `tsc --noEmit`, the full Vitest suite, and the production build pass.
- The built content-script bundle was executed against the public logged-out Instagram Reel
  `https://www.instagram.com/reel/DfCiwVEosgE/`:
  - result `NEON · A2O, A2O LITE`, high confidence;
  - evidence `structured-music+audio-link`;
  - score 1.0, 2 clusters, context 1.
- The popup-lifetime watcher emitted a `Flowers · Miley Cyrus` detection after the structured record
  was removed and the visible audio link changed.
- On the same public Reel page, the built content bundle was driven through a simulated Instagram
  SPA transition: `history.pushState` changed the URL to another `/reel/` path while the old DOM
  remained. The watcher emitted only a track-less invalidation for the new URL; it did **not**
  re-approve the old `NEON` label/structured record. After the audio link was changed to Flowers and
  the old structured record removed, it emitted `Flowers · Miley Cyrus` (high, `audio-link`).
  This is a simulated SPA URL/DOM transition on a real public page, not a click-through between two
  authenticated Reels.
- The production content bundle was also exercised **without a watcher port**, simulating a popup
  that was closed during navigation: first request returned NEON; after `pushState` to another
  `/reel/`, the next request returned `no-metadata` despite the old label/structured record still
  being mounted; after the label changed, the next request returned Flowers. This validates the
  page-lifetime content-script session used on popup reopen.
- The production popup build was rendered with a mocked active tab on `https://example.com` and on
  an Instagram non-Reel URL. It showed the exact unsupported-site and non-Reel messages, hid the
  capture form/actions, and made no content-script request or port attempt (the mock throws on
  either).
- No authenticated Instagram session was tested. The public logged-out Reel shell is the only
  real-world verification claimed.

## 9. Remaining limitations

- Authenticated Instagram layouts are unverified. Detection remains best-effort with manual editing
  as the guaranteed fallback.
- Embedded JSON key names are unofficial page-data shapes and can change; malformed data falls back
  to DOM/accessibility evidence.
- Labels inside a shadow root or separate document root that cannot be related to the active Reel can
  still produce “Music not detected.”
- A single-artist artist-first label without punctuation is order-ambiguous; use Swap.
- Audio fingerprinting is not included for the reasons above.
- If a new Reel uses the exact same song and only a preloaded plain-text label with no changed
  visible audio link, the stale guard may show “Music not detected” until the label changes. This is
  deliberately safer than showing the previous Reel's song.
- Actual click-through navigation between multiple authenticated Instagram Reels has not been
  verified here; the SPA lifecycle was tested with unit regressions and a simulated URL/DOM change
  on a public page.
- Only desktop `www.instagram.com` is supported; mobile web and app deep links are not.

## 10. Reloading the production build and testing multiple Reels

1. Run `pnpm check` (typecheck + tests + production build), or at minimum `pnpm build`.
2. Open the browser's extension management page, enable **Developer mode**, and press **Reload** on
   Tune Snap. The exact page label/address varies by browser; select
   `.output/tune-snap-mv3` when loading it for the first time.
3. Reload any Instagram tab that was already open, so the new content script is loaded (the watcher
   starts when the popup connects).
4. Open Reel A and click Tune Snap. Note the detected title/artist.
5. Close the popup, navigate to Reel B using Instagram's own Next/scroll control, then reopen the
   popup. It must show Reel B's song, not Reel A's. Browser extension popups close when you click
   the page, so this close/reopen flow is the normal multi-Reel check.
6. If you are using an environment where the popup can stay open (for example the popup page in a
   detached window), navigate to B and confirm the old card clears, then B appears. The watcher
   handles this case.
7. Navigate back to A and to a third Reel with close/reopen; repeat. Also try a Reel with no music
   label and confirm the clear “Music not detected” state, not the previous song.
8. Open the Wishlist tab and confirm saved items still load after navigation.

Do not treat a single public logged-out Reel as proof that every authenticated Reel works. The
production lifecycle fix is covered by the regression tests and the simulated SPA probe above; the
manual click-through is the remaining real-world check.

## 11. Debugging

- The **Detected** tag tooltip shows source names, score, and independent-signal count.
- `ReelDetection.diagnostics` is included in the content-script response.
- On unsupported sites or non-Reel Instagram pages, no detection request is made; this is expected.
- If detection fails on a Reel, reload the tab once and press refresh.
- For platform changes, add fixtures/tests before changing selectors; never add a song-specific
  fallback.

## 12. Related files

- [README.md](README.md) — setup, API key, permissions, usage.
- `lib/adapters/instagram.ts` — Instagram extraction and URL rules.
- `lib/adapters/index.ts` — Instagram-only adapter registry and detection requests.
- `lib/detection/` — evidence sources, structured parsing, engine, popup-lifetime watcher.
- `lib/adapters/layout.ts` — visibility and Reel-context grading.

