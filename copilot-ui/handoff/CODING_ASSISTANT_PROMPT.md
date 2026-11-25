# UI-only implementation brief

You are updating an existing Interview Copilot repository, not starting a new app. Use this package as the visual reference for interview rehearsal and explicitly authorized assistance. Preserve existing functionality and permissions; do not build concealed assistance for interviews that prohibit it.

## First inspect, then change
- Inspect package.json, routes, layout, styling, existing components, state hooks, API clients and tests. Report the actual stack and map screens to existing files. Do not assume Next.js or Tailwind.
- Preserve backend, database, authentication, authorization, API contracts, model configuration, streaming transport and deployment. Do not migrate frameworks or introduce dependencies without justification.
- Use theme/tokens.css as semantic color source; adapt theme/components.css to the existing styling conventions. The preview is a reference, not production code. Avoid global CSS collisions.
- Add a persistent theme preference (dark default, light option), prevent initial theme flash using the existing framework's approach, honor reduced motion and retain visible keyboard focus.

## Suggested organization (adapt to existing folders)
```
src/
  app-or-routes/             # existing route entry points, unchanged URLs
  components/
    ui/                     # Button, Input, Select, Badge, Dialog, Tabs, Table
    layout/                 # AppShell, RoleNavigation, PageHeader
  features/
    auth/                   # sign-in, request access, pending approval
    users/                  # roster, status actions, assignment controls
    resumes/                # list, editor, prepared Q&A
    interviews/             # list, setup, lifecycle, version lineage
    practice-room/          # authorized session view, answer typography, review
    account/                # profile, password, masked key status
  styles/                   # tokens, base, component styles
  hooks/                    # existing hooks; reuse rather than duplicate
  lib/                      # existing API clients and utilities, unchanged
```

## Implementation order
1. Establish semantic tokens and shared primitives; validate dark and light.
2. Update role navigation and layouts; keep permissions server-enforced.
3. Update admin roster, résumé list/editor, Q&A, interview list/setup and account.
4. Update rehearsal/authorized session presentation using existing data; use a strong opener and comfortable detail hierarchy. Preserve existing loading/error semantics; do not invent answers or claim a fixed latency. Keep candidate reading layout responsive and use existing access checks.
5. Add loading, empty, error, disabled, pending and offline states. Test both themes and keyboard navigation.

## Acceptance criteria
- No backend or schema changes; existing tests still pass. No fake production data or inert production controls.
- Responsive at 360, 430, 768, 1024 and 1440px; no horizontal page overflow (tables may scroll internally).
- WCAG AA contrast target; accessible labels, focus, status text and reduced-motion support.
- API keys never appear in logs, frontend bundles or plaintext browser storage; only masked metadata is shown.
- Match supplied screenshots for spacing, typography, surfaces, form density and visual hierarchy, not fictional data. Use verified résumé facts only.
- Run existing lint, typecheck, tests and build; report changes, deviations and remaining issues. Do not claim tests passed if not executed.
