# Yishay Raziel — Portfolio

Astro static site with Decap CMS for self-managed content.

## Local dev

```bash
npm install
npm run dev
```

Visit `http://localhost:4321`.

## How to add a new work (the easy way)

Once deployed, go to `https://yraziel.com/admin`. Log in with GitHub. Click **New Works**, fill in:

- **Title** — e.g. "Summer Anthem"
- **Client** — e.g. "Coca-Cola"
- **Date** — the release date
- **YouTube URL** — full URL, e.g. `https://www.youtube.com/watch?v=XXXX`
- **Tags** — pick or create (TV, Radio, Digital, Film, Branding…)
- **Custom thumbnail** — optional; defaults to YouTube's thumbnail
- **Notes** — optional

Hit **Publish**. Site rebuilds automatically in ~1 minute.

## How to add a new work (manually)

Create a file in `src/content/works/my-work.md`:

```md
---
title: "My Work"
client: "Client Name"
date: 2025-04-17
youtube: "https://www.youtube.com/watch?v=XXXX"
tags: ["TV", "Digital"]
---
```

## Deploy

1. Push this repo to GitHub.
2. In `public/admin/config.yml`, replace `YOUR_GH_USERNAME/yraziel-portfolio` with your actual GitHub `owner/repo`.
3. Connect the repo to **Netlify** (recommended — free, auto-deploys on push).
4. In Netlify, enable **Identity** and **Git Gateway** so the `/admin` login works. (Or use the GitHub OAuth backend as configured.)
5. Point `yraziel.com` DNS to Netlify.

## Filter & sort

The homepage supports:
- **Filter** by tag (click tag chips in the top bar).
- **Sort** by newest, oldest, title A–Z, or client A–Z.

Tags are free-form — add any new ones in the CMS dropdown and they'll appear as filter chips automatically.
