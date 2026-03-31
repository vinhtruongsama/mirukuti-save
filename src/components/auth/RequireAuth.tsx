import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

export const RequireAuth = () => {
  const { session, isLoading, isTemporaryPassword } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-stone-900">
        <div className="w-6 h-6 border-2 border-brand-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session) {
    // Redirect to login but save the attempted url
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Redirect to change password if temporary
  if (isTemporaryPassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" state={{ message: '続行するにはパスワードを変更する必要があります' }} replace />;
  }

  return <Outlet />;
};
