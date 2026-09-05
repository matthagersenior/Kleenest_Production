# Kleenest Monorepo Enterprise, Parity, and Play Design

## Goal
Make `Kleenest_Production` the sole executable authority for Consumer, Business, Fleet, and KleenestOS while preserving every canonical capability and making Business Standard/Growth/Enterprise behavior explicit, useful, navigable, and Play-compliant.

## Product tiers
- **Business Standard**: basic Business capabilities for a small operator. One canonical business workspace, basic profile/location/review/QR/notification/analytics/operations workflows, no advanced Growth-only engagement or Fleet administration.
- **Business Growth + Fleet**: up to 5 active locations. Growth exposes the full Business capability complement and Fleet. A business with up to 5 locations and more than 5 users qualifies for Growth + Fleet.
- **Enterprise + Fleet**: more than 5 active locations. Enterprise is multi-location operations, not a badge. It includes Fleet, per-location staff and role governance, cross-location comparison/cooperation, configurable engagement at each location, cross-location metrics/intelligence, and the ability to create broader enterprise/partner networks based on intelligence, engagement, cooperation, feasibility, and location relationships.
- **Enterprise location staffing**: up to 5 users per location. Roles are employee, manager, admin, and owner, each with distinct capabilities. Enterprise owners/admins may span locations; location managers/employees are scoped to assigned locations.

## Enterprise workflows
1. **Portfolio command** — location health, staffing, campaigns, Fleet, alerts, quality, occupancy, engagement, and operating comparisons across locations.
2. **Location configuration** — configure each location independently for campaigns, challenges, contests, missions, journeys, games, notifications, photos/media, QR behavior, engagement programs, and operating policies.
3. **Role/capability governance** — invite/assign staff, scope them to locations, change roles/capabilities, transfer ownership, inspect effective access, and prevent cross-location privilege leakage.
4. **Cross-location cooperation** — compare locations, identify feasible collaboration, create shared campaigns/challenges/journeys, share learning and resources, and measure intracompany outcomes.
5. **Enterprise networks** — create partner or internal networks; invite businesses/locations; run campaigns; allocate participation; measure outcomes; enable/disable networks; and use intelligence to suggest network opportunities.
6. **Intelligence actions** — intelligence is actionable. Every recommendation links to its owning workflow, supports configuration/execution, records the action, and refreshes canonical state after mutation.

## UI contract
A user-facing capability is converged only when it has a discoverable task workflow. Operator UIs must not render raw JSON. Screens must show readable status, context, editable configuration, validation, contextual actions, progress/result feedback, and clear navigation. Supporting functions may stay behind services, but every canonical user-facing domain must have a route owner.

## Monorepo contract
- Consumer: `apps/consumer-mobile`, Android package `com.kleenest.app`.
- Business: `apps/business-mobile`, Android package `com.kleenest.business`.
- Fleet: `apps/fleet-mobile`, Android package `com.kleenest.fleet`.
- KleenestOS/Owner: `apps/platform-mobile`, Android package `com.kleenest.owner`.
- Shared mobile primitives and Supabase client authority live under `packages/mobile-core`.
- `Kleenest_Business`, `Kleenest_Fleet`, `Kleenest_Owner`, and `Kleenest_Architecture` become documentation/reference-only only after parity and build gates prove Production owns every executable capability.

## Consumer Family onboarding
Consumer signup offers Individual or Family intent. Family intent creates the account and routes to Family setup, but does not self-entitle or bypass Google Play/backend membership authority.

## Play Store contract
- All Android packages target API 36 or later.
- Each package has in-app privacy/terms/account controls and public legal/deletion documents.
- Background location is requested only by Consumer Live Network, Business Live Network, and Fleet route/geofence workflows, with a prominent purpose disclosure before the permission flow and user-initiated enablement.
- KleenestOS does not request background location.
- Consumer UGC requires current policy acceptance, report/block behavior, moderation authority, and external account deletion instructions.
- Digital memberships/features do not use external checkout inside Android apps; eligible activation stays backend/Google-Play-authoritative.

## Verification gates
1. Database capability domains all have active ownership contracts.
2. Root audit runs product parity, operator UX parity, monorepo closure, and Play matrix audits.
3. No operator screen contains `JSON.stringify` or raw payload dump styling.
4. Standalone parity requirements are represented in Production routes/services/config.
5. All four workspaces typecheck and build through current CI.
6. Signed Android artifacts are built from the integrated monorepo head.
7. Public legal/deletion URLs and permission-denial/offline/degraded-network behavior are certified before release.
