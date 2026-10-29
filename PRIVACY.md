# Privacy Policy for Tune Snap

**Effective date:** October 30, 2026  
**Last updated:** October 30, 2026

Tune Snap is a Chromium-based browser extension built with Manifest V3. It detects the music in the
current Instagram Reel, searches YouTube for the song, and keeps a local wishlist. This policy
explains what the extension handles and what it does not do. In this policy, “we”, “us”, and “the
publisher” refer to the developer of Tune Snap.

## 1. Summary

- Tune Snap reads Instagram Reel metadata in your browser to identify the song.
- The publisher does not operate a backend and does not receive your Instagram page content,
  browsing activity, wishlist, or API key.
- When you press **Play on YouTube**, the song title and artist are sent directly from your browser
  to YouTube/Google. If an API key is configured, it is sent with that request.
- Your wishlist and settings stay in your browser's extension storage.
- Tune Snap does not capture, record, upload, or fingerprint audio.
- Tune Snap does not use analytics, tracking, advertising, or telemetry.
- Tune Snap does not sell or transfer data for advertising, creditworthiness, lending, or any
  unrelated purpose.

## 2. Data handled

### Instagram page content

Tune Snap's content script runs only on `https://www.instagram.com/*`. On an Instagram Reel page,
it reads the page locally to identify the current track. This can include:

- visible music labels and audio links;
- accessibility text such as `aria-label` and `title`;
- structured music data embedded in the page's own JSON;
- short visible labels and music-note text;
- Media Session metadata exposed by the page;
- the active video and page layout context.

This content is processed inside your browser. It is not sent to the publisher. Tune Snap does not
call Instagram private APIs, does not bypass authentication, and does not scrape pages in the
background on other websites.

### Active tab check

When you click the Tune Snap toolbar icon, the extension reads the active tab's URL to decide whether
the page is an Instagram Reel. This check is local. The URL is not sent to the publisher and is not
stored as browsing history.

If you save a song, the Reel URL shown on the card can be stored with that wishlist item so you can
return to the source later.

### YouTube search requests

When you choose **Play on YouTube** or ask Tune Snap to find a song, the extension uses the detected
title and artist (or values you edited) to build a search query.

- **With a YouTube Data API key**, Tune Snap sends a request directly to the YouTube Data API at
  `googleapis.com/youtube/v3/search`. That request includes the search query (`q`), the API key, and
  standard YouTube API parameters such as `part`, `type`, `maxResults`, and `fields`. It does not
  include the Reel URL, your identity, your wishlist, or other page content.
- **Without an API key**, Tune Snap opens a YouTube search results page in a new tab. The song title
  and artist appear in the YouTube search URL (`search_query`), and YouTube receives that request
  directly from your browser.

YouTube/Google also receives normal web-request information such as your IP address and browser
headers. If the popup displays YouTube thumbnails, those images are loaded from YouTube's thumbnail
servers (typically `i.ytimg.com`).

### YouTube API key

A YouTube Data API key can come from either of these places:

1. a key you enter and save in Tune Snap Settings; or
2. a key embedded into the extension at build time by the publisher.

A key entered in Settings is stored locally in extension storage and takes precedence over a
build-time key. A build-time key is part of the extension package and can be inspected by anyone who
has the extension; it is not a secret.

The API key is sent only to YouTube/Google as part of the YouTube API request described above. It is
not sent to the publisher.

### Data stored on your device

Tune Snap uses browser extension storage only. It does not use a remote account or cloud sync.

| Stored data | Storage | Purpose and retention |
| --- | --- | --- |
| Wishlist items: title, artist, source, Reel URL, whether metadata was detected or edited, timestamps, and the saved YouTube video details if you chose one | Extension local storage | Kept until you delete the item or remove the extension |
| Settings: the YouTube API key you entered | Extension local storage | Kept until you clear it in Settings or remove the extension |
| Search cache: a normalized title/artist key and YouTube result data (video IDs, titles, channel names, thumbnail URLs, publish dates) | Extension session storage | Expires after 6 hours; at most 25 entries; cleared when the browser session ends |

Detection results and temporary page state are held in memory while the popup is open and are not
persisted as a separate track history. The wishlist and settings are stored under extension-local
keys; they are not uploaded anywhere by Tune Snap.

### Add-ons data-usage declaration

For the browser add-ons data-usage form, Tune Snap declares **Website content** only. This refers to
the Instagram page content that the extension reads locally to identify the current Reel's music. The
publisher does not receive that content. Tune Snap does not collect account information, browsing
history, location, health information, financial information, personal communications, or similar
data for the publisher.

The YouTube API key is a configuration credential used only for your own YouTube request. It is not
sent to the publisher and is not used to identify you to the publisher.

## 3. Permissions

| Permission | Why Tune Snap needs it |
| --- | --- |
| `storage` | Saves your wishlist and settings in extension local storage, and the short-lived YouTube search cache in session storage. |
| `activeTab` | Lets the popup read the active tab's URL after you click the toolbar icon, so it can tell whether the current page is an Instagram Reel. It does not grant ongoing access to other tabs or browsing history. |
| `https://www.instagram.com/*` | Injects the content script that reads the current Instagram Reel page locally. This is the only website host Tune Snap can access. |

Tune Snap does not request the `tabs` permission, does not request `<all_urls>`, and does not request
access to Google or YouTube host pages. YouTube API requests rely on Google's CORS behavior rather
than a host permission.

## 4. What Tune Snap does not do

- It does **not** capture, record, upload, or fingerprint audio.
- It does **not** use analytics, tracking pixels, advertising identifiers, or telemetry.
- It does **not** operate a backend or send page content to the publisher.
- It does **not** sell, rent, or transfer data to data brokers or advertisers.
- It does **not** use data for creditworthiness, lending, insurance, employment, or similar
  eligibility decisions.
- It does **not** use data for any purpose unrelated to detecting a Reel's music, searching YouTube,
  and maintaining your local wishlist.
- It does **not** require an account, login, or cloud sync.
- It does **not** access private or restricted Instagram pages by bypassing authentication.

## 5. Third-party service

YouTube and Google process the search requests described above. Their handling of data is governed
by their own policies:

- Google Privacy Policy: https://policies.google.com/privacy

Tune Snap is an independent project. It is **not affiliated with, endorsed by, or sponsored by
Instagram, Meta, YouTube, or Google**. Instagram and YouTube may also collect data under their own
policies when you use their services; this policy covers Tune Snap only.

## 6. Data retention and user control

- **Wishlist:** delete individual items from the Wishlist tab. Removing the extension removes the
  extension's local storage, subject to the browser's own behavior.
- **Settings and API key:** clear a saved key with the **Clear saved key** control in Tune Snap
  Settings. Removing the extension also removes the saved setting.
- **Search cache:** expires after 6 hours, is limited to 25 entries, and is cleared when the browser
  session ends. It can also be removed by removing the extension.
- **In-memory detection data:** discarded when the popup closes or the page is reloaded.
- **No server-side data:** the publisher has no account system, backend, or database from which data
  could be deleted.

## 7. Children's privacy

Tune Snap is not directed to children under 13 (or the minimum age required in your country). It has
no accounts and does not knowingly collect personal information from children for the publisher. If
you believe a child has provided information to the publisher, contact us using the address below.

## 8. Changes to this policy

We may update this policy if Tune Snap's behavior changes. The revised policy will show a new
“Last updated” date. Material changes should also be reflected in the project repository or the
store listing. We encourage you to review the updated policy.

## 9. Contact

Questions about this policy can be sent to:

**[saleh.rafi.01@gmail.com]**
