# Ambient Kleenest Intelligence Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Kleenest understand natural requests and explain recommendations without exposing a chatbot-style AI product surface.

**Architecture:** Add a guest-safe, read-only Supabase Edge Function that converts natural-language discovery requests into a bounded structured intent. Consumer Explore executes that intent through existing discovery, route, amenity, trust, freshness, and ranking services; existing Kleenest data remains authoritative. Verified-review drafting reuses authenticated `ai-assist/visit_review` from inside the normal review form rather than a separate assistant screen.

**Tech Stack:** React Native / Expo Router / TypeScript, Supabase Edge Functions, existing `@kleenest/mobile-core` discovery APIs, Node audit/tests.

## Global Constraints

- Do not make the app feel like an AI product: no new AI tab, bot persona, chat thread, provider/model copy, or AI-branded primary CTA.
- Models interpret or summarize supplied context only; they never create locations, amenities, trust, verification, check-ins, travel times, canonical state, or mutations.
- Ordinary brand/address searches stay on the existing fast deterministic path.
- Guest natural-language discovery must work without exposing privileged database/service-role capabilities.
- Any provider failure must fall back to deterministic Kleenest behavior and must not block search.
- Parsed intent must be visible as ordinary editable search/filter state, not hidden model state.
- “Why this match?” must be derived from authoritative result fields and active request constraints.
- Review drafting must use only the user's current scores, selected amenity observations, facility choice, and typed notes; the user edits before publish.
- The feature is incomplete unless it is discoverable, usable, resilient, and production-verifiable under the feature lifecycle contract.

---

### Task 1: Discovery intent contract and guest-safe interpreter

**Files:**
- Create: `apps/consumer-mobile/services/discoveryIntent.ts`
- Create: `supabase/functions/consumer-search-intent/index.ts`
- Test: `scripts/consumer-qa-regressions.test.mjs`

**Interfaces:**
- Consumes: raw query, current mode, amenity catalog labels.
- Produces: `DiscoveryIntent` with mode, origin text, place query, amenity terms, restroom requirement, freshness/rating/trust preferences, route detour preference, and a short plain-language summary.

- [ ] **Step 1: Add the focused failing test**
  - Natural route request is not treated as a literal address.
  - Plain addresses and brand names remain deterministic.
  - Deterministic fallback recognizes route phrases and common restroom/amenity intent.

- [ ] **Step 2: Verify the relevant failure**
  - Run `node --test scripts/consumer-qa-regressions.test.mjs`.
  - Expected: natural-language intent assertions fail on current main behavior.

- [ ] **Step 3: Implement the minimum behavior**
  - Add bounded client parser/validator and provider-backed guest-safe function.
  - The function has no service-role/database mutation path, clamps request size, returns schema-only JSON, and has deterministic fallback.
  - Provider order: Gemini, OpenRouter, OpenAI; missing/failing providers fall through.

- [ ] **Step 4: Verify the focused pass**
  - Run the same Node test.
  - Expected: address/brand behavior remains intact and natural-language intent passes.

- [ ] **Step 5: Run affected integration checks**
  - Run `npm run native:typecheck`.
  - Run `npm run audit`.

- [ ] **Step 6: Commit the passing deliverable**
  - Commit discovery intent service, Edge Function source, and tests together.

### Task 2: Ambient Explore and route execution

**Files:**
- Modify: `apps/consumer-mobile/features/AdaptiveExploreScreen.tsx`
- Modify: `apps/consumer-mobile/services/consumerTelemetry.ts`
- Test: `scripts/consumer-qa-regressions.test.mjs`

**Interfaces:**
- Consumes: `interpretDiscoveryIntent(query, mode, amenityCatalog)`.
- Produces: existing Explore filter state plus the same `findAdaptiveNearbyPlaces`, `findAdaptiveNearbyRestrooms`, `resolveConsumerSearchLocation`, and route calls already used today.

- [ ] **Step 1: Add focused failing tests**
  - Natural nearby request applies amenity/filter intent before discovery.
  - “on my way to …” switches execution to route mode and resolves the extracted destination.
  - Provider failure leaves the original deterministic search usable.
  - No visible “AI”, provider, model, or chatbot copy is introduced.

