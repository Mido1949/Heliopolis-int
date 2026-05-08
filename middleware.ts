import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

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

  const response = await updateSession(request);

  const routePrefix = '/' + pathname.split('/')[1];
  const moduleName = MODULE_ROUTES[routePrefix];
  if (moduleName) {

    if (moduleName) {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: (cookiesToSet) => {
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
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
