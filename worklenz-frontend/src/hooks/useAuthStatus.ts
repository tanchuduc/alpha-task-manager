import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthService } from '@/hooks/useAuth';
import { useAppSelector } from '@/hooks/useAppSelector';
import { ISUBSCRIPTION_TYPE } from '@/shared/constants';

const isFreePlanSession = (session: {
  subscription_type?: string;
  subscription_status?: string;
} | null | undefined) =>
  session?.subscription_type === ISUBSCRIPTION_TYPE.FREE ||
  session?.subscription_status?.toLowerCase() === 'free';

export const useAuthStatus = () => {
  const authService = useAuthService();
  const location = useLocation();
  // Recompute after verify/login replaces the session. authService itself is stable,
  // so a plan change (trial -> free, Google signup) would otherwise stay stale.
  const authUser = useAppSelector(state => state.auth.user);

  const status = useMemo(() => {
    try {
      if (!authService || typeof authService.isAuthenticated !== 'function') {
        return {
          isAuthenticated: false,
          isLicenseExpired: false,
          isAdmin: false,
          isFreePlan: false,
          isSetupComplete: false,
        };
      }

      const isAuthenticated = authService.isAuthenticated();
      if (!isAuthenticated) {
        return {
          isAuthenticated: false,
          isLicenseExpired: false,
          isAdmin: false,
          isFreePlan: false,
          isSetupComplete: false,
        };
      }

      const currentSession = authService.getCurrentSession();
      // In Alpha Work internal edition, all workspaces have full features and never expire
      const isFreePlan = false;
      const isAdmin = authService.isOwnerOrAdmin();
      const isSetupComplete = currentSession?.setup_completed ?? false;

      return {
        isAuthenticated,
        isLicenseExpired: false,
        isAdmin,
        isFreePlan: false,
        isSetupComplete,
      };
    } catch (error) {
      console.error('Error in useAuthStatus:', error);
      return {
        isAuthenticated: false,
        isLicenseExpired: false,
        isAdmin: false,
        isFreePlan: false,
        isSetupComplete: false,
      };
    }
  }, [authService, authUser]);

  return { ...status, location };
};
