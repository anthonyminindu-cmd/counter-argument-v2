# Counter Argument V2 — active project scope

- The user's only active debate application is this repository, `anthonyminindu-cmd/counter-argument-v2`, and its live app at `https://anthonyminindu-cmd.github.io/counter-argument-v2/`.
- Target Supabase project `bqhyropctavxjdnogmor` (Debate AI V2). Verify the project before any backend mutation.
- The Lovable-created `anthonyminindu-cmd/debate-infographic-ai` repository and its original backend are legacy. Do not analyze, modify, deploy, copy from, or run their tests as part of V2 work unless the user explicitly requests historical recovery.
- Do not reconnect Lovable synchronization or use the old repository as a source fallback.
- This checkout holds published frontend artifacts and a guarded maintenance build recovered only from the current V2 runtime. The original React/TypeScript source remains unavailable. Small targeted repairs use maintenance/runtime-baseline.js, maintenance/patches, and the portable regression suite; broad changes require recovering or replacing the correct V2 source. Never edit a generated asset directly. Preserve previous deployable assets for rollback.
- After changing a maintenance patch, run node maintenance/build.mjs, node --test maintenance/tests/*.test.cjs, and node maintenance/build.mjs --check. Do not count synthetic or mocked tests as authenticated end-to-end testing.
- Ground findings in current V2 files and deployed V2 functions. Distinguish executed tests, static inspection, requirements, and unverified behavior. Legacy test counts do not count toward V2 acceptance.
- Validate friend-versus-friend and person-versus-AI separately, including refresh/restore, simultaneous submissions, server ownership checks, result/history consistency, infographic accuracy, and PNG export.
- Preserve the original twenty argument IDs, participant ownership, ranks and scores across active view, history and export. Supporting/challenging stance is separate from participant ownership.
- Keep all credentials out of public source and frontend assets.

