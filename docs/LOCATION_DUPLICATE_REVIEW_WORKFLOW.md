# Canonical location duplicate review in KleenestOS

Owner navigation: **Data Workbench → Location duplicate review**.

## Daily review loop

1. Start with **Likely matches** (highest source-rule match confidence first). The recommendation is *advisory*, not an approved merge.
2. Read the recommended next step and the highlighted discrepancies. **Formatting variations** are harmless changes to spelling, punctuation or phone formatting; **conflicting data** (phone, category, ZIP, address) is a material reason to verify first; **missing fields** lower confidence; **different data sources** do not prove identity.
3. Compare the two locations and open either map pin. Confirm whether the same establishment, two tenants, two entrances, or two distinct amenities are represented.
4. Select **Confirm same business**, **Two businesses, shared building**, **Keep separate businesses**, or **Needs coordinate correction**. Add an evidence note when useful and press **Save and continue**. That writes a human decision and an immutable timestamped audit event.
5. Move to **Wrong map pins**, ordered by greatest coordinate discrepancy. Do not merge distant records solely because their names and addresses match.
6. Use **Confirmed**, **Shared buildings**, **Separate**, or **Closed** to revisit decisions. Reopen a case if corrected evidence changes its classification.

## Safety and limits

- Recommendations use deterministic record comparisons, not geospatial ground truth or a machine-learning probability. The percentage shown is the original ingestion matching-rule confidence.
- A **confirmed** case is a review classification only. It does **not** delete, deactivate or join canonical business records. Any production merge must use a separate, audited reconciliation process that preserves reviews, QR codes, geofences, claims, and foreign keys.
- Marking **Two businesses, shared building** creates a co-location link but retains independent identities, ratings, and QR codes.
- **Needs coordinate correction** is a work queue, not an automatic coordinate rewrite.
- Reviews use platform-owner authorization and case-status optimistic locking. In case of competing edits the reviewer refreshes rather than overwriting another person's conclusion.
- Pagination retrieves at most 40 cases plus their 80 source records at a time. Use **Skip / Next** without changing status; the next page can be loaded for more cases.
- The event log records original and resulting status, notes, reviewer ID when authenticated, and timestamp. A case can be reopened, but history remains.
- No email notifications are sent by this review UI.

## Interpretation priorities

| Evidence | Suggested response |
| --- | --- |
| Same cleaned name, same street address, within 20 m, no material category or phone conflict | Likely duplicate: verify physical identity and mark **Confirm same business** |
| Similar brand and shared coordinates but differing names | Investigate business aliases vs. tenants; keep separate if distinct |
| Same coordinates and street but different establishment names | Inspect for multiple businesses in one building; mark **Two businesses, shared building** only when verified |
| Same name/address but more than 100 m apart | **Needs coordinate correction**; verify actual position first |
| Phone, category or city conflicts | Investigate conflicting business details; no automatic merge recommendation |
| No reliable coordinates or missing record | Collect evidence before deciding |

This workflow is intentionally human-reviewed; it does not enable bulk destructive deletion, speculative name-only merging, or map-pin deduplication across legitimate tenants.
