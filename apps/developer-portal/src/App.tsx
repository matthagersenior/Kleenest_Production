import { FormEvent, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type Summary = {
  partner?: {
    id?: string;
    slug?: string;
    name?: string;
    status?: string;
    plan?: string;
    quota_per_minute?: number;
    quota_per_month?: number;
  } | null;
  billing?: {
    provider?: string;
    status?: string;
    plan_code?: string | null;
    external_customer_id?: string | null;
    external_subscription_id?: string | null;
    current_period_end?: string | null;
  } | null;
  api_keys?: Array<{
    id: string;
    label: string;
    key_prefix: string;
    scopes: string[];
    credential_type?: 'secret' | 'publishable';
    allowed_origins?: string[];
    credential_quota_per_minute?: number | null;
    expires_at?: string | null;
    revoked_at?: string | null;
    last_used_at?: string | null;
  }>;
  month_usage?: { month_start?: string; request_count?: number };
  daily_usage?: Array<{
    usage_date: string;
    route: string;
    request_count: number;
    success_count: number;
    client_error_count: number;
    server_error_count: number;
  }>;
  webhooks?: Array<{
    id: string;
    label: string;
    url: string;
    event_types: string[];
    active: boolean;
    consecutive_failures: number;
    last_success_at?: string | null;
    last_failure_at?: string | null;
  }>;
};

const tabs = ['Overview', 'API keys', 'Usage', 'Webhooks', 'Integration'] as const;
type Tab = typeof tabs[number];

function App() {
  const [tab, setTab] = useState<Tab>('Overview');
  const [functionsBase, setFunctionsBase] = useState(() => sessionStorage.getItem('kleenest-functions-base') ?? '');
  const [publishableKey, setPublishableKey] = useState(() => sessionStorage.getItem('kleenest-publishable-key') ?? '');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [partnerId, setPartnerId] = useState(() => sessionStorage.getItem('kleenest-partner-id') ?? '');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [oneTimeSecret, setOneTimeSecret] = useState('');
  const [newPartner, setNewPartner] = useState({ slug: '', name: '', plan: 'developer', minute: '60', month: '10000' });
  const [newKey, setNewKey] = useState({ label: 'Integration key', expiresAt: '' });
  const [newPublicToken, setNewPublicToken] = useState({ label: 'Browser token', origin: '', days: '7', minute: '30' });
  const [billing, setBilling] = useState({ provider: 'manual', status: 'inactive', planCode: 'developer', customerId: '', subscriptionId: '' });
  const [newWebhook, setNewWebhook] = useState({ label: 'Default', url: '', eventTypes: 'place.updated,place.verification_changed' });

  const platformApiUrl = useMemo(
    () => functionsBase ? `${functionsBase.replace(/\/$/, '')}/platform-api` : 'https://YOUR_PROJECT.supabase.co/functions/v1/platform-api',
    [functionsBase],
  );

  function persistConfig() {
    sessionStorage.setItem('kleenest-functions-base', functionsBase);
    sessionStorage.setItem('kleenest-publishable-key', publishableKey);
    sessionStorage.setItem('kleenest-partner-id', partnerId);
  }

  const supabaseUrl = useMemo(
    () => functionsBase.replace(/\/functions\/v1\/?$/, '').replace(/\/$/, ''),
    [functionsBase],
  );

  async function signInOwner(event: FormEvent) {
    event.preventDefault();
    if (!supabaseUrl || !publishableKey || !ownerEmail || !ownerPassword) {
      setNotice('Functions URL, publishable key, email, and password are required.');
      return;
    }
    await action('Platform owner session authenticated.', async () => {
      persistConfig();
      const client = createClient(supabaseUrl, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.signInWithPassword({
        email: ownerEmail,
        password: ownerPassword,
      });
      if (error || !data.session?.access_token) throw error ?? new Error('Authentication failed.');
      setAccessToken(data.session.access_token);
      setOwnerPassword('');
    });
  }

  function signOutOwner() {
    setAccessToken('');
    setNotice('Platform owner session cleared.');
  }

  async function admin(operation: string, payload: Record<string, unknown> = {}) {
    if (!functionsBase || !accessToken) throw new Error('Authenticate a Kleenest platform owner first.');
    persistConfig();
    const response = await fetch(`${functionsBase.replace(/\/$/, '')}/platform-partner-admin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ operation, ...payload }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(body?.error ?? `Request failed (${response.status})`));
    return body;
  }

  async function action<T>(label: string, work: () => Promise<T>) {
    setBusy(true);
    setNotice('');
    try {
      const result = await work();
      setNotice(label);
      return result;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Operation failed.');
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function loadSummary() {
    if (!partnerId) {
      setNotice('Partner ID is required.');
      return;
    }
    try {
      await action('Partner data refreshed.', async () => {
        const result = await admin('summary', { partnerId });
        setSummary(result);
      });
    } catch {}
  }

  async function createPartner(event: FormEvent) {
    event.preventDefault();
    try {
      await action('Partner created.', async () => {
        const result = await admin('create-partner', {
          slug: newPartner.slug,
          name: newPartner.name,
          plan: newPartner.plan,
          quotaPerMinute: Number(newPartner.minute),
          quotaPerMonth: Number(newPartner.month),
        });
        setPartnerId(result.partnerId);
        sessionStorage.setItem('kleenest-partner-id', result.partnerId);
        setSummary(null);
        setTab('Overview');
      });
    } catch {}
  }

  async function saveBilling(event: FormEvent) {
    event.preventDefault();
    try {
      await action('Billing and plan state updated.', async () => {
        await admin('set-billing', {
          partnerId,
          provider: billing.provider,
          status: billing.status,
          planCode: billing.planCode,
          externalCustomerId: billing.customerId || null,
          externalSubscriptionId: billing.subscriptionId || null,
        });
        await loadSummary();
      });
    } catch {}
  }

  async function issueKey(event: FormEvent) {
    event.preventDefault();
    try {
      await action('API key issued. Copy it now; it will not be shown again.', async () => {
        const result = await admin('issue-key', {
          partnerId,
          label: newKey.label,
          scopes: ['recommendations:read'],
          expiresAt: newKey.expiresAt || null,
        });
        setOneTimeSecret(result.api_key ?? '');
        await loadSummary();
      });
    } catch {}
  }

  async function issuePublicToken(event: FormEvent) {
    event.preventDefault();
    const days = Math.max(1, Math.min(Number(newPublicToken.days || 7), 30));
    const quotaPerMinute = Math.max(1, Math.min(Number(newPublicToken.minute || 30), 120));
    try {
      await action('Browser token issued. Copy it now; it will not be shown again.', async () => {
        const result = await admin('issue-public-token', {
          partnerId,
          label: newPublicToken.label,
          allowedOrigins: [newPublicToken.origin.trim()],
          expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
          quotaPerMinute,
        });
        setOneTimeSecret(result.client_token ?? '');
        await loadSummary();
      });
    } catch {}
  }

  async function revokeKey(apiKeyId: string) {
    try {
      await action('API key revoked.', async () => {
        await admin('revoke-key', { apiKeyId });
        await loadSummary();
      });
    } catch {}
  }

  async function createWebhook(event: FormEvent) {
    event.preventDefault();
    try {
      await action('Webhook created. Copy the signing secret now.', async () => {
        const result = await admin('create-webhook', {
          partnerId,
          label: newWebhook.label,
          url: newWebhook.url,
          eventTypes: newWebhook.eventTypes.split(',').map(value => value.trim()).filter(Boolean),
        });
        setOneTimeSecret(result.signing_secret ?? '');
        await loadSummary();
      });
    } catch {}
  }

  async function disableWebhook(endpointId: string) {
    try {
      await action('Webhook disabled.', async () => {
        await admin('disable-webhook', { endpointId });
        await loadSummary();
      });
    } catch {}
  }

  async function testWebhook() {
    try {
      await action('Test webhook queued for delivery.', async () => {
        await admin('enqueue-test-webhook', { partnerId });
      });
    } catch {}
  }

  const monthCount = Number(summary?.month_usage?.request_count ?? 0);
  const monthLimit = Number(summary?.partner?.quota_per_month ?? 0);
  const usagePct = monthLimit ? Math.min(100, Math.round((monthCount / monthLimit) * 100)) : 0;

  return (
    <div className="app-shell">
      <aside>
        <div className="brand">
          <div className="brand-mark">K</div>
          <div>
            <strong>Kleenest</strong>
            <span>Platform Console</span>
          </div>
        </div>
        <nav>
          {tabs.map(item => (
            <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
              {item}
            </button>
          ))}
        </nav>
        <div className="aside-note">
          <strong>Internal operator preview</strong>
          <span>Administrative actions require an existing Kleenest platform-owner session.</span>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <p className="eyebrow">KLEENEST PLATFORM</p>
            <h1>{tab}</h1>
            <p className="subhead">Manage API access, usage, webhooks, and partner integrations from the same Kleenest authority.</p>
          </div>
          <button className="primary" onClick={loadSummary} disabled={busy || !partnerId}>Refresh partner</button>
        </header>

        <section className="config-panel">
          <label>
            Functions base URL
            <input value={functionsBase} onChange={e => setFunctionsBase(e.target.value)} placeholder="https://project.supabase.co/functions/v1" />
          </label>
          <label>
            Publishable key
            <input type="password" value={publishableKey} onChange={e => setPublishableKey(e.target.value)} placeholder="sb_publishable_..." />
          </label>
          <label>
            Partner ID
            <input value={partnerId} onChange={e => setPartnerId(e.target.value)} placeholder="UUID" />
          </label>
          <form className="owner-login" onSubmit={signInOwner}>
            <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="Kleenest owner email" autoComplete="username" />
            <input type="password" value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} placeholder="Password" autoComplete="current-password" />
            {accessToken
              ? <button type="button" onClick={signOutOwner}>Clear owner session</button>
              : <button className="primary" disabled={busy}>Sign in as owner</button>}
          </form>
        </section>

        {notice && <div className="notice">{notice}</div>}
        {oneTimeSecret && (
          <div className="secret-banner">
            <div>
              <strong>One-time secret</strong>
              <code>{oneTimeSecret}</code>
            </div>
            <button onClick={() => navigator.clipboard.writeText(oneTimeSecret)}>Copy</button>
            <button className="ghost" onClick={() => setOneTimeSecret('')}>Dismiss</button>
          </div>
        )}

        {tab === 'Overview' && (
          <>
            <section className="metrics">
              <article><span>Partner</span><strong>{summary?.partner?.name ?? 'Not loaded'}</strong><small>{summary?.partner?.slug ?? '—'}</small></article>
              <article><span>Plan</span><strong>{summary?.partner?.plan ?? '—'}</strong><small>{summary?.billing?.status ?? summary?.partner?.status ?? '—'}</small></article>
              <article><span>Monthly requests</span><strong>{monthCount.toLocaleString()}</strong><small>{monthLimit ? `of ${monthLimit.toLocaleString()}` : 'No quota loaded'}</small></article>
              <article><span>Active webhooks</span><strong>{summary?.webhooks?.filter(item => item.active).length ?? 0}</strong><small>{summary?.api_keys?.filter(item => !item.revoked_at).length ?? 0} active API keys</small></article>
            </section>
            <section className="grid two">
              <article className="card">
                <h2>Create partner</h2>
                <p>Provision the durable partner identity that owns keys, quotas, usage, and webhook endpoints.</p>
                <form onSubmit={createPartner}>
                  <input required placeholder="Partner slug" value={newPartner.slug} onChange={e => setNewPartner({ ...newPartner, slug: e.target.value })} />
                  <input required placeholder="Partner name" value={newPartner.name} onChange={e => setNewPartner({ ...newPartner, name: e.target.value })} />
                  <select value={newPartner.plan} onChange={e => setNewPartner({ ...newPartner, plan: e.target.value })}>
                    <option>developer</option><option>growth</option><option>fleet</option><option>enterprise</option>
                  </select>
                  <div className="form-row">
                    <input type="number" min="1" value={newPartner.minute} onChange={e => setNewPartner({ ...newPartner, minute: e.target.value })} />
                    <input type="number" min="1" value={newPartner.month} onChange={e => setNewPartner({ ...newPartner, month: e.target.value })} />
                  </div>
                  <button className="primary" disabled={busy}>Create partner</button>
                </form>
              </article>
              <article className="card">
                <h2>Quota health</h2>
                <p>{usagePct}% of this month's request allowance has been consumed.</p>
                <div className="progress"><span style={{ width: `${usagePct}%` }} /></div>
                <dl>
                  <div><dt>Per minute</dt><dd>{summary?.partner?.quota_per_minute ?? '—'}</dd></div>
                  <div><dt>Per month</dt><dd>{monthLimit ? monthLimit.toLocaleString() : '—'}</dd></div>
                  <div><dt>Current usage</dt><dd>{monthCount.toLocaleString()}</dd></div>
                </dl>
              </article>
              <article className="card">
                <h2>Billing & plan hook</h2>
                <p>Keep commercial state linked to the partner authority without putting payment-provider logic inside the recommendation API.</p>
                <form onSubmit={saveBilling}>
                  <div className="form-row">
                    <select value={billing.provider} onChange={e => setBilling({ ...billing, provider: e.target.value })}>
                      <option>manual</option><option>stripe</option><option>shopify</option><option>other</option>
                    </select>
                    <select value={billing.status} onChange={e => setBilling({ ...billing, status: e.target.value })}>
                      <option>inactive</option><option>trialing</option><option>active</option><option>past_due</option><option>canceled</option>
                    </select>
                  </div>
                  <select value={billing.planCode} onChange={e => setBilling({ ...billing, planCode: e.target.value })}>
                    <option>developer</option><option>growth</option><option>fleet</option><option>enterprise</option>
                  </select>
                  <input value={billing.customerId} onChange={e => setBilling({ ...billing, customerId: e.target.value })} placeholder="External customer ID (optional)" />
                  <input value={billing.subscriptionId} onChange={e => setBilling({ ...billing, subscriptionId: e.target.value })} placeholder="External subscription ID (optional)" />
                  <button className="primary" disabled={busy || !partnerId}>Save billing state</button>
                </form>
              </article>
            </section>
          </>
        )}

        {tab === 'API keys' && (
          <section className="grid two">
            <article className="card">
              <h2>Issue server API key</h2>
              <p>Use server keys only from trusted backend environments.</p>
              <form onSubmit={issueKey}>
                <input required value={newKey.label} onChange={e => setNewKey({ ...newKey, label: e.target.value })} placeholder="Key label" />
                <label>Optional expiration<input type="datetime-local" value={newKey.expiresAt} onChange={e => setNewKey({ ...newKey, expiresAt: e.target.value })} /></label>
                <button className="primary" disabled={busy || !partnerId}>Issue server key</button>
              </form>
            </article>
            <article className="card">
              <h2>Issue Browser token</h2>
              <p>Publishable read-only token for Widget/Map/browser integrations. Exact Allowed origin required.</p>
              <form onSubmit={issuePublicToken}>
                <input required value={newPublicToken.label} onChange={e => setNewPublicToken({ ...newPublicToken, label: e.target.value })} placeholder="Token label" />
                <input required type="url" value={newPublicToken.origin} onChange={e => setNewPublicToken({ ...newPublicToken, origin: e.target.value })} placeholder="Allowed origin, e.g. https://app.example.com" />
                <div className="form-row">
                  <label>Expires in days<input type="number" min="1" max="30" value={newPublicToken.days} onChange={e => setNewPublicToken({ ...newPublicToken, days: e.target.value })} /></label>
                  <label>Per-minute cap<input type="number" min="1" max="120" value={newPublicToken.minute} onChange={e => setNewPublicToken({ ...newPublicToken, minute: e.target.value })} /></label>
                </div>
                <button className="primary" disabled={busy || !partnerId}>Issue Browser token</button>
              </form>
            </article>
            <article className="card wide-list" style={{ gridColumn: '1 / -1' }}>
              <h2>Credentials</h2>
              {(summary?.api_keys ?? []).map(key => (
                <div className="list-row" key={key.id}>
                  <div>
                    <strong>{key.label}</strong>
                    <code>{key.key_prefix}…</code>
                    <small>
                      {key.credential_type === 'publishable'
                        ? `Browser token · ${(key.allowed_origins ?? []).join(', ')} · ${key.credential_quota_per_minute ?? '—'}/min`
                        : `Server API key · ${key.scopes?.join(', ')}`}
                    </small>
                  </div>
                  <div className="row-actions">
                    <span className={key.revoked_at ? 'pill off' : 'pill'}>{key.revoked_at ? 'Revoked' : 'Active'}</span>
                    {!key.revoked_at && <button className="danger" onClick={() => revokeKey(key.id)}>Revoke</button>}
                  </div>
                </div>
              ))}
              {!summary?.api_keys?.length && <p className="empty">Load a partner to view credentials.</p>}
            </article>
          </section>
        )}

        {tab === 'Usage' && (
          <section className="card">
            <h2>Usage — last 30 days</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Route</th><th>Requests</th><th>Success</th><th>4xx</th><th>5xx</th></tr></thead>
                <tbody>
                  {(summary?.daily_usage ?? []).map((row, index) => (
                    <tr key={`${row.usage_date}-${row.route}-${index}`}>
                      <td>{row.usage_date}</td><td><code>{row.route}</code></td><td>{row.request_count}</td>
                      <td>{row.success_count}</td><td>{row.client_error_count}</td><td>{row.server_error_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'Webhooks' && (
          <section className="grid two">
            <article className="card">
              <h2>Add webhook</h2>
              <form onSubmit={createWebhook}>
                <input required value={newWebhook.label} onChange={e => setNewWebhook({ ...newWebhook, label: e.target.value })} placeholder="Endpoint label" />
                <input required type="url" value={newWebhook.url} onChange={e => setNewWebhook({ ...newWebhook, url: e.target.value })} placeholder="https://partner.example/webhooks/kleenest" />
                <textarea value={newWebhook.eventTypes} onChange={e => setNewWebhook({ ...newWebhook, eventTypes: e.target.value })} />
                <div className="form-row">
                  <button className="primary" disabled={busy || !partnerId}>Create webhook</button>
                  <button type="button" onClick={testWebhook} disabled={busy || !partnerId}>Queue test</button>
                </div>
              </form>
            </article>
            <article className="card wide-list">
              <h2>Webhook endpoints</h2>
              {(summary?.webhooks ?? []).map(hook => (
                <div className="list-row" key={hook.id}>
                  <div><strong>{hook.label}</strong><code>{hook.url}</code><small>{hook.event_types.join(', ')} · failures {hook.consecutive_failures}</small></div>
                  <div className="row-actions">
                    <span className={hook.active ? 'pill' : 'pill off'}>{hook.active ? 'Active' : 'Disabled'}</span>
                    {hook.active && <button className="danger" onClick={() => disableWebhook(hook.id)}>Disable</button>}
                  </div>
                </div>
              ))}
            </article>
          </section>
        )}

        {tab === 'Integration' && (
          <section className="grid two">
            <article className="card">
              <h2>REST API</h2>
              <p>Partner backends use server API keys. Browser integrations use origin-restricted Browser tokens via <code>x-kleenest-client-token</code>; never embed a server key in browser code.</p>
              <pre>{`curl -X POST "${platformApiUrl}/v1/recommendations/nearby" \\
  -H "x-kleenest-api-key: YOUR_KEY" \\
  -H "content-type: application/json" \\
  -d '{"location":{"latitude":38.627,"longitude":-90.1994},"radiusMeters":16093}'`}</pre>
            </article>
            <article className="card">
              <h2>Webhook verification</h2>
              <p>Verify HMAC-SHA256 over <code>&lt;timestamp&gt;.&lt;raw-body&gt;</code> using the one-time endpoint signing secret.</p>
              <pre>{`Kleenest-Webhook-Id: event_uuid
Kleenest-Webhook-Timestamp: 1789167600
Kleenest-Webhook-Signature: v1=<hex-hmac>
Kleenest-Webhook-Event: place.updated`}</pre>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
