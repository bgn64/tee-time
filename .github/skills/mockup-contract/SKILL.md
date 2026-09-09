---
name: mockup-contract
description: >-
  Reconcile, design, approve, and implement UI changes from canonical mockups.
  Use for any user-facing UI update, new screen, redesign, or mockup maintenance.
---

# Mockup contract

Use one canonical mockup per product surface. The approved mockup is the exact
visual and behavioral contract for implementation.

## 1. Discover

Read repository instructions, then locate the app start command, local URL, UI
automation tools, mockup root, and existing surface index. Infer missing values
from repository files and available tools; ask only when choices remain ambiguous.

Select the smallest product surface that contains the requested change.

## 2. Reconcile current state

Before designing, use UI automation to inspect the running app at the contract's
viewports, states, and interactions. Compare it with the canonical mockup.

If the mockup is absent or stale, create or update it to match the current app
without including the requested change. Update its manifest and surface index.
Follow repository approval policy, then commit this baseline separately so the
design diff contains only the requested change. If reconciliation needs no edit,
use the current canonical commit as the baseline.

## 3. Design and approve

Update the canonical mockup and manifest. Record:

- routes and viewport sizes;
- visible states needed to judge the change;
- interactions and their user-visible outcomes;
- deterministic mock-data scenarios.

Use manifest status `reconciled`, `proposed`, `approved`, or `implemented`.
Interaction fidelity is `static`, `simulated`, or `functional`.

Simulate interactions that affect the changed experience. Unrelated behavior may
remain static. Represent production services with deterministic fixtures rather
than rebuilding application logic.

Iterate until the user explicitly approves the mockup. Do not implement before
approval. Follow repository approval policy, then commit the approved design
separately from the baseline.

## 4. Implement the approved contract

Make the app match every approved viewport, state, and interaction. Do not change
the mockup to accommodate implementation. Any deviation returns to design,
requires explicit reapproval, and is committed before implementation resumes.

## Organization

Use the repository's configured mockup root. Default to:

```text
mockups/surfaces/<surface>/
  index.html
  contract.yaml
```

Keep one canonical mockup per surface and link it from the root index. Migrate
legacy mockups only when their surface is touched; leave historical explorations
clearly marked as non-canonical.