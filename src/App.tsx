// 1. React & Core
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 2. Internal Stores & Utilities
import { supabase } from './lib/supabase';
import { useAuthStore } from './store/useAuthStore';
import { useAppStore } from './store/useAppStore';

// Layout & Route Guards
import { AppLayout } from './components/layout/AppLayout';
import { RequireAuth } from './components/auth/RequireAuth';
import { RequireRole } from './components/auth/RequireRole';

// Pages
import Home from './pages/Home';
import Login from './pages/Login';
import Unauthorized from './pages/Unauthorized';
import Activities from './pages/Activities';
import ActivityDetail from './pages/ActivityDetail';
import Profile from './pages/Profile';
import AdminLayout from './components/layout/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Members from './pages/admin/Members';
import ActivitiesAdmin from './pages/admin/ActivitiesAdmin';
import ActivityRegistrations from './pages/admin/ActivityRegistrations';
import ArchivedMembers from './pages/admin/ArchivedMembers';
import AwardsAdmin from './pages/admin/AwardsAdmin';
import ChangePassword from './pages/ChangePassword';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: 1,
    },
  },
});

function App() {
  const { setAuth } = useAuthStore();
  const { fetchAcademicYears } = useAppStore();

  useEffect(() => {
    // 1. Initial global app context
    fetchAcademicYears();

    // 2. Initial Auth session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuth(session);
    });

    // 3. Auth Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuth(session);
    });

    return () => subscription.unsubscribe();
  }, [setAuth]);

  return (
    <>
      <Toaster 
        theme="dark" 
        position="bottom-right" 
        toastOptions={{
          style: {
            background: '#1c1917', // brand-stone-900
            border: '1px solid #44403c', // brand-stone-700
            color: '#fafaf9', // brand-stone-50
          }
        }}
      />
      
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Public Layout */}
            <Route element={<AppLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/unauthorized" element={<Unauthorized />} />
              {/* Member Only Routes */}
              <Route element={<RequireAuth />}>
                <Route path="/profile" element={<Profile />} />
                <Route path="/change-password" element={<ChangePassword />} />
                <Route path="/activities" element={<Activities />} />
                <Route path="/activities/:id" element={<ActivityDetail />} />
              </Route>
            </Route>

            {/* Admin & Executive Fullscreen Layout */}
            <Route element={<RequireAuth />}>
              <Route element={<RequireRole allowedRoles={['president', 'vice_president', 'treasurer', 'executive']} />}>
                <Route element={<AdminLayout />}>
                  <Route path="/admin" element={<Dashboard />} />
                  <Route path="/admin/members" element={<Members />} />
                  <Route path="/admin/members/archived" element={<ArchivedMembers />} />
                  <Route path="/admin/activities" element={<ActivitiesAdmin />} />
                  <Route path="/admin/activities/:id" element={<ActivityRegistrations />} />
                  <Route path="/admin/awards" element={<AwardsAdmin />} />
                </Route>
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </>
  );
}

export default App;
