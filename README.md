# Comrades Cinema

A responsive Netflix-inspired movie discovery website for Comrades Cyber, powered by the FRAMEX API.

## Included
- Trending and popular movies, popular series
- Search with a short debounce
- Genre chips and category navigation
- Movie detail lookup by slug
- Playback-link lookup and download-link option
- Responsive dark interface with Comrades Cyber green branding
- Vercel serverless API proxy so the FRAMEX key is not exposed to browser JavaScript
- Short shared caching for list endpoints and graceful error/empty states

## 1. Requirements
- Node.js 20 or newer
- A FRAMEX API key if the API requires one
- A Vercel account for deployment

## 2. Run locally
```bash
npm install
cp .env.example .env
```
Edit `.env` and set `FRAMEX_API_KEY=your_real_key`. Then:
```bash
npm run dev
```
Note: Vite does not run the Vercel serverless function locally by itself. To test the `/api/framex` proxy locally, use the Vercel CLI:
```bash
npm install -g vercel
vercel dev
```
Run `vercel dev` instead of `npm run dev` when testing API integration locally.

## 3. Deploy to Vercel
1. Extract the ZIP and upload the project to a new GitHub repository.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
4. In **Project Settings → Environment Variables**, add `FRAMEX_API_KEY` with your API key. Do not use a `VITE_` prefix.
5. Redeploy after adding the variable.

The `api/framex.js` function forwards only approved FRAMEX endpoints and attaches `X-API-Key` on the server.

## API integration notes
The app uses the supplied endpoints:
- `/api/v1/movies/trending?page=1`
- `/api/v1/movies/popular`
- `/api/v1/series/popular`
- `/api/v1/search?q=...&page=1`
- `/api/v1/movies/{slug}`
- `/api/v1/categories`
- `/api/v1/genres`
- `/api/play-links?subjectId=...`
- `/api/download-links?subjectId=...`

The app accepts several common response wrappers (`results`, `items`, `data`, `movies`, etc.) and common poster/title property names. API responses may use different field names. If your FRAMEX Playground response differs, update the normalizers in `src/api.js` and the play-link extraction in `src/App.jsx`.

## Playback and trailers
The Play button asks FRAMEX for play links and opens the returned link. It does not assume every response is a browser-playable trailer. Some providers return a manifest, a redirect, or a link requiring a compatible player. Use content only when you have the rights and authorization to access or stream it.

## Security
- Keep the API key only in Vercel environment variables.
- Do not commit `.env`.
- The proxy restricts endpoint paths, but for a public production site consider adding rate limiting and tighter origin/abuse controls.
- FRAMEX rate limits and terms apply.

## Project structure
```text
comrades-cinema/
├── api/framex.js
├── src/
│   ├── api.js
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
├── index.html
├── package.json
├── vercel.json
└── README.md
```

## subjectId troubleshooting
The website now checks `subjectId`, `subject_id`, and `subjectID` in common nested response wrappers. If playback still reports a missing ID, open the FRAMEX Playground and inspect the **actual** `/api/v1/movies/{slug}` response for that title. Some series or unavailable titles may not expose a playable subject ID. Never assume a slug or generic `id` equals `subjectId`.


## FRAMEX stream response handling
Playback supports responses shaped like `{ "streams": [{ "quality": "480p", "resolutions": "480", "proxyUrl": "...", "downloadUrl": "..." }], "playConfig": { "maxResolution": 480 } }`. It selects the highest available resolution at or below `playConfig.maxResolution` and opens `proxyUrl`. It also attempts a fresh detail lookup if the selected title did not include a subjectId.
