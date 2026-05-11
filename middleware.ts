import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/auth/callback', '/privacy', '/data-deletion'];

const MODULE_ROUTES: Record<string, string> = {
  '/hub': 'company_hub',
  '/crm': 'crm',
  '/boq': 'boq_builder',
  '/calls': 'calls_meetings',
  '/inventory': 'inventory',
  '/email': 'email_campaigns',
  '/content': 'content_calendar',
  '/analytics': 'analytics',
  '/ai-assistant': 'ai_assistant',
  '/products': 'product_management',
  '/students': 'student_management',
  '/courses': 'course_scheduler',
  '/brand': 'brand_assets',
  '/scraper': 'maps_scraper',
  '/files': 'files',
  '/after-sales': 'after_sales',
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Single client for the entire middleware — avoids double getUser() and
  // refresh-token rotation race condition that caused logout on page navigation.
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Keep request.cookies in sync so downstream reads see fresh tokens.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Module guard — reuses same client and same verified user from above.
  const routePrefix = '/' + pathname.split('/')[1];
  const moduleName = MODULE_ROUTES[routePrefix];

  if (moduleName) {
    // Super admins (platform_admins) are not in organization_members — skip guard.
    const { data: platformAdmin } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!platformAdmin) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (!membership) {
        return NextResponse.redirect(new URL('/login', request.url));
      }

      const { data: orgModule } = await supabase
        .from('organization_modules')
        .select('enabled, module_id, modules!inner(name)')
        .eq('org_id', membership.org_id)
        .eq('enabled', true)
        .eq('modules.name', moduleName)
        .single();

      if (!orgModule) {
        return NextResponse.redirect(new URL('/dashboard?module_disabled=1', request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
