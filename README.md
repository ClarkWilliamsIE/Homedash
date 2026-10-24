
# 🏠 Family Harmony Dashboard - Deployment Guide

This dashboard is a Single Page Application (SPA) designed to be hosted on **GitHub Pages**. It uses Google Sheets as a database, Google Calendar for events, Google Drive for recipe photos, and Gemini AI for recipe scraping.

## 🚀 Quick Setup Instructions

### 1. Google Cloud Project Setup
1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a new project named "Family Dashboard".
3.  **Enable APIs**: Navigate to "APIs & Services > Library" and enable:
    *   `Google Sheets API`
    *   `Google Calendar API`
    *   `Google Drive API`
4.  **Configure OAuth Consent Screen**:
    *   Go to "APIs & Services > OAuth consent screen".
    *   Choose "External" (unless you have a Google Workspace).
    *   Add your email and the scope: `.../auth/drive.file`, `.../auth/spreadsheets`, and `.../auth/calendar`.
5.  **Create Credentials**:
    *   Go to "APIs & Services > Credentials".
    *   Click "Create Credentials > OAuth client ID".
    *   Select "Web application".
    *   **Authorized JavaScript Origins**: 
        *   `http://localhost:3000` (for local testing)
        *   `https://[YOUR_GITHUB_USERNAME].github.io` (for production)
    *   Copy your **Client ID**.

### 2. Prepare the Google Sheet
1.  Create a new Google Sheet.
2.  Rename the first tab to `Recipes`.
3.  Add the following headers in row 1:
    `Name`, `Ingredients`, `ImageURL`, `Tags`, `Instructions`, `ID`
4.  Create a second tab named `ShoppingList`.
5.  Add headers: `Date`, `Category`, `Item`.
6.  Copy the **Spreadsheet ID** from the URL: `https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit`.

### 3. Update the Code
1.  Open `constants.tsx`.
2.  Replace `'YOUR_GOOGLE_CLIENT_ID...'` with your actual Client ID.
3.  Replace `'YOUR_GOOGLE_SHEET_ID'` with your Spreadsheet ID.

### 4. Deploy to GitHub Pages
1.  Push your code to a GitHub repository.
2.  Go to the repository **Settings > Pages**.
3.  Select the branch (usually `main`) and folder (`/root` or `/docs`).
4.  Once live, ensure your "Authorized JavaScript Origins" in Google Cloud matches your new `github.io` URL.

## 🛠 Features Included
*   **AI Recipe Scraper**: Uses Gemini to turn any food blog URL into a formatted recipe.
*   **Cook Mode**: Full-screen layout with checkboxes for ingredients.
*   **Photo Sync**: Recipe photos are uploaded to your Google Drive and linked in the Sheet.
*   **Smart Shopping**: Combines recipe ingredients with manual items (like milk/bread).
*   **Bin Notifier**: Automated alternating cycle for Rubbish vs Recycling/Glass.

## 🏠 Kitchen iPad: Homedash inside Home Assistant

The same app also runs **inside Home Assistant**, where it adds a Home screen (tonight's dinner, music moods, room lights), plus Lights and Music tabs. Everything else (planner, recipes, shopping list) is identical and saves to the same Google Sheet, so phones and the iPad stay in sync.

**How it works**
* `npm run build` builds the normal site *and* `dist/ha/homedash-panel.js` (via `scripts/build-ha.mjs`).
* Home Assistant loads that file from `https://<your-vercel-site>/ha/homedash-panel.js` as a dashboard resource, and shows it with a card of type `custom:homedash-panel` in a *panel* view.
* Inside Home Assistant the app uses your Home Assistant login for lights and music. The PIN login and recipe import still go to this site's `/api`, which allows calls from your home network (see the `applyCors` helper at the top of each API file; add other origins with an `ALLOWED_ORIGINS` env var).
* Entity names (light groups, speakers, music scripts) are in `home.config.ts`.

**Sync between devices**
* Changes are merged rather than overwritten: each device re-reads `SyncData` before saving and merges its edits with anything changed elsewhere (`lib/merge.ts`).
* Open screens pull changes every 30 seconds and whenever the app comes back to the front.
* Recipes are saved by re-reading the sheet first and applying just the one change.

**Recipe import**
* `api/importRecipe.ts` reads the recipe's structured data from the page (most recipe sites have it) and only falls back to Gemini if needed. The Gemini key is read from the `GEMINI_API_KEY` environment variable on Vercel and is no longer built into the website.

**Settings screen (inside Home Assistant)**
* Music moods: edit speakers, volumes and what plays, add or delete moods. Saving a mood rewrites its Home Assistant script (`script.profile_*`), which needs a Home Assistant **admin** login on that device.
* Lights on the home screen: rename, reorder, add or remove rooms (pick any light or light group).
* Start cooking: which mood plays, which lights, brightness and colour.
* Settings are stored in the Google Sheet (`SyncData`) alongside the meal plan, so every device shares them. Defaults live in `lib/settings.ts`.

**Kitchen extras**
* *Dinner's ready* (Home screen, next to tonight's dinner): announces a message on every speaker through Music Assistant and flashes chosen lights. Message, volume and lights are in Settings.
* *Timers*: times in a recipe's method ("simmer 20 minutes") are tap-to-start; the Timer button (bottom-right) has quick timers. Finished timers chime on screen and can be announced on a speaker (Settings → Timers). Timers live on the device that started them.
* *Family calendar*: today's and tomorrow's events from Google Calendar show on the Home screen (and in Today's Agenda on the website). Pick calendars in Settings. Uses the same Google login as the Sheet, so that login needs calendar permission.
* *Night mode*: between the set times, after a few idle minutes, the kitchen screen shows a dim clock. Any touch wakes it.
* *Full screen*: Settings → This device hides Home Assistant's top bar and side menu on that device only (remembered in that browser).

**Browse music** (Music screen): search Spotify and your Music Assistant library (playlists, recently played, albums, artists, radio) and play on any speaker or the kitchen & family room group, or add to the queue. Uses Music Assistant's `search` / `get_library` services, so it works on non-admin logins too.

## Alexa: add to the shopping list by voice

"Alexa, ask Homedash to add milk and bread" (or "Alexa, ask Homedash what's on the list") works on any
Alexa speaker on your Amazon account, including the Sonos. It's a private skill that only your account can use.

1. Sign in at developer.amazon.com/alexa/console/ask with the Amazon account your Alexa uses.
2. Create skill → name "Homedash", locale English (NZ) (also add English (AU/US) if your speakers use them),
   model "Custom", hosting "Provision your own", template "Start from scratch".
3. Build → JSON Editor: paste `alexa/interaction-model.json`, Save, Build skill.
4. Build → Endpoint: HTTPS, default region `https://<your-vercel-site>/api/alexa`, certificate
   "My development endpoint is a sub-domain of a domain that has a wildcard certificate". Save.
5. Copy the Skill ID (amzn1.ask.skill.…) and add it in Vercel as the environment variable `ALEXA_SKILL_ID`, then redeploy.
6. Test tab → set "Skill testing is enabled in" to Development. It now works on your speakers.

## Siri: "Hey Siri, add to Homedash"

`api/addItem` adds to the shopping list (POST JSON `{ "pin": "<family PIN>", "text": "milk and bread" }`).
On each iPhone, make a Shortcut called "Add to Homedash": Dictate Text → Get Contents of URL
(`https://<your-vercel-site>/api/addItem`, Method POST, Request Body JSON: `pin` = your PIN, `text` = Dictated Text)
→ Get Dictionary Value `message` → Speak Text.
