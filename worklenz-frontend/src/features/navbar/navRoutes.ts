import { getAddonSlotItems } from '@/addons/addon-slots';
import {
  ORGANIZATION_PERMISSIONS,
  OrganizationPermission,
} from '@/types/admin-center/permission-schemes.types';

export type NavRoutesType = {
  name: string;
  path: string;
  adminOnly: boolean;
  requiredPermission?: OrganizationPermission;
  freePlanFeature?: boolean;
  selfHostedExcluded?: boolean;
  teamLeadOnly?: boolean;
  guestExcluded?: boolean; // Hide for guest-only users
};

// In Alpha Work internal edition, no routes are gated for free plan
export const isRouteGatedForFreePlan = (_route: NavRoutesType, _isFreePlan: boolean): boolean =>
  false;

export const navRoutes: NavRoutesType[] = [
  {
    name: 'home',
    path: '/alpha/home',
    adminOnly: false,
    freePlanFeature: true,
    guestExcluded: true, // Hide Home for guest-only users
  },
  {
    name: 'projects',
    path: '/alpha/projects',
    adminOnly: false,
    freePlanFeature: true,
  },
  {
    name: 'planner',
    path: '/alpha/planner',
    adminOnly: true,
    freePlanFeature: false,
  },
  // Client portal is disabled for Alpha Work internal edition
  // {
  //   name: 'client-portal',
  //   path: '/alpha/client-portal',
  //   adminOnly: true,
  //   freePlanFeature: false,
  //   selfHostedExcluded: true,
  // },
  {
    name: 'finance',
    path: '/alpha/finance',
    adminOnly: true,
    freePlanFeature: false,
  },
  {
    name: 'reporting',
    // Reporting & Analytics — unlocked by "View reports" in the default permission scheme.
    // Classic reports remain at /alpha/reporting/overview etc. under the same guard.
    path: '/alpha/reporting/analytics',
    adminOnly: false,
    requiredPermission: ORGANIZATION_PERMISSIONS.VIEW_REPORTS,
    freePlanFeature: false,
  },
  {
    name: 'my-team-reports',
    path: '/alpha/team-lead-reports',
    adminOnly: false,
    freePlanFeature: true,
    teamLeadOnly: true,
  },
  ...getAddonSlotItems('navigationItems').map(item => ({
    name: item.key,
    path: item.path || `/alpha/${item.key}`,
    adminOnly: item.adminOnly ?? true,
    freePlanFeature: item.freePlanFeature ?? false,
    guestExcluded: item.guestExcluded ?? true,
  })),
];
