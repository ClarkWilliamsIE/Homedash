
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
