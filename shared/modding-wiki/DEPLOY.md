# Deploying the modding wiki

The wiki is a static export (`out/`) served by a Cloudflare Pages project on the owner's account (the modding wiki
plan, MW-11; HUMAN_TASKS H410: the hostname `modding.socomlegacy.com`, the controller drives Cloudflare). A
product-track adaptation (OT.R53): the deploy changes nothing the game does. The Cloudflare account and its login are
the owner's, in wrangler's own login on his host (or `CLOUDFLARE_API_TOKEN` in his environment), never in the
repository.

| what | value |
|---|---|
| Pages project | `socom2legacy-modding` (production branch `main`) |
| its own address | `https://socom2legacy-modding.pages.dev/` |
| the hostname | `modding.socomlegacy.com` (a custom domain of the project) |

## Build

From this folder, on the commit to publish (a clean tree):

```bash
npm ci
npm run check     # the build into out/, then check-out (links, sitemap, flat prefetch files) and check-search
```

Publish only on `check-out: OK` and `check-search: OK`. `out/` is about 130 files, 5 MB, inside Pages' limits.

## Deploy

Run wrangler from any folder outside the repository (it writes a `.wrangler/` folder where it runs) and give it the
export's path:

```bash
npx wrangler@4 whoami      # must name the owner's account; never log in as anyone else
npx wrangler@4 pages deploy <clone>/shared/modding-wiki/out --project-name socom2legacy-modding \
  --branch main --commit-hash <sha> --commit-message "modding wiki at <sha>" --commit-dirty=false
```

`--branch main` publishes to production (the project's own address and its custom domain); any other branch name
makes a preview address only.

The project was made once, on 2026-11-07, with
`npx wrangler@4 pages project create socom2legacy-modding --production-branch main --force`. Wrangler 4.158 hands
`pages` commands for a project that does not exist yet to Cloudflare Workers, and that handoff failed on a static
folder; `--force` made the project on Pages itself, like the account's other sites. A project that exists needs no
`--force`.

## Check after a deploy

Every one answers 200 (a first deployment's edge can answer 522/523 for a minute; run it again):

```bash
B=https://socom2legacy-modding.pages.dev
curl -s -o /dev/null -w '%{http_code}\n' "$B/"
curl -s -o /dev/null -w '%{http_code}\n' "$B/guides/test-locally/"
curl -s -o /dev/null -w '%{http_code}\n' "$B/anatomy/__next.\$oc\$slug.__PAGE__.txt"   # a flat prefetch file
curl -s -o /dev/null -w '%{http_code}\n' "$B/api/search"
```

and every file of `out/` by its path:

```bash
cd out && find . -type f -printf '%P\n' | while read -r p; do
  c=$(curl -s -o /dev/null -w '%{http_code}' "$B/$p"); [ "$c" = 200 ] || [ "$c" = 308 ] || echo "$c /$p"
done
```

(an `.html` path answers 308 to its clean address; nothing else is printed when the deploy is whole).

## The hostname (once)

In the Cloudflare dashboard: Workers & Pages -> `socom2legacy-modding` -> Custom domains -> Set up a custom domain ->
`modding.socomlegacy.com` -> Continue -> Activate domain. `socomlegacy.com`'s DNS is on Cloudflare (its nameservers
are Cloudflare's, and `www.socomlegacy.com` is already a custom domain of the account's countdown project), so
Cloudflare writes the DNS record itself: a proxied `CNAME` `modding` -> `socom2legacy-modding.pages.dev`. The domain
reads Active once its certificate is issued (minutes); then the checks above pass with
`B=https://modding.socomlegacy.com`.
