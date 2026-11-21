# Counter Argument V2

**Active project. This repository and its V2 backend are the sole targets for ongoing development, testing, and deployment.**

- Live app: https://anthonyminindu-cmd.github.io/counter-argument-v2/
- Repository: https://github.com/anthonyminindu-cmd/counter-argument-v2
- Backend: Supabase project `bqhyropctavxjdnogmor` (Debate AI V2)
- Supported workflows: friend versus friend and person versus AI

## Project boundary

The former Lovable project, `anthonyminindu-cmd/debate-infographic-ai`, is legacy and retired from active work. Do not use its source, tests, configuration, deployment, or database as a substitute for V2. Do not publish V2 changes through Lovable or reconnect that legacy project's synchronization.

This repository currently contains the published frontend assets. Changes that require editable application source must first establish the matching V2 source here; do not silently fall back to the legacy repository. Supabase function and schema changes must target the V2 project explicitly.

## Validation

Validate the actual V2 deployment and its deployed functions. Legacy test results are not V2 validation. Check both debate modes, draft recovery, participant ownership, saved-history consistency, twenty original argument identities/ranks, infographic text bounds, and screen/PNG consistency. Report any authenticated or live-generation checks that could not be completed.

Keep provider API keys and privileged backend credentials out of this public repository.
