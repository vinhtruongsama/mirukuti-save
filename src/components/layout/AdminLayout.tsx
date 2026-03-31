import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, CalendarDays, LogOut, Home, Menu as MenuIcon, Calendar as CalendarIcon } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { YearSelector } from '../ui/YearSelector';
import { motion } from 'framer-motion';

const ADMIN_NAVIGATION = [
  { name: 'ダッシュボード', to: '/admin', icon: LayoutDashboard },
  { name: 'メンバー管理', to: '/admin/members', icon: Users },
  { name: 'ボランティア活動', to: '/admin/activities', icon: CalendarDays },
];

export default function AdminLayout() {
  const { pathname } = useLocation();
  const { signOut, currentUser } = useAuthStore();
  
  return (
    <div className="flex h-screen bg-[#F8F9FA] overflow-hidden font-sans">
      {/* 1. Refined Sidebar (Light Mode) */}
      <aside className="w-64 bg-white border-r border-brand-stone-100 flex flex-col hidden md:flex shadow-[20px_0_40px_-20px_rgba(0,0,0,0.02)] z-20">
        {/* Section 1: Logo (At the very top) */}
        <div className="p-8 border-b border-brand-stone-50 flex justify-center">
          <Link 
            to="/" 
            className="group block transition-all duration-700"
          >
            <div className="relative group-hover:scale-105 transition-transform duration-700">
               <img 
                 src="/ミルクティ-text.png" 
                 alt="ミルクティ-" 
                 className="w-full max-w-[160px] h-auto object-contain"
               />
               <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
            </div>
          </Link>
        </div>

        {/* Section 2: User Identification (Below Logo) */}
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

        {/* Section 4: Exit (Bottom) */}
        <div className="p-8 border-t border-brand-stone-50">
          <button
            onClick={() => signOut()}
            className="w-full h-12 flex items-center justify-center gap-2 text-[10px] font-black tracking-[0.2em] text-rose-500 hover:bg-rose-50 rounded-xl transition-all uppercase border border-rose-100 shadow-sm"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-white md:bg-[#F8F9FA]">
        {/* 3. Ultra-Minimalist Top Bar (Swapped) */}
        <header className="h-16 bg-white border-b border-brand-stone-100 flex items-center justify-between px-10 shrink-0 z-10 shadow-sm transition-all duration-500">
          {/* Left: Clean Menu Toggle (Previously on Right) */}
          <div className="flex items-center group cursor-pointer lg:scale-110">
             <div className="w-10 h-10 rounded-xl bg-brand-stone-50 border border-brand-stone-100 flex items-center justify-center group-hover:bg-brand-stone-900 group-hover:border-brand-stone-900 transition-all duration-500 shadow-sm group-active:scale-95">
                <MenuIcon className="w-5 h-5 text-brand-stone-600 group-hover:text-white" />
             </div>
          </div>

          {/* Right: Direct Year Access (Previously on Left) */}
          <div className="flex items-center group">
             <div className="scale-y-90 origin-right">
                <YearSelector variant="light" />
             </div>
          </div>
        </header>

        {/* 4. Page Content with Viewport Management */}
        <div className="flex-1 overflow-auto p-6 md:p-8 lg:p-10">
          <div className="max-w-7xl mx-auto h-full">
             <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
