import { NextRequest, NextResponse } from 'next/server';
import DodoPayments from 'dodopayments';
import { createClient } from '@supabase/supabase-js';

const client = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment: (process.env.DODO_PAYMENTS_ENVIRONMENT as any) || 'test_mode',
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tier, accessToken } = body;

    // Input validation — only allow known pricing tiers
    const ALLOWED_TIERS = ['test', 'starter', 'pro', 'plus'];
    if (!tier || typeof tier !== 'string' || !ALLOWED_TIERS.includes(tier.toLowerCase())) {
      return NextResponse.json(
        { error: 'Invalid pricing tier. Allowed values: starter, pro, plus.' },
        { status: 400 }
      );
    }
    if (accessToken && typeof accessToken !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request format.' },
        { status: 400 }
      );
    }

    // ✅ Accept access token from the request body (sent by client-side Supabase CDN auth)
    //    This fixes the 401 issue caused by the CDN client storing tokens in localStorage
    //    instead of cookies, which the SSR createServerClient couldn't read.
    const token = accessToken || req.headers.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Please sign in to continue' }, { status: 401 });
    }

    // Use the service-role client to verify the user via their access token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth verification failed:', authError?.message);
      return NextResponse.json({ error: 'Please sign in to continue' }, { status: 401 });
    }

    const tierKey = tier.toLowerCase();
    const PRODUCT_MAP: Record<string, string | undefined> = {
      test: process.env.DODO_TEST_PRODUCT_ID,
      starter: process.env.DODO_STARTER_PRODUCT_ID,
      pro: process.env.DODO_PRO_PRODUCT_ID,
      plus: process.env.DODO_PLUS_PRODUCT_ID,
    };

    const productId = PRODUCT_MAP[tierKey];
    if (!productId) {
      console.error(`Product ID not configured for tier: ${tierKey}`);
      return NextResponse.json({
        error: 'This pricing tier is currently unavailable. Please contact support.'
      }, { status: 400 });
    }

    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: {
        email: user.email!,
        name: user.user_metadata?.full_name || user.email!,
      },
      metadata: {
        user_id: user.id,
        tier: tierKey, // ✅ normalized lowercase so webhook PRODUCT_TO_TIER matches
      },
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://codesafe.co.in'}/?checkout=success`,
    });

    return NextResponse.json({ checkoutUrl: session.checkout_url });

  } catch (err: unknown) {
    console.error('Checkout error:', err);
    return NextResponse.json({
      error: 'An unexpected error occurred. Please try again later.'
    }, { status: 500 });
  }
}