- [ ] **Step 2: Verify failure**
  - Run the focused Node test and confirm the wiring assertions fail.

- [ ] **Step 3: Implement minimum behavior**
  - Interpret only queries that look conversational/constraint-rich; simple brand/address queries skip the model call.
  - Apply parsed intent as normal filter state and execute through current discovery functions.
  - Render a compact ordinary-language interpretation chip that can be cleared by resetting filters/search.
  - Keep current map/recenter/canonicalization behavior.

- [ ] **Step 4: Verify focused pass**
  - Run the focused test.

- [ ] **Step 5: Run integration checks**
  - Run native typecheck and consumer route/discovery audits.

- [ ] **Step 6: Commit**

### Task 3: Grounded “Why this match?” and review writing help

**Files:**
- Modify: `apps/consumer-mobile/features/AdaptiveExploreScreen.tsx`
- Modify: `apps/consumer-mobile/app/location/[id].tsx`
- Modify: `apps/consumer-mobile/services/aiAssist.ts`
- Test: `scripts/consumer-qa-regressions.test.mjs`
- Test: existing review audits

**Interfaces:**
- Match explanation consumes result fields + active request constraints and produces deterministic evidence bullets.
- Review helper consumes current visit-only facts and invokes authenticated `visit_review`; it returns editable draft text only.

- [ ] **Step 1: Add failing tests**
  - Every result can expose “Why this match?” without inventing unsupported facts.
  - Review form has ordinary-language writing help with no AI branding and never auto-publishes.

- [ ] **Step 2: Verify failure**
  - Run focused tests.

- [ ] **Step 3: Implement**
  - Add deterministic match explanation expansion.
  - Add “Help me phrase this” in the verified review form; fill only the editable comment field.
  - Preserve user-authored text if the helper fails.

- [ ] **Step 4: Verify pass**
  - Run focused tests.

- [ ] **Step 5: Run review and accessibility audits**
  - Run `npm run native:typecheck` and relevant review scripts through `npm run audit`.

- [ ] **Step 6: Commit**

### Task 4: Remove chatbot-shaped entry points and certify the slice

**Files:**
- Modify: `apps/consumer-mobile/app/_layout.tsx`
- Modify: `apps/consumer-mobile/app/assistant.tsx`
- Modify: `apps/business-mobile/app/intelligence.tsx`
- Modify: `apps/business-mobile/app/assistant.tsx`
- Modify: `apps/business-mobile/app/_layout.tsx`
- Modify: `config/feature-lifecycle.json`
- Create: `scripts/ambient-intelligence-product-audit.mjs`
- Modify: `package.json`

**Interfaces:**
- Existing intelligence capabilities remain available contextually, but navigation/copy is product-language: guidance, recommendations, draft help, evidence explanation.

- [ ] **Step 1: Add failing product-shape audit**
  - Primary reachable product surfaces do not advertise “Kleenest AI”, “copilot”, provider/model, or “Ask AI”.
  - Contextual intelligence remains reachable through Explore, review, Business intelligence, and Fleet insights.

- [ ] **Step 2: Verify failure**
  - Run the new audit and confirm current explicit AI surfaces fail it.

- [ ] **Step 3: Implement**
  - Reframe/remove standalone assistant links from normal navigation.
  - Keep legacy hidden routes only as compatibility surfaces with product-language copy.
  - Add lifecycle entry for ambient intelligence with concrete user-access and production-verification requirements.

- [ ] **Step 4: Verify pass**
  - Run the new audit.

- [ ] **Step 5: Full verification**
  - Run `npm run native:typecheck`, `npm run operator:typecheck`, and `npm run audit`.
  - Confirm CI on the PR is green before merge.

- [ ] **Step 6: Commit and merge**
  - Merge to `main` only after CI is green; remove the feature branch afterward.

## Unresolved externally observable decisions

None. The approved product decision is ambient intelligence inside existing Kleenest workflows, with no chatbot-style primary surface.
