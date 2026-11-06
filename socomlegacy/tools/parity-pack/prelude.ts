/**
 * The parity pack bundle's first module (PK-5). Product track (OT.R53): packaging, an adaptation.
 *
 * Inside one esbuild bundle every module's `import.meta.url` is the bundle's own, and the bundle is `process.argv[1]`, so
 * `tools/eph/run.ts`'s start check (`import.meta.url === argv[1]`) would run its CLI's `main()` the moment the bundle
 * loads -- beside the GUI, with the GUI's arguments. run.ts's check also requires this global unset; `./harness.ts`
 * imports this file before anything from `../eph/`, and ES modules evaluate in import order, so it is set first.
 */
(globalThis as { __ephEmbedded?: boolean }).__ephEmbedded = true;

export {};
