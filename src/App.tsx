// 1. React & Core
import { useEffect, lazy, Suspense } from 'react';
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

// Loading Component
const PageLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-stone-50">
    <div className="w-10 h-10 border-4 border-[#4F5BD5]/20 border-t-[#4F5BD5] rounded-full animate-spin" />
  </div>
);

// Lazy Pages
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Unauthorized = lazy(() => import('./pages/Unauthorized'));
const Activities = lazy(() => import('./pages/Activities'));
const ActivityDetail = lazy(() => import('./pages/ActivityDetail'));
const Profile = lazy(() => import('./pages/Profile'));
const AdminLayout = lazy(() => import('./components/layout/AdminLayout'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Members = lazy(() => import('./pages/admin/Members'));
const ActivitiesAdmin = lazy(() => import('./pages/admin/ActivitiesAdmin'));
const ActivityRegistrations = lazy(() => import('./pages/admin/ActivityRegistrations'));
const ArchivedMembers = lazy(() => import('./pages/admin/ArchivedMembers'));
const AwardsAdmin = lazy(() => import('./pages/admin/AwardsAdmin'));
const InquiriesAdmin = lazy(() => import('./pages/admin/InquiriesAdmin'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));

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
          <Suspense fallback={<PageLoading />}>
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
                    <Route path="/admin/inquiries" element={<InquiriesAdmin />} />
                  </Route>
                </Route>
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </>
  );
}

export default App;
