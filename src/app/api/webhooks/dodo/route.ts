import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';
import { createClient } from '@supabase/supabase-js';

// ✅ Lazy getter — only runs at request time, never at build time
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ✅ Moved inside a function so env vars are read at runtime
function getProductToTier(): Record<string, string> {
  return {
    [process.env.DODO_TEST_PRODUCT_ID!]: 'test',
    [process.env.DODO_STARTER_PRODUCT_ID!]: 'starter',
    [process.env.DODO_PRO_PRODUCT_ID!]: 'pro',
    [process.env.DODO_PLUS_PRODUCT_ID!]: 'plus',
  };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const webhookSecret = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
  if (!webhookSecret) {
    console.error('[Webhook] DODO_PAYMENTS_WEBHOOK_KEY is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  try {
    const wh = new Webhook(webhookSecret);
    const headers = {
      'webhook-id': req.headers.get('webhook-id') ?? '',
      'webhook-signature': req.headers.get('webhook-signature') ?? '',
      'webhook-timestamp': req.headers.get('webhook-timestamp') ?? '',
    };
    await wh.verify(rawBody, headers);
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const eventType: string = event.type ?? event.event_type ?? '';
  console.log('[Webhook] Received event:', eventType);

  try {
    if (eventType === 'payment.succeeded') {
      await handlePaymentSucceeded(event);
    } else if (eventType === 'subscription.active') {
      await handleSubscriptionActive(event);
    } else if (eventType === 'subscription.cancelled' || eventType === 'subscription.expired') {
      await handleSubscriptionEnded(event);
    } else if (eventType === 'payment.failed') {
      await handlePaymentFailed(event);
    } else {
      console.log('[Webhook] Unhandled event type:', eventType);
    }
  } catch (err) {
    console.error('[Webhook] Error processing event:', err);
    return NextResponse.json({ error: 'Failed to process event' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handlePaymentSucceeded(event: any) {
  const supabase = getSupabase(); // ✅
  const data = event.data ?? event;

  const userId = data.metadata?.user_id;
  const tier = data.metadata?.tier;
  const paymentId = data.payment_id ?? data.id;
  const customerId = data.customer?.customer_id ?? data.customer_id;

  if (!userId || !tier) {
    console.warn('[Webhook] payment.succeeded missing user_id or tier in metadata', data.metadata);
    return;
  }

  await supabase.from('payment_events').insert({
    user_id: userId,
    event_type: 'payment.succeeded',
    plan_tier: tier,
    amount_cents: data.total_amount ?? null,
    stripe_event_id: paymentId,
    payload: data,
  });

  await supabase
    .from('user_plans')
    .update({
      plan_tier: tier,
      payment_status: 'active',
      dodo_payment_id: paymentId,
      dodo_customer_id: customerId ?? null,
      period_start: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  console.log(`[Webhook] ✓ Upgraded user ${userId} → ${tier}`);
}

async function handleSubscriptionActive(event: any) {
  const supabase = getSupabase(); // ✅
  const data = event.data ?? event;

  const userId = data.metadata?.user_id;
  const tier = data.metadata?.tier;
  const subscriptionId = data.subscription_id ?? data.id;
  const customerId = data.customer?.customer_id ?? data.customer_id;

  const resolvedTier = tier ?? getProductToTier()[data.product_id] ?? null; // ✅

  if (!userId || !resolvedTier) {
    console.warn('[Webhook] subscription.active missing user_id or tier', data);
    return;
  }

  await supabase.from('payment_events').insert({
    user_id: userId,
    event_type: 'subscription.active',
    plan_tier: resolvedTier,
    stripe_event_id: subscriptionId,
    payload: data,
  });

  await supabase
    .from('user_plans')
    .update({
      plan_tier: resolvedTier,
      payment_status: 'active',
      dodo_subscription_id: subscriptionId,
      dodo_customer_id: customerId ?? null,
      period_start: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  console.log(`[Webhook] ✓ Subscription active for user ${userId} → ${resolvedTier}`);
}

async function handleSubscriptionEnded(event: any) {
  const supabase = getSupabase(); // ✅
  const data = event.data ?? event;
  const subscriptionId = data.subscription_id ?? data.id;

  const { data: plan, error } = await supabase
    .from('user_plans')
    .select('user_id')
    .eq('dodo_subscription_id', subscriptionId)
    .single();

  if (error || !plan) {
    console.warn('[Webhook] Could not find user for subscription:', subscriptionId);
    return;
  }

  await supabase.from('payment_events').insert({
    user_id: plan.user_id,
    event_type: event.type ?? event.event_type,
    stripe_event_id: subscriptionId,
    payload: data,
  });

  await supabase
    .from('user_plans')
    .update({
      plan_tier: 'free',
      payment_status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', plan.user_id);

  console.log(`[Webhook] ✓ Downgraded user ${plan.user_id} → free (subscription ended)`);
}

async function handlePaymentFailed(event: any) {
  const supabase = getSupabase(); // ✅
  const data = event.data ?? event;
  const userId = data.metadata?.user_id;
  const paymentId = data.payment_id ?? data.id;

  if (!userId) {
    console.warn('[Webhook] payment.failed missing user_id in metadata');
    return;
  }

  await supabase.from('payment_events').insert({
    user_id: userId,
    event_type: 'payment.failed',
    stripe_event_id: paymentId,
    payload: data,
  });

  await supabase
    .from('user_plans')
    .update({
      payment_status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  console.log(`[Webhook] ✗ Payment failed for user ${userId}`);
}