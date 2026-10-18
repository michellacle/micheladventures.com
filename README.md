# Michel Adventures

Personal adventure log for climbing trips and outdoor adventures (micheladventures.com).

Static HTML site hosted on GitHub Pages. Each trip gets its own page under `trips/` with a photo gallery and video grid; media for each trip lives in `trips/<trip-slug>/media/` (small files in the repo, large files on the shared CDN at `static.thinksmart.life/micheladventures/`).

## Structure

- `index.html` — homepage: hero + trip list
- `trips/cherokee-rock-village.html` — first trip: 2026, Sand Rock AL
- `assets/css/site.css` — shared design system
- `assets/js/site.js` — shared JS (mobile menu)

## Adding a new trip

1. Copy the structure of an existing `trips/<slug>.html`.
2. Add a trip card on the homepage above the `TRIP CARD` marker (newest first).
3. Create `trips/<slug>/media/` for that trip's files.
4. Add the trip URL to `sitemap.xml`.

## Adding media to a trip

- Small images: put in `trips/<slug>/media/`, reference `/trips/<slug>/media/<file>`.
- Videos / large files (>~50 MB): upload to `s3://static-thinksmart-life/micheladventures/` and reference `https://static.thinksmart.life/micheladventures/...`.

## Local development

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080

## Deployment

Push to `main` → GitHub Pages auto-deploys to https://micheladventures.com
