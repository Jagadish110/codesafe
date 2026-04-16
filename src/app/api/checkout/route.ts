import { NextRequest, NextResponse } from 'next/server';
import DodoPayments from 'dodopayments';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Initialize the Dodo Payments client
const client = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment: (process.env.DODO_PAYMENTS_ENVIRONMENT as any) || 'test_mode',
});

export async function POST(req: NextRequest) {
  try {
    const { tier } = await req.json();
    
    // 1. Authenticate user with Supabase
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to continue' }, { status: 401 });
    }

    // 2. Map the tier to your Dodo Product IDs
    const productId = tier === 'pro' 
      ? process.env.DODO_PRO_PRODUCT_ID 
      : process.env.DODO_PLUS_PRODUCT_ID;

    if (!productId) {
      return NextResponse.json({ error: 'Pricing tier not configured' }, { status: 400 });
    }

    // 3. Create a Checkout Session
    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: {
        email: user.email!,
        name: user.user_metadata?.full_name || user.email!,
      },
      metadata: {
        user_id: user.id,
        tier: tier,
      },
      // When the user completes payment, redirect them back to dashboard
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard?checkout=success`,
    });

    // 4. Return the hosted checkout URL to the frontend
    return NextResponse.json({ checkoutUrl: session.checkout_url });
    
  } catch (err: any) {
    console.error('Checkout error:', err);
    return NextResponse.json({ 
      error: err.message || 'Failed to initialize payment session' 
    }, { status: 500 });
  }
}
