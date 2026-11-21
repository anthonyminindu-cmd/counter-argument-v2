# Counter Argument V2

**Active project. This repository and its V2 backend are the sole targets for ongoing development, testing, and deployment.**

- Live app: https://anthonyminindu-cmd.github.io/counter-argument-v2/
- Repository: https://github.com/anthonyminindu-cmd/counter-argument-v2
- Backend: Supabase project `bqhyropctavxjdnogmor` (Debate AI V2)
- Supported workflows: friend versus friend and person versus AI

## Project boundary

The former Lovable project, `anthonyminindu-cmd/debate-infographic-ai`, is legacy and retired from active work. Do not use its source, tests, configuration, deployment, or database as a substitute for V2. Do not publish V2 changes through Lovable or reconnect that legacy project's synchronization.

This repository contains the published frontend assets and a reproducible V2 maintenance build recovered from the actual deployed runtime. The original React/TypeScript source is still unavailable. Small guarded fixes and regression checks live under [maintenance](maintenance/README.md); broader changes should first recover or replace the original V2 source here. Do not fall back to the legacy repository. Supabase function and schema changes must target the V2 project explicitly.

## Build and checks

Use Node 24 or later; no package download is required.

```sh
node maintenance/build.mjs
node --test maintenance/tests/*.test.cjs
node maintenance/build.mjs --check
```

The maintenance build checks the recovered V2 baseline hash, applies only exact reviewed patches, generates a new content-addressed runtime, and updates all ten route shells. CI runs the regression suite and checks committed outputs. The previous runtime remains available for rollback.

The AI flow presents one research opponent matching its actual behavior. Unfinished solo drafts are saved in the current browser, scoped to their account and debate, and restored only after V2 verifies ownership; saved final workflows take precedence. Browser storage must remain available for unfinished local drafts. Full cross-device draft sync is not implemented.

## Validation

Validate the actual V2 deployment and its deployed functions. Legacy test results are not V2 validation. Check both debate modes, draft recovery, participant ownership, saved-history consistency, twenty original argument identities/ranks, infographic text bounds, and screen/PNG consistency. Report any authenticated or live-generation checks that could not be completed.

Keep provider API keys and privileged backend credentials out of this public repository.

