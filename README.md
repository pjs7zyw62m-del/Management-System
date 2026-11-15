# BLACKCELL Corporation — Architecture 2.0

**Development branch only. Do not publish the source folders directly.**

The source is organized by responsibility. A compatibility build restores existing website paths.

```sh
node architecture/test.mjs
node architecture/build.mjs
```

Use Node 20+. The default build copies the original 243 paths into a fresh `dist/` directory and checks the output. To test stylesheet consolidation, run `node architecture/build.mjs --bundle-css` with a fresh output directory. Original stylesheets remain available. Do not merge or deploy until browser and hosting checks pass. See `docs/ARCHITECTURE-2.md`.
