# Kleenest Creator Studio — October 2026

## Audience and trust boundary
The Creator Studio is an invite-only workflow for external content creators. Its permissions are completely separate from KleenestOS owner/admin, Business, and Fleet permissions. The user must sign in with a verified email matching an invitation created by a platform owner.

- Owner invites a creator at `/workspace/creator-studio`, optionally adding their handle.
- The owner independently shares `/Kleenest_Production/workspace/creator-studio` with the creator. Saving an invitation does **not** send an email.
- Creator signs up or signs in with that exact email and claims membership.
- Creator can draft/edit their own missions and submit them for owner approval.
- Owner can approve, request changes, reject, or revoke access.
- Approved missions have public read-only detail pages; all other missions and private accounts are inaccessible to public clients.
- Creator and visitor activity cannot award XP from this workflow yet; proposed XP is review-only.

## Supported authoring templates
Creator missions may request a bounded combination of 0–25 places, 0–25 feedback contributions, 0–25 photos, amenities selected from the allowlist, area/neighborhood details, and proposed XP up to 500. Amenity checks must include at least one place. At least one objective must be nonzero.

## Approval and publication
Mission edits and submission are made only by the owning creator's verified session. Only `is_platform_owner_session()` may invite/revoke and review. Public previews require `approved` status and a still-active creator account.

**Do not use approved public preview pages as evidence that the requirements were satisfied.** Award and attribution will require verified event integration for visits, reviews, photo attachments and amenity-specific evidence; this is a remaining dependency before monetized or incentivized public campaigns.

## Amy Funderburk
The existing `One Real STL Day` assignment remains a **draft** in production. This release does not grant her or her manager access, send an email, activate a mission, or make financial/equity commitments. Invite only the email address they expressly nominate and keep access revocable.

## Verification
- `node --test scripts/creator-studio-contract.test.mjs`
- `npm run build`
- Supabase permission checks: RLS enabled; direct table rights revoked from anon/authenticated; owner RPCs protected at function boundary; unknown published mission resolves to null.
- Verify through a real owner and invited-creator session before promoting to a production-certified feature.
