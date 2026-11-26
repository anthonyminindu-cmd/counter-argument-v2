# V2 maintenance build

This directory makes small, reviewed fixes reproducible from the exact current V2 published runtime. The original editable React/TypeScript project is not present in this repository. `runtime-baseline.js` is recovered from V2's deployed asset; it is a transitional input, not a claim that the original source has been recovered. No source from the retired Lovable repository is used.

Use Node 24 or later. No package download is required.

```sh
node --test maintenance/tests/*.test.cjs
node maintenance/build.mjs
node maintenance/build.mjs --check
```

Each patch has a stable ID, an exact expected source fragment, and a replacement. A missing, ambiguous or stale match stops the build. The baseline SHA-256 is pinned. A changed runtime gets a new content-addressed filename, and every V2 route shell must reference it. `--check` verifies committed runtime bytes and all route references.

Regression tests exercise recovered V2 logic and the repaired behavior. They distinguish static checks from executed behavior; they do not replace authenticated two-account browser tests or fresh provider generation.

Future work should recover or replace the original editable V2 source here. Until then, keep these targeted changes small; do not use the legacy project as a source substitute. The previous deployed asset remains available for rollback.

For a new published edition debate, record each side’s profile ID under its exact stance in `positionProfiles`. Record the current nonnegative vote count in `supportSnapshot` for each stance, including zero. The standalone image shows these counts at generation time. The site refreshes those counts from the position votes. Run `node maintenance/editorial/render-poster.mjs` to generate the posters, then run it with `--check` to verify the published files. The generator validates both profiles, the ten original picks per side, and all twenty calculated Differ Ranks.
