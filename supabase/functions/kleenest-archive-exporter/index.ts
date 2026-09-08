Deno.serve(() => new Response(JSON.stringify({ disabled: true, reason: 'Replaced by GitHub Actions Kleenest_Data sync' }), { status: 410, headers: { 'content-type': 'application/json' } }));
