import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import type { ClubMembership } from '../../types';

interface RequireRoleProps {
  allowedRoles: ClubMembership['role'][];
}

export const RequireRole = ({ allowedRoles }: RequireRoleProps) => {
  const { currentRole, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-stone-900">
        <div className="w-6 h-6 border-2 border-brand-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // If user doesn't have a role, or role is not in allowed list
  if (!currentRole || !allowedRoles.includes(currentRole)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
};
