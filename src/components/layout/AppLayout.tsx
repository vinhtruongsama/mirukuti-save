import { useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../../store/useAuthStore';

export const AppLayout = () => {
  const { t } = useTranslation();
  const { fetchAcademicYears } = useAppStore();
  const { currentRole, currentUser, signOut } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchAcademicYears();
  }, [fetchAcademicYears]);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const isLoginPage = location.pathname === '/login';

  return (
    <div className="min-h-screen bg-brand-stone-50 font-sans selection:bg-brand-emerald-500/30">
      {!isLoginPage && (
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-brand-stone-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_4px_6px_-2px_rgba(0,0,0,0.05)] transition-all duration-500">
          <div className="max-w-7xl mx-auto px-6 h-[4.5rem] flex items-center justify-between">
            
            {/* Left Section: Logo (Flex-1 to push nav to center) */}
            <div className="flex-1 flex items-center justify-start h-full">
              <Link to="/" className="flex items-center gap-1 group transition-all duration-500 hover:brightness-110 h-full">
                <div className="flex h-[85%] transition-transform duration-500 group-hover:translate-x-3">
                  <img
                    src="/ミルクティ-text.png"
                    alt="福祉ボランティア部『ミルクティ』"
                    className="h-full w-auto object-contain"
                  />
                </div>
                <div className="flex items-center justify-center w-24 h-[85%] transition-all duration-500 group-hover:scale-105 group-hover:rotate-3 relative overflow-hidden">
                  <img src="/logo.png" alt="Logo" className="h-full w-auto object-contain relative z-10" />
                </div>
              </Link>
            </div>

            {/* Center Section: Navigation (Perfectly Centered) */}
            <nav className="hidden md:flex items-center gap-6 lg:gap-10 shrink-0">
              {[
                { path: '/', label: t('nav.home') },
                { path: '/activities', label: t('nav.activities') },
              ].map((nav) => {
                const isActive = nav.path === '/' ? location.pathname === '/' : location.pathname.startsWith(nav.path);
                return (
                  <Link 
                    key={nav.path}
                    to={nav.path} 
                    className={`relative px-4 py-2 text-sm font-black tracking-widest uppercase transition-all duration-300 group rounded-xl transform-gpu ${
                      isActive
                        ? 'text-[#4F5BD5] scale-100' 
                        : 'text-brand-stone-400 hover:text-brand-stone-900'
                    }`}
                  >
                    {nav.label}
                    <div className={`absolute -bottom-1 left-0 w-full h-3 overflow-hidden transition-all duration-300 transform-gpu ${
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 group-hover:opacity-100'
                    }`}>
                      <div className="absolute top-[-100%] left-0 w-full h-[200%] border-b-4 border-[#4F5BD5] rounded-[100%] shadow-[0_4px_15px_-2px_rgba(79,91,213,0.3)]" />
                    </div>
                  </Link>
                );
              })}
            </nav>

            {/* Right Section: Action Buttons (Flex-1 to push nav to center) */}
            <div className="flex-1 flex items-center justify-end gap-3 md:gap-4 h-full">
              {currentRole === 'admin' && (
                <Link 
                  to="/admin" 
                  className="hidden sm:block px-6 py-2.5 rounded-full font-black text-sm bg-brand-stone-100 text-brand-stone-900 hover:bg-[#4F5BD5] hover:text-white transition-all duration-300 shadow-sm border border-brand-stone-200"
                >
                  {t('nav.adminManage')}
                </Link>
              )}
              
              {currentUser ? (
                <button
                  onClick={handleLogout}
                  className="px-6 py-2.5 rounded-full font-black text-xs md:text-sm bg-brand-stone-50 text-brand-stone-500 border border-brand-stone-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all duration-300 shadow-sm"
                >
                  {t('nav.logout')}
                </button>
              ) : (
                <Link
                  to="/login"
                  className="px-6 md:px-8 py-2.5 rounded-full font-black text-sm bg-white text-[#4F5BD5] border border-[#4F5BD5]/20 hover:bg-[#4F5BD5] hover:text-white hover:shadow-[0_4px_15px_rgba(79,91,213,0.3)] transition-all duration-500 shadow-sm"
                >
                  {t('nav.login')}
                </Link>
              )}
            </div>
          </div>
        </header>
      )}

      <main>
        <Outlet />
      </main>
    </div>
  );
};
