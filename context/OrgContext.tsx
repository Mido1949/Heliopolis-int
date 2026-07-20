'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { withTimeout } from '@/lib/utils';
import type { Organization, OrgModule } from '@/types/org';

type OrgContextValue = {
  currentOrgId: string | null;
  currentOrgName: string | null;
  currentOrgSlug: string | null;
  org: Organization | null;
  orgModules: OrgModule[];
  isLoading: boolean;
  loadError: string | null;
  retry: () => Promise<void>;
  isSuperAdmin: boolean;
  allOrgs: Organization[];
  hasModule: (moduleName: string) => boolean;
  switchOrg: (orgId: string) => Promise<void>;
};

const OrgContext = createContext<OrgContextValue>({
  currentOrgId: null,
  currentOrgName: null,
  currentOrgSlug: null,
  org: null,
  orgModules: [],
  isLoading: true,
  loadError: null,
  retry: async () => {},
  isSuperAdmin: false,
  allOrgs: [],
  hasModule: () => false,
  switchOrg: async () => {},
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const [org, setOrg] = useState<Organization | null>(null);
  const [orgModules, setOrgModules] = useState<OrgModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);

  // Stable client ref — never recreated on re-render
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const SELECTED_ORG_KEY = 'heliomax_selected_org';

  const loadOrgModules = async (orgId: string) => {
    const { data: modules, error } = await supabase
      .from('organization_modules')
      .select('enabled, config, module:modules(*)')
      .eq('org_id', orgId)
      .eq('enabled', true);

    if (error) console.error('[OrgContext] loadOrgModules error:', error);
    setOrgModules((modules ?? []) as unknown as OrgModule[]);
  };

  const loadOrg = async (targetOrgId?: string) => {
    setIsLoading(true);
    setLoadError(null);

    // A network stall never rejects the underlying promise — only a timeout
    // forces settlement so isLoading can't hang forever on a dead request.
    try {
      await withTimeout(doLoadOrg(targetOrgId), 10000, 'Organization load');
    } catch (err) {
      console.error('[OrgContext] loadOrg failed:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load organization');
    } finally {
      setIsLoading(false);
    }
  };

  const doLoadOrg = async (targetOrgId?: string) => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) console.error('[OrgContext] getUser error:', userError);
      console.log('[OrgContext] user:', user?.email ?? 'none');
      if (!user) return;

      // 1. Check platform_admins
      const { data: platformAdmin, error: adminError } = await supabase
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      console.log('[OrgContext] platformAdmin:', platformAdmin, 'error:', adminError);
      if (adminError) console.error('[OrgContext] platform_admins error:', adminError);

      const isAdmin = !!platformAdmin;
      console.log('[OrgContext] isSuperAdmin:', isAdmin);
      setIsSuperAdmin(isAdmin);

      // 2. Fetch all orgs for super_admin
      let orgs: Organization[] = [];
      if (isAdmin) {
        const { data: allOrgData, error: orgsError } = await supabase
          .from('organizations')
          .select('*')
          .order('name');

        if (orgsError) console.error('[OrgContext] organizations error:', orgsError);
        orgs = (allOrgData ?? []) as unknown as Organization[];
        setAllOrgs(orgs);
      }

      // 3. Resolve which org to load
      // Super admin: use passed targetOrgId, then localStorage, then first org
      // Regular user: use their membership org
      let resolvedOrgId: string | null = targetOrgId ?? null;
      let resolvedOrg: Organization | null = null;

      if (!resolvedOrgId) {
        if (isAdmin && orgs.length > 0) {
          const savedId = typeof window !== 'undefined' ? localStorage.getItem(SELECTED_ORG_KEY) : null;
          const savedOrg = savedId ? orgs.find(o => o.id === savedId) : null;
          resolvedOrgId = savedOrg?.id ?? orgs[0].id;
          resolvedOrg = savedOrg ?? orgs[0];
        } else {
          // Regular user — get from membership (use limit(1) since super_admin may have many)
          const { data: memberships, error: memberError } = await supabase
            .from('organization_members')
            .select('org_id, organizations(*)')
            .eq('user_id', user.id)
            .limit(1);

          if (memberError) console.error('[OrgContext] organization_members error:', memberError);

          const membership = memberships?.[0];
          if (!membership) return;

          resolvedOrgId = membership.org_id;
          resolvedOrg = membership.organizations as unknown as Organization;
        }
      }

      // If we have the orgId but not the org object, fetch it
      if (resolvedOrgId && !resolvedOrg) {
        const found = orgs.find(o => o.id === resolvedOrgId);
        if (found) {
          resolvedOrg = found;
        } else {
          const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', resolvedOrgId)
            .single();

          if (orgError) console.error('[OrgContext] fetch org error:', orgError);
          resolvedOrg = orgData as unknown as Organization;
        }
      }

      setCurrentOrgId(resolvedOrgId);
      setOrg(resolvedOrg);

      if (resolvedOrgId) await loadOrgModules(resolvedOrgId);
  };

  useEffect(() => {
    loadOrg();
  }, []);

  const hasModule = (moduleName: string) =>
    orgModules.some(m => m.module.name === moduleName && m.enabled);

  const switchOrg = async (orgId: string) => {
    if (typeof window !== 'undefined') localStorage.setItem(SELECTED_ORG_KEY, orgId);
    await loadOrg(orgId);
  };

  return (
    <OrgContext.Provider
      value={{
        currentOrgId,
        currentOrgName: org?.name ?? null,
        currentOrgSlug: org?.slug ?? null,
        org,
        orgModules,
        isLoading,
        loadError,
        retry: () => loadOrg(),
        isSuperAdmin,
        allOrgs,
        hasModule,
        switchOrg,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);
