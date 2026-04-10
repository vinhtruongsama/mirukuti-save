import { useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { Home, Activity, User, ShieldCheck, LogIn, LogOut } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../../store/useAuthStore';

export const AppLayout = () => {
  const { fetchAcademicYears } = useAppStore();
  const { currentRole, currentUser, session, signOut } = useAuthStore();
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

  const navItems = [
    { path: '/', label: 'ホーム', icon: Home },
    ...(currentUser ? [
      { path: '/activities', label: 'ボランティア活動', icon: Activity },
      { path: '/profile', label: 'マイページ', icon: User }
    ] : []),
    ...(currentRole && ['president', 'vice_president', 'treasurer', 'executive'].includes(currentRole) 
      ? [{ path: '/admin', label: '管理コンソール', icon: ShieldCheck }] 
      : []),
  ];

  return (
    <div className="min-h-screen bg-brand-stone-50 font-sans selection:bg-brand-emerald-500/30">
      {!isLoginPage && (
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-brand-stone-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_4px_6px_-2px_rgba(0,0,0,0.05)] transition-all duration-500">
          <div className="max-w-7xl mx-auto px-6 h-[4.5rem] flex items-center justify-between">
            
            {/* Left Section: Logo */}
            <div className="flex-1 flex items-center justify-start h-full">
              <Link to="/" className="flex items-center gap-1 group transition-all duration-500 hover:brightness-110 h-full">
                <div className="flex h-[80%] transition-transform duration-500 group-hover:translate-x-3">
                  <img
                    src="/ミルクティ-text.png"
                    alt="福祉ボランティア部『ミルクティ』"
                    className="h-full w-auto object-contain"
                  />
                </div>
                <div className="flex items-center justify-center w-20 h-[80%] transition-all duration-500 group-hover:scale-105 group-hover:rotate-3 relative overflow-hidden">
                  <img src="/logo.png" alt="Logo" className="h-full w-auto object-contain relative z-10" />
                </div>
              </Link>
            </div>

            {/* Center Section: Navigation */}
            <nav className="hidden md:flex items-center gap-2 lg:gap-4 shrink-0">
              {navItems.map((nav) => {
                const Icon = nav.icon;
                const isActive = nav.path === '/' ? location.pathname === '/' : location.pathname.startsWith(nav.path);
                
                // Map labels to English subtitles for modular modern look
                const subtitles: Record<string, string> = {
                  'ホーム': 'Home',
                  'ボランティア活動': 'Activities',
                  'マイページ': 'My Page',
                  '管理コンソール': 'Console'
                };

                return (
                  <Link 
                    key={nav.path}
                    to={nav.path} 
                    className={`relative px-5 py-3 transition-all duration-500 group rounded-[1.2rem] flex items-center gap-3 overflow-hidden ${
                      isActive
                        ? 'text-[#4F5BD5] bg-[#4F5BD5]/5 shadow-[0_10px_20px_rgba(79,91,213,0.05)]' 
                        : 'text-brand-stone-400 hover:text-brand-stone-900 hover:bg-brand-stone-50'
                    }`}
                  >
                    <Icon className={`w-[18px] h-[18px] transition-all duration-500 ${isActive ? 'scale-110 -rotate-6' : 'group-hover:scale-110 group-hover:-rotate-6 text-brand-stone-300 group-hover:text-brand-stone-900'}`} />
                    
                    <div className="flex flex-col items-start leading-none gap-1">
                      <span className="text-[14px] font-black tracking-tight">
                        {nav.label}
                      </span>
                      <span className={`text-[8px] font-black uppercase tracking-[0.2em] transition-opacity duration-500 ${isActive ? 'opacity-60' : 'opacity-20 group-hover:opacity-40'}`}>
                        {subtitles[nav.label] || 'Module'}
                      </span>
                    </div>

                    {/* Minimalist modern indicator dot */}
                    {isActive && (
                      <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-[#D62976] rounded-full shadow-[0_0_8px_rgba(214,41,118,0.5)] animate-pulse" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Right Section: Auth Buttons */}
            <div className="flex-1 flex items-center justify-end gap-3 h-full">
              {session ? (
                <button
                  onClick={handleLogout}
                  className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-brand-stone-200 text-brand-stone-400 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-all duration-300 shadow-sm group"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                </button>
              ) : (
                <Link
                  to="/login"
                  className="px-6 py-2.5 rounded-full font-black text-[11px] tracking-widest uppercase bg-white text-[#4F5BD5] border border-[#4F5BD5]/20 hover:bg-[#4F5BD5] hover:text-white hover:shadow-[0_4px_15px_rgba(79,91,213,0.3)] transition-all duration-500 shadow-sm flex items-center gap-2 group"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login</span>
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
