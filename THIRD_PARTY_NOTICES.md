# Third-party notices

SOCOM Legacy is built on the work below. The project's own code is GPL-3.0 (`LICENSE`). Every licence
text named in the **Licence** column is under `LICENSES/<id>.txt` (the SPDX id, verbatim); the copyright holders
are given here. The project's artwork (`shared/brand/`) is its own and is not covered by the code's licence.

SOCOM, SOCOM II: U.S. Navy SEALs, PlayStation and PS2 are trademarks of Sony Interactive Entertainment. Zipper
Interactive made the game. This project is not affiliated with or endorsed by either. **No game code or game
data is in this repository**; the player supplies their own disc. The screenshots under `socomlegacy/docs/media/`
show this port running.

## The web port (`socomlegacy/`, `shared/`; the landing workspace retired by OT.R30; npm, pinned by `package-lock.json`)

The runtime `dependencies` of the web packages that are not the workspace's own; the desktop release carries none of
them. The SOCOM Legacy site's fonts and their OFL texts ship from `shared/fonts/` with the build
(`packages/viewer/test/build_fonts.test.ts`).

| Component | Where | Version | Licence | Copyright | Ships |
|---|---|---|---|---|---|
| three (three.js) | `socomlegacy/packages/viewer/package.json` | 0.186.0 | MIT | 2010-2026 three.js authors | yes (bundled into the SOCOM Legacy viewer, `dist/viewer/`) |
| hash-wasm | `socomlegacy/tools/package.json` | 4.12.0 | MIT | 2020 Dani Biró; its BLAKE2b from the BLAKE2 reference code, 2012 Samuel Neves (CC0-1.0, OpenSSL or Apache-2.0 at the user's option); its Argon2 written after Go's x/crypto argon2 (BSD-3-Clause, the Go Authors) | no (a developer tool's hashing, `tools/pcsx2Names.ts`) |
| DUALSHOCK 4 line art (the button mapping screen's drawing, `socomlegacy/packages/viewer/src/console/render/padArt.ts`; LATER 380, H313) | `socomlegacy/packages/viewer/src/assets/sony/` (`dualshock4.svg`, `NOTICE.txt`; from the teaser) | DUALSHOCK4_LineArt.zip, retrieved 2026-10-03 | Sony's developer line-art usage terms (not GPL; not relicensed) | Sony Interactive Entertainment Inc. | yes (bundled into the viewer; its notice ships as `licenses/sony-controller.txt`) |
| ws | `socomlegacy/packages/match/package.json`, `socomlegacy/packages/forge-agent/package.json` | 8.22.0 | MIT | 2011 Einar Otto Stangvik; 2013 Arnout Kazemier and contributors; 2016 Luigi Pinca and contributors | yes (the Forge agent gateway's transport) |
| @modelcontextprotocol/sdk | `socomlegacy/packages/forge-agent/package.json`; [upstream licence](https://github.com/modelcontextprotocol/typescript-sdk/blob/1.32.2/LICENSE) | 1.32.2 | MIT | 2024 Anthropic, PBC | yes (the Forge agent gateway's MCP and OAuth implementation) |
| express | `socomlegacy/packages/forge-agent/package.json`; [upstream licence](https://github.com/expressjs/express/blob/v5.3.0/LICENSE) | 5.3.0 | MIT | 2009-2014 TJ Holowaychuk; 2013-2014 Roman Shtylman; 2014-2015 Douglas Christopher Wilson | yes (the Forge agent gateway's HTTP service) |
| tsx | `socomlegacy/packages/forge-agent/package.json`; [upstream licence](https://github.com/privatenumber/tsx/blob/v4.23.15/LICENSE) | 4.23.15 | MIT | Hiroki Osame | yes (the Forge agent gateway's TypeScript launcher; server only) |
| werift | `socomlegacy/packages/forge-agent/package.json`; [upstream licence](https://github.com/shinyoshiaki/werift-webrtc/blob/v0.25.2/LICENSE) | 0.25.2 | MIT | 2020 shinyoshiaki | yes (the Forge agent gateway's WebRTC implementation; server only) |
| zod | `socomlegacy/packages/forge-agent/package.json`, `shared/modding-wiki/package.json`; [upstream licence](https://github.com/colinhacks/zod/blob/v4.6.7/LICENSE) | 4.6.7 | MIT | 2025 Colin McDonnell | yes (the Forge agent gateway's tool schema validation; the modding wiki's page frontmatter schema, at build) |
| next (Next.js) | `shared/modding-wiki/package.json` | 16.4.2 | MIT | 2025 Vercel, Inc. | yes (bundled into the modding wiki's static site, `shared/modding-wiki/out/`) |
| react, react-dom | `shared/modding-wiki/package.json` | 19.3.1 | MIT | Meta Platforms, Inc. and affiliates | yes (bundled into the modding wiki's static site, `shared/modding-wiki/out/`) |
| fumadocs-core, fumadocs-ui | `shared/modding-wiki/package.json` | 16.17.7 | MIT | 2023 Fuma | yes (bundled into the modding wiki's static site, `shared/modding-wiki/out/`: the docs layout, sidebar and search) |
| fumadocs-mdx | `shared/modding-wiki/package.json` | 15.4.9 | MIT | 2023 Fuma | yes (compiles the wiki's MDX pages at build; its loader in the modding wiki's static site, `shared/modding-wiki/out/`) |
| tailwindcss, @tailwindcss/postcss | `shared/modding-wiki/package.json` (`devDependencies`) | 4.3.3 | MIT | Tailwind Labs, Inc. | yes (the stylesheet it generates is in the modding wiki's static site, `shared/modding-wiki/out/`) |
| postcss | `shared/modding-wiki/package.json` (`devDependencies`) | 8.5.31 | MIT | 2013 Andrey Sitnik | no (the wiki's build tool) |
| typescript | `shared/modding-wiki/package.json` (`devDependencies`) | 5.9.3 | Apache-2.0 | Microsoft Corporation | no (the wiki's build tool) |

## References this project was modelled on (no code copied)

- **OpenGOAL** (open-goal/jak-project, ISC): its 989snd re-implementation is the public-API reference the mixer's
  bank-sound player and grain sequencer are written against (`ps2xRuntime/src/lib/snd989*.cpp` say where).
- **Ziemas/989snd**: the decompiled IOP driver, the reference the audio model was audited against (research note 36).
- **PSRewired**: the community's server documentation and Medius app-id list (research note 02). Nothing here implies
  their endorsement.
- **PCSX2**: the console reference every parity measurement compares against; not part of the build or the download.

## The movie decoder (WebAssembly)

| Component | Where | Version | Licence | Copyright | Ships |
|---|---|---|---|---|---|
| libmpeg2 (mpeg2dec) | `socomlegacy/packages/fmv/wasm/` (`build.sh`, `glue.c`; the built `out/libmpeg2.wasm` and its source `out/mpeg2dec_0.5.1.orig.tar.gz`) | 0.5.1 | GPL-2.0-or-later | Aaron Holtzman, Michel Lespinasse and the libmpeg2 authors | yes (the page's movie decoder; its source beside it) |
