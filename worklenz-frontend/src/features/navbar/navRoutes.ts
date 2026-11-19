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
    path: '/worklenz/home',
    adminOnly: false,
    freePlanFeature: true,
    guestExcluded: true, // Hide Home for guest-only users
  },
  {
    name: 'projects',
    path: '/worklenz/projects',
    adminOnly: false,
    freePlanFeature: true,
  },
  {
    name: 'planner',
    path: '/worklenz/planner',
    adminOnly: true,
    freePlanFeature: false,
  },
  // Client portal is disabled for Alpha Work internal edition
  // {
  //   name: 'client-portal',
  //   path: '/worklenz/client-portal',
  //   adminOnly: true,
  //   freePlanFeature: false,
  //   selfHostedExcluded: true,
  // },
  {
    name: 'finance',
    path: '/worklenz/finance',
    adminOnly: true,
    freePlanFeature: false,
  },
  {
    name: 'reporting',
    // Reporting & Analytics — unlocked by "View reports" in the default permission scheme.
    // Classic reports remain at /worklenz/reporting/overview etc. under the same guard.
    path: '/worklenz/reporting/analytics',
    adminOnly: false,
    requiredPermission: ORGANIZATION_PERMISSIONS.VIEW_REPORTS,
    freePlanFeature: false,
  },
  {
    name: 'my-team-reports',
    path: '/worklenz/team-lead-reports',
    adminOnly: false,
    freePlanFeature: true,
    teamLeadOnly: true,
  },
  ...getAddonSlotItems('navigationItems').map(item => ({
    name: item.key,
    path: item.path || `/worklenz/${item.key}`,
    adminOnly: item.adminOnly ?? true,
    freePlanFeature: item.freePlanFeature ?? false,
    guestExcluded: item.guestExcluded ?? true,
  })),
];
