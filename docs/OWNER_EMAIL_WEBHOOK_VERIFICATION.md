# Owner email webhook verification

The inbound webhook must verify the raw request body with the Resend SDK using the `webhookSecret` option and the normalized `id`, `timestamp`, and `signature` fields sourced from the Svix headers.

Acceptance checks: run Production CI, deploy `owner-email-inbound`, replay a signed delivery event, verify a corresponding Owner Email Center record, and confirm an invalid signature is rejected. A passing CI run alone does not establish successful live delivery.
