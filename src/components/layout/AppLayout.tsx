import { useEffect, useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { Home, Activity, User, ShieldCheck, LogIn, LogOut, MessageCircle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../../store/useAuthStore';
import InquiryModal from '../ui/InquiryModal';

export const AppLayout = () => {
  const { fetchAcademicYears } = useAppStore();
  const { currentRole, currentUser, session, signOut } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [inquiryOpen, setInquiryOpen] = useState(false);

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
      { path: '/activities', label: '活動', icon: Activity },
      { path: '/profile', label: 'マイページ', icon: User }
    ] : []),
    ...(currentRole && ['president', 'vice_president', 'treasurer', 'executive'].includes(currentRole)
      ? [{ path: '/admin', label: '管理', icon: ShieldCheck }]
      : []),
  ];

  const subtitles: Record<string, string> = {
    'ホーム': 'Home',
    'ボランティア活動': 'Activities',
    '活動': 'Activities',
    'マイページ': 'My Page',
    '管理コンソール': 'Console',
    '管理': 'Console'
  };

  return (
    <div className="min-h-screen bg-brand-stone-50 font-sans selection:bg-brand-emerald-500/30">
      {!isLoginPage && (
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-brand-stone-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_4px_6px_-2px_rgba(0,0,0,0.05)] transition-all duration-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[4rem] sm:h-[4.5rem] flex items-center justify-between">

            {/* Left Section: Logo */}
            <div className="flex-1 flex items-center justify-start h-full">
              <Link to="/" className="flex items-center gap-1 group transition-all duration-500 hover:brightness-110 h-full">
                <div className="flex h-[75%] transition-transform duration-500 group-hover:translate-x-3">
                  <img
                    src="/ミルクティ-text.png"
                    alt="福祉ボランティア部『ミルクティ』"
                    className="h-full w-auto object-contain"
                  />
                </div>
                <div className="flex items-center justify-center w-14 sm:w-20 h-[75%] transition-all duration-500 group-hover:scale-105 group-hover:rotate-3 relative overflow-hidden">
                  <img src="/logo.png" alt="Logo" className="h-full w-auto object-contain relative z-10" />
                </div>
              </Link>
            </div>

            {/* Center Section: Navigation (Hidden on mobile - uses bottom bar instead) */}
            <nav className="hidden md:flex items-center gap-2 lg:gap-4 shrink-0">
              {navItems.map((nav) => {
                const Icon = nav.icon;
                const isActive = nav.path === '/' ? location.pathname === '/' : location.pathname.startsWith(nav.path);

                return (
                  <Link
                    key={nav.path}
                    to={nav.path}
                    className={`relative px-4 lg:px-5 py-3 transition-all duration-500 group rounded-[1.2rem] flex items-center gap-2 lg:gap-3 overflow-hidden ${isActive
                        ? 'text-[#4F5BD5] bg-[#4F5BD5]/5 shadow-[0_10px_20px_rgba(79,91,213,0.05)]'
                        : 'text-stone-600 hover:text-brand-stone-900 hover:bg-brand-stone-50'
                      }`}
                  >
                    <Icon className={`w-[18px] h-[18px] transition-all duration-500 ${isActive ? 'scale-110 -rotate-6' : 'group-hover:scale-110 group-hover:-rotate-6 text-brand-stone-300 group-hover:text-brand-stone-900'}`} />

                    <div className="flex flex-col items-start leading-none gap-1">
                      <span className="text-[14px] lg:text-[15px] font-black tracking-tight">
                        {nav.label}
                      </span>
                      <span className={`text-[8px] font-black uppercase tracking-[0.2em] transition-opacity duration-500 ${isActive ? 'opacity-80' : 'opacity-40 group-hover:opacity-60'}`}>
                        {subtitles[nav.label] || 'Module'}
                      </span>
                    </div>

                    {isActive && (
                      <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-[#D62976] rounded-full shadow-[0_0_8px_rgba(214,41,118,0.5)] animate-pulse" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Right Section: Auth Buttons */}
            <div className="flex-1 flex items-center justify-end gap-2 sm:gap-3 h-full">
              {/* 問い合わせ Button — visible to everyone except admins, hidden on mobile */}
              {(!currentRole || !['president', 'vice_president', 'treasurer', 'executive'].includes(currentRole)) && (
                <button
                  onClick={() => setInquiryOpen(true)}
                  className="hidden sm:flex items-center gap-2 px-4 lg:px-5 py-2.5 rounded-full font-black text-[11px] tracking-widest uppercase bg-white text-[#D62976] border border-[#D62976]/20 hover:bg-[#D62976] hover:text-white hover:shadow-[0_4px_15px_rgba(214,41,118,0.3)] transition-all duration-500 shadow-sm group"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span className="hidden lg:inline">問い合わせ</span>
                </button>
              )}

              {session ? (
                <button
                  onClick={handleLogout}
                  className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-2xl bg-white border border-brand-stone-200 text-brand-stone-400 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-all duration-300 shadow-sm group"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:translate-x-0.5" />
                </button>
              ) : (
                <Link
                  to="/login"
                  className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-full font-black text-[11px] tracking-widest uppercase bg-white text-[#4F5BD5] border border-[#4F5BD5]/20 hover:bg-[#4F5BD5] hover:text-white hover:shadow-[0_4px_15px_rgba(79,91,213,0.3)] transition-all duration-500 shadow-sm flex items-center gap-2 group"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login</span>
                </Link>
              )}
            </div>
          </div>
        </header>
      )}

      <main className={!isLoginPage ? 'pb-20 md:pb-0' : ''}>
        <Outlet />
      </main>

      {/* ─── MOBILE BOTTOM NAVIGATION BAR ─── */}
      {!isLoginPage && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-stone-200/60 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] safe-area-pb">
          <div className="flex items-center justify-around px-2 h-16">
            {navItems.map((nav) => {
              const Icon = nav.icon;
              const isActive = nav.path === '/' ? location.pathname === '/' : location.pathname.startsWith(nav.path);

              return (
                <Link
                  key={nav.path}
                  to={nav.path}
                  className={`flex flex-col items-center justify-center gap-1 px-3 h-full flex-1 transition-all duration-300 ${isActive ? 'text-[#4F5BD5]' : 'text-stone-400'}`}
                >
                  <div className={`relative p-1.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-[#4F5BD5]/10' : ''}`}>
                    <Icon className={`w-5 h-5 transition-all duration-300 ${isActive ? 'scale-110' : ''}`} />
                    {isActive && (
                      <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#D62976] rounded-full shadow-[0_0_6px_rgba(214,41,118,0.6)]" />
                    )}
                  </div>
                  <span className={`text-[10px] font-black tracking-tight leading-none ${isActive ? 'text-[#4F5BD5]' : 'text-stone-600'}`}>
                    {nav.label}
                  </span>
                </Link>
              );
            })}

            {/* Inquiry button in bottom nav for non-admin mobile users */}
            {(!currentRole || !['president', 'vice_president', 'treasurer', 'executive'].includes(currentRole)) && (
              <button
                onClick={() => setInquiryOpen(true)}
                className="flex flex-col items-center justify-center gap-1 px-3 h-full flex-1 text-stone-400 transition-all"
              >
                <div className="p-1.5 rounded-xl">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <span className="text-[9px] font-black tracking-tight leading-none">問い合わせ</span>
              </button>
            )}
          </div>
        </nav>
      )}

      <InquiryModal isOpen={inquiryOpen} onClose={() => setInquiryOpen(false)} />
    </div>
  );
};
