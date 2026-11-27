# Contributing -- the client's folder

This folder is the client's source. **How to contribute is the repository's root
[`CONTRIBUTING.md`](../CONTRIBUTING.md)**: where to send a change, the parity rule, the quick checks while you work,
what review checks, and how a pull request lands. Start there, and with the root [`README.md`](../README.md)'s
Quickstart.

What to know in this folder:

- Install once from the repository's root (`npm ci`); the workspace's `package.json` is there.
- The packages are under `packages/`, the tools and their tests under `tools/`, the documents under `docs/`.
- Run commands for one package from this folder: `npx vitest run --project @s2u/<package>`,
  `npx tsc --noEmit -p packages/<package>`.
- The research notes (`docs/research/`) say what is known of the original, at which confidence, and what would
  settle each open value. Some of them name plans, rulings and files of the project's private working repository;
  those are not here, and nothing in a note is an instruction to run.
- Tests that need the game's disc read `SOCOM_DISC` and `SOCOM_ISO` and skip without them. No disc file, map or
  capture is in this repository, and none belongs in a pull request.
