import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('BILLING_WEBHOOK_AUTH');
  if (!secret) return new Response('Billing is not configured', { status: 503 });
  // Compare hashes rather than leaking the shared authorization value through timing.
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [actual, expected] = await Promise.all([digest(request.headers.get('authorization') || ''), digest(secret)]);
  if (actual.reduce((diff, value, i) => diff | (value ^ expected[i]), 0) !== 0) return new Response('Unauthorized', { status: 401 });
  try {
    const { event } = await request.json();
    if (event?.type !== 'NON_RENEWING_PURCHASE') return Response.json({ ignored: true });
    if (!/^[0-9a-f-]{36}$/i.test(event.app_user_id || '')) return new Response('Invalid user', { status: 400 });
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await db.rpc('credit_verified_purchase', {
      p_event_id: event.id, p_transaction_id: event.transaction_id, p_store: event.store,
      p_user_id: event.app_user_id, p_product_id: event.product_id, p_environment: event.environment,
    });
    if (error) { console.error('Billing event rejected:', error.code); return new Response('Payment processing failed; retry required', { status: 500 }); }
    return Response.json({ credited: data });
  } catch { return new Response('Invalid request', { status: 400 }); }
});
