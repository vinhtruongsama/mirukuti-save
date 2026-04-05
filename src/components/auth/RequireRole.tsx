import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useAppStore } from '../../store/useAppStore';
import type { ClubMembership } from '../../types';

interface RequireRoleProps {
  allowedRoles: ClubMembership['role'][];
}

export const RequireRole = ({ allowedRoles }: RequireRoleProps) => {
  const { currentRole, isLoading: isAuthLoading } = useAuthStore();
  const { selectedYear, isLoading: isAppLoading } = useAppStore();

  // Show generic loader while auth OR basic app context (years) is loading
  if (isAuthLoading || (isAppLoading && !selectedYear)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-stone-900">
        <div className="w-10 h-10 border-4 border-brand-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // If we have finished loading but selectedYear is missing, something is wrong
  // (Maybe no academic years defined in DB, but better to wait than redirect prematurely)
  if (!selectedYear) {
     return (
      <div className="min-h-screen flex items-center justify-center bg-brand-stone-900">
         <p className="text-white text-sm font-black tracking-widest uppercase">Initializing Environment...</p>
      </div>
     );
  }

  // If user doesn't have a role, or role is not in allowed list
  if (!currentRole || !allowedRoles.includes(currentRole)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
};
