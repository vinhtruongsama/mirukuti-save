import { useState } from 'react';
// 1. React & Routing
import { Outlet, Link, useLocation } from 'react-router-dom';

// 2. Third-party Libraries (Icons)
import { 
  LayoutDashboard, 
  Users, 
  CalendarDays, 
  LogOut, 
  X,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// 3. Internal Components & Stores
import { useAuthStore } from '../../store/useAuthStore';
import { YearSelector } from '../ui/YearSelector';

const ADMIN_NAVIGATION = [
  { name: 'ダッシュボード', to: '/admin', icon: LayoutDashboard },
  { name: 'メンバー管理', to: '/admin/members', icon: Users },
  { name: 'ボランティア活動', to: '/admin/activities', icon: CalendarDays },
];

export default function AdminLayout() {
  const { pathname } = useLocation();
  const { signOut, currentUser } = useAuthStore();
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  
  return (
    <div className="flex h-screen bg-[#F8F9FA] overflow-hidden font-sans relative">
      
      {/* Re-opening Trigger: Red Triangle / Chevron */}
      <AnimatePresence>
        {!isSidebarVisible && (
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onClick={() => setIsSidebarVisible(true)}
            className="absolute left-0 top-32 z-50 w-8 h-20 bg-[#D62976] hover:w-10 transition-all flex items-center justify-start pl-1 shadow-xl shadow-[#D62976]/20 active:scale-95 group"
            style={{ clipPath: 'polygon(0 0, 100% 50%, 0 100%)' }}
          >
            <ChevronRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Mobile Sidebar Backdrop Overlay */}
      <AnimatePresence>
        {isSidebarVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarVisible(false)}
            className="lg:hidden absolute inset-0 bg-black/20 backdrop-blur-sm z-[15]"
          />
        )}
      </AnimatePresence>

      <div className="flex w-full h-full overflow-hidden">
        {/* 1. Refined Sidebar (Synchronized Animation) */}
        <motion.aside 
          animate={{ 
            width: isSidebarVisible ? 280 : 0,
            opacity: isSidebarVisible ? 1 : 0,
            x: isSidebarVisible ? 0 : -280
          }}
          transition={{ type: "spring", damping: 30, stiffness: 250 }}
          className="bg-white border-r border-brand-stone-100 flex flex-col shadow-[20px_0_40px_-20px_rgba(0,0,0,0.02)] z-20 shrink-0 overflow-hidden absolute lg:relative h-full"
        >
          {/* Close Button (X) */}
          <button
            onClick={() => setIsSidebarVisible(false)}
            className="absolute top-0 right-0 w-12 h-12 bg-[#FF4D4D] hover:bg-[#FF3333] text-white flex items-center justify-center transition-all z-30 shadow-lg active:scale-90"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="w-[280px] lg:w-64 flex flex-col h-full flex-1">
            {/* Section 1: Logo */}
            <div className="p-8 border-b border-brand-stone-50 flex justify-center">
              <Link to="/" className="group block transition-all duration-700">
                <div className="relative group-hover:scale-105 transition-transform duration-700">
                   <img src="/ミルクティ-text.png" alt="ミルクティ-" className="w-full max-w-[160px] h-auto object-contain" />
                </div>
              </Link>
            </div>

            {/* Section 2: User Identification */}
            <div className="px-10 py-4 border-b border-brand-stone-50">
               <span className="text-[15px] font-black text-brand-stone-900 tracking-tight block">
                  {currentUser?.full_name || 'System Admin'}
               </span>
               <span className="text-[9px] font-black text-[#4F5BD5] uppercase tracking-widest block mt-1 opacity-60">
                  Administrator Access
               </span>
            </div>

            {/* Section 3: Navigation Functions */}
            <nav className="flex-1 p-6 space-y-2 overflow-y-auto mt-4">
              {ADMIN_NAVIGATION.map((item) => {
                const isActive = pathname === item.to || (item.to !== '/admin' && pathname.startsWith(item.to));
                const Icon = item.icon;

                return (
                  <Link
                    key={item.name}
                    to={item.to}
                    className={`flex items-center gap-4 px-5 py-4 rounded-2xl text-[14px] font-black transition-all group ${isActive
                        ? 'bg-[#4F5BD5] text-white shadow-xl shadow-[#4F5BD5]/20 scale-[1.02]'
                        : 'text-brand-stone-400 hover:text-brand-stone-900 hover:bg-brand-stone-50'
                      }`}
                  >
                    <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-white' : 'text-brand-stone-300 group-hover:text-brand-stone-900'}`} />
                    <span className="tracking-tight">{item.name}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Section 4: Exit */}
            <div className="p-8 border-t border-brand-stone-50">
              <button
                onClick={() => signOut()}
                className="w-full h-12 flex items-center justify-center gap-2 text-[10px] font-black tracking-[0.2em] text-rose-500 hover:bg-rose-50 rounded-xl transition-all uppercase border border-rose-100 shadow-sm"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>
        </motion.aside>

        {/* 2. Main Content Area (Synchronized Layout) */}
        <motion.main 
          layout
          transition={{ type: "spring", damping: 30, stiffness: 250 }}
          className="flex-1 flex flex-col h-full overflow-hidden bg-white md:bg-[#F8F9FA]"
        >
          {/* 3. Minimalist Top Bar */}
          <motion.header 
            layout
            className="h-16 bg-white border-b border-brand-stone-100 flex items-center justify-between px-6 lg:px-10 shrink-0 z-10 shadow-sm"
          >
            {/* Left: Clean Logo/Brand Context */}
            <div className="flex items-center">
               <span className="text-[13px] font-black uppercase tracking-[0.2em] text-brand-stone-900 hidden sm:block">Management Console</span>
            </div>

            {/* Right: Year Selector */}
            <div className="flex items-center group">
               <div className="scale-y-90 origin-right">
                  <YearSelector variant="light" />
               </div>
            </div>
          </motion.header>

          {/* 4. Page Content with Viewport Management */}
          <div className="flex-1 overflow-auto p-6 md:p-8 lg:p-10 scrollbar-thin scrollbar-thumb-brand-stone-100">
            <div className="max-w-7xl mx-auto h-full">
               <Outlet />
            </div>
          </div>
        </motion.main>
      </div>
    </div>
  );
}
