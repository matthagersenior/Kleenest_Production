export type KleenestWebhookEventType =
  | 'place.updated'
  | 'place.verification_changed'
  | 'place.access_changed'
  | 'place.amenities_changed'
  | 'place.confidence_changed'
  | 'recommendation.coverage_changed';

export type KleenestWebhookEnvelope<T = Record<string, unknown>> = {
  id: string;
  type: KleenestWebhookEventType;
  createdAt: string;
  partnerId: string;
  data: T;
};

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export async function verifyKleenestWebhookSignature(input: {
  payload: string;
  secret: string;
  signature: string;
  timestamp: string;
  toleranceSeconds?: number;
  nowMs?: number;
}): Promise<boolean> {
  const toleranceSeconds = input.toleranceSeconds ?? 300;
  const timestampSeconds = Number(input.timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const nowMs = input.nowMs ?? Date.now();
  if (Math.abs(nowMs - timestampSeconds * 1000) > toleranceSeconds * 1000) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(input.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${input.timestamp}.${input.payload}`),
  );
  const expected = `v1=${hex(digest)}`;
  return timingSafeEqual(expected, input.signature);
}
