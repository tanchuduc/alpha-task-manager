import { Layout } from '@/shared/antd-imports';
import { Outlet, useLocation } from 'react-router-dom';
import { memo, useMemo } from 'react';

import Navbar from '@/features/navbar/navbar';
import { useAppSelector } from '../hooks/useAppSelector';
import { ImportProgressNotifier } from '@/components/imports/ImportProgressNotifier';
import { TaskExportProgressNotifier } from '@/components/projects/task-export/TaskExportProgressNotifier';
import { NAV_RAIL_BG_DARK, NAV_RAIL_BG_LIGHT } from '@/components/nav-rail/nav-rail-constants';
import { PROJECTS_RAIL_SUB_ROUTES, FINANCE_RAIL_SUB_ROUTES } from '@/features/navigation/nav-registry';

// Single shared header for every authenticated section (main app, reporting,
// client portal) so there is exactly one <Navbar/> mount and one header
// height (52px) instead of each section re-implementing its own.
const AppShellLayout = memo(() => {
  const themeMode = useAppSelector(state => state.themeReducer.mode);
  const location = useLocation();

  // Any route nested under /alpha/projects/ that the rail itself owns —
  // checked against the registry rather than hardcoded paths, so this can't
  // silently stop matching a route that moved under Projects. Excludes
  // /alpha/projects/:projectId, whose segment won't be a known item key.
  const isProjectsSubRoute = useMemo(() => {
    const prefix = '/alpha/projects/';
    if (!location.pathname.startsWith(prefix)) return false;
    const segment = location.pathname.slice(prefix.length).split('/')[0];
    return PROJECTS_RAIL_SUB_ROUTES.has(segment);
  }, [location.pathname]);

  // Same idea as isProjectsSubRoute above, for Finance's own SimpleRailLayout
  // sub-routes (Profitability, Budgets, Invoices, ...).
  const isFinanceSubRoute = useMemo(() => {
    const prefix = '/alpha/finance/';
    if (!location.pathname.startsWith(prefix)) return false;
    const segment = location.pathname.slice(prefix.length).split('/')[0];
    return FINANCE_RAIL_SUB_ROUTES.has(segment);
  }, [location.pathname]);

  // Every section below mounts its own left rail directly below the header,
  // styled to share its background — the header must match that color
  // exactly so the two read as one unified panel rather than two adjacent
  // surfaces with a visible seam between them.
  const hasLeftRail = useMemo(
    () =>
      location.pathname === '/alpha/home' ||
      location.pathname.endsWith('/home') ||
      location.pathname.startsWith('/alpha/home/') ||
      location.pathname.includes('/alpha/planner') ||
      location.pathname.includes('/alpha/schedule') ||
      location.pathname.includes('/alpha/reporting') ||
      location.pathname.includes('/alpha/client-portal') ||
      location.pathname === '/alpha/projects' ||
      (location.pathname.endsWith('/projects') && !location.pathname.includes('/admin-center/')) ||
      isProjectsSubRoute ||
      location.pathname.includes('/alpha/team-lead-reports') ||
      location.pathname === '/alpha/finance' ||
      location.pathname.endsWith('/finance') ||
      isFinanceSubRoute,
    [location.pathname, isProjectsSubRoute, isFinanceSubRoute]
  );
  const railPanelBg = themeMode === 'dark' ? NAV_RAIL_BG_DARK : NAV_RAIL_BG_LIGHT;

  return (
    <Layout className="min-h-screen">
      <ImportProgressNotifier />
      <TaskExportProgressNotifier />

      <Layout.Header
        className={`sticky top-0 z-[999] flex items-center p-0 ${
          hasLeftRail ? '' : themeMode === 'dark' ? 'shadow-md border-b border-[#303030]' : 'shadow-md shadow-[#18181811]'
        }`}
        style={{
          height: 52,
          lineHeight: '52px',
          ...(hasLeftRail ? { background: railPanelBg } : {}),
        }}
      >
        <Navbar />
      </Layout.Header>

      <Outlet />
    </Layout>
  );
});

AppShellLayout.displayName = 'AppShellLayout';

export default AppShellLayout;
