import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function Home() {
  const { session, currentRole } = useAuthStore();

  return (
    <div className="flex flex-col min-h-screen bg-white">

      {/* 1. Hero Section */}
      <section className="relative min-h-screen flex flex-col justify-center items-center overflow-hidden bg-white">
        {/* Background with Light/Faded Overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src="/sky-lager.jpg"
            alt="Home Background"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/10 transition-opacity" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        </div>

        <div className="relative z-10 w-full h-full flex items-start lg:items-center justify-center p-[6%] lg:p-[10%] pt-14 lg:pt-0">
          <div className="w-full max-w-[1400px] flex flex-col xl:grid xl:grid-cols-[1.5fr_1fr] gap-6 xl:gap-16 items-center">
            
            {/* Mascot + Action Group (Now at Top on Mobile/Tablet) */}
            <div className="flex flex-col items-center xl:items-end justify-center w-full max-w-sm xl:max-w-none order-1 xl:order-2">
              <motion.div
                animate={{
                  scale: [1, 1.03, 1],
                  y: [0, -8, 0],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="relative w-36 h-36 sm:w-48 sm:h-48 xl:w-[240px] xl:h-[240px] mb-8 xl:mb-12"
              >
                <img
                  src="/logo-sitdown.png"
                  alt="Mascot Logo"
                  className="w-full h-full object-contain drop-shadow-[0_25px_50px_rgba(79,91,213,0.3)]"
                />
                <div className="absolute inset-0 bg-[#4F5BD5]/10 blur-[100px] -z-10 rounded-full" />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col gap-3 w-full"
              >
                {session && (
                  <Link 
                    to="/activities" 
                    className="w-full px-8 py-4 bg-white hover:bg-stone-50 text-[#D62976] font-black text-lg xl:text-xl rounded-2xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-black/5 flex items-center justify-center no-underline border border-[#D62976]/10"
                  >
                    活動を見る
                  </Link>
                )}

                <Link 
                  to={session ? "/profile" : "/login"} 
                  className="w-full px-8 py-4 bg-[#4F5BD5] hover:bg-[#3D4AB5] text-white font-black text-lg xl:text-xl rounded-2xl transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-[#4F5BD5]/20 flex items-center justify-center no-underline border border-white/20"
                >
                  {session ? "マイページ" : "今すぐ登録"}
                </Link>

                {session && currentRole && ['president', 'vice_president', 'treasurer', 'executive'].includes(currentRole) && (
                  <Link 
                    to="/admin" 
                    className="w-full px-8 py-4 bg-gradient-to-r from-[#FEDA75] to-[#FFD700] text-[#0A0F1D] font-black text-lg xl:text-xl rounded-2xl transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-stone-900/10 flex items-center justify-center no-underline border border-white/40 group/admin"
                  >
                    <span className="group-hover/admin:tracking-widest transition-all duration-500">全て管理</span>
                  </Link>
                )}
              </motion.div>
            </div>

            {/* Cinematic Typography (Bottom on Mobile/Tablet) */}
            <div className="flex flex-col gap-4 text-center xl:text-left items-center xl:items-start w-full order-2 xl:order-1">
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl sm:text-5xl md:text-6xl xl:text-[5.2rem] font-black tracking-tighter text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.5)] leading-[1.2] xl:leading-[1.2] whitespace-nowrap"
              >
                ボランティアを通じて<br />
                <span className="bg-gradient-to-r from-[#FEDA75] via-[#D62976] to-[#4F5BD5] bg-clip-text text-transparent drop-shadow-[0_4px_12px_rgba(0,0,0,0.2)]">新しい出会い</span>
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.8 }}
                transition={{ delay: 0.5 }}
                className="text-white/70 text-xs sm:text-sm md:text-lg font-black tracking-[0.3em] uppercase"
              >
                Volunteer Club Management System
              </motion.p>
            </div>

          </div>
        </div>
      </section>

      {/* 5. Harmonized Cinematic Footer */}
      <footer className="relative bg-[#050810] pt-48 pb-20 px-6 overflow-hidden">
        {/* Cinematic Brand Glows */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[80%] bg-[#D62976]/15 blur-[180px] rounded-full" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[80%] bg-[#4F5BD5]/15 blur-[180px] rounded-full" />
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#FEDA75]/30 to-transparent" />
        </div>

        <div className="max-w-7xl mx-auto relative z-10 flex flex-col items-center text-center">

          {/* Branding & Logo Area (Refined Colors) */}
          <div className="space-y-16 w-full max-w-4xl flex flex-col items-center">
            <Link to="/" className="flex flex-col items-center gap-10 group">
              <div className="relative">
                <div className="absolute -inset-6 bg-[#4F5BD5]/30 rounded-[2.5rem] group-hover:bg-[#D62976]/40 transition-all duration-700 blur-2xl" />
                <div className="relative w-28 h-28 bg-white rounded-[2.2rem] flex items-center justify-center border-2 border-white shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] transition-all duration-500 group-hover:scale-105 active:scale-95 group-hover:rotate-6">
                  <img src="/logo.png" alt="Logo" className="w-full h-full object-contain p-4" />
                </div>
              </div>
              <div className="flex flex-col items-center space-y-3">
                <img src="/ミルクティ-text.png" alt="福祉ボランティア部『ミルクティ』" className="h-14 w-auto object-contain transition-all group-hover:brightness-125" />
                <span className="text-[12px] font-black tracking-[0.6em] text-[#FEDA75] uppercase opacity-90 drop-shadow-[0_2px_10px_rgba(254,218,117,0.3)]">Volunteer Community</span>
              </div>
            </Link>

            <div className="space-y-8">
              <h3 className="text-4xl md:text-5xl lg:text-[72px] font-black text-white leading-[1.2] tracking-tighter">
                新しい自分と出会う、<br />
                <span className="bg-gradient-to-r from-[#FEDA75] to-[#D62976] bg-clip-text text-transparent">温かなコミュニティ。</span>
              </h3>
              <p className="text-lg md:text-2xl text-white/40 leading-relaxed font-medium max-w-2xl mx-auto">
                私たちは、地域社会への貢献と一人ひとりの成長を、<br />
                日々のボランティア活動を通じて大切にサポートしています。
              </p>
            </div>
          </div>

          {/* Social Card (Premium Brand Integration) */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-24 relative p-10 md:p-14 rounded-[3.5rem] bg-white/[0.02] border border-white/5 overflow-hidden group w-full max-w-xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)]"
          >
            {/* Animated Brand Pulse Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#4F5BD5]/5 via-transparent to-[#D62976]/5 opacity-50" />
            <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-[#833AB4] via-[#C13584] to-[#E1306C] opacity-[0.12] blur-[80px] -mr-40 -mt-40 group-hover:opacity-20 transition-all duration-1000" />

            <div className="relative z-10 flex flex-col items-center gap-12">
              <div className="relative w-36 h-36 shrink-0">
                <div className="absolute inset-0 bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] blur-[50px] opacity-20 rounded-full group-hover:opacity-40 group-hover:scale-125 transition-all duration-1000" />
                <img
                  src="/logo-hey.png"
                  alt="Mascot"
                  className="w-full h-full object-contain relative z-10 transition-all duration-700 group-hover:scale-110 group-hover:-rotate-12"
                />
              </div>
              <div className="space-y-8">
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-black tracking-[.5em] text-[#FEDA75] uppercase opacity-60">Join the story</span>
                  <h4 className="text-3xl md:text-4xl font-black text-white tracking-tight">公式インスタグラム</h4>
                </div>
                <a
                  href="https://www.instagram.com/umds_mirukuti/?hl=en"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-5 px-14 py-6 rounded-3xl bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white hover:brightness-110 transition-all font-black text-[15px] shadow-[0_20px_50px_rgba(214,41,118,0.4)] group-hover:scale-105 active:scale-95"
                >
                  <div className="p-2.5 bg-white/20 rounded-xl">
                    <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                    </svg>
                  </div>
                  <span className="tracking-widest">@umds_mirukuti</span>
                </a>
              </div>
            </div>
          </motion.div>

          {/* Centered Premium Navigation */}
          <div className="mt-24 w-full max-w-3xl">
            <div className="grid grid-cols-2 gap-12 md:gap-32">
              <div className="space-y-10">
                <h4 className="text-[12px] font-black tracking-[0.5em] text-white/20 uppercase border-b border-white/5 pb-4">Explore</h4>
                <ul className="space-y-8">
                  <li><Link to="/" className="text-xl md:text-2xl font-bold text-white/40 hover:text-[#FEDA75] transition-all hover:translate-y-[-2px] inline-block">ホーム</Link></li>
                  {session && (
                    <li><Link to="/activities" className="text-xl md:text-2xl font-bold text-white/40 hover:text-[#D62976] transition-all hover:translate-y-[-2px] inline-block">活動一覧</Link></li>
                  )}
                </ul>
              </div>
              <div className="space-y-10">
                <h4 className="text-[12px] font-black tracking-[0.5em] text-white/20 uppercase border-b border-white/5 pb-4">Membership</h4>
                <ul className="space-y-8">
                  <li><Link to="/login" className="text-xl md:text-2xl font-bold text-white/40 hover:text-[#4F5BD5] transition-all hover:translate-y-[-2px] inline-block">ログイン</Link></li>
                  <li>
                    <div className="flex flex-col items-center group/item">
                      <span className="text-xl md:text-2xl font-bold text-white/10 cursor-not-allowed">プロフィール</span>
                      <div className="mt-4 px-4 py-1.5 rounded-lg bg-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-[#FEDA75]/40 border border-[#FEDA75]/10 group-hover/item:text-[#FEDA75] transition-all">
                        要ログイン
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Final Elevated Copyright */}
          <div className="mt-44 pt-12 border-t border-white/5 w-full flex flex-col md:flex-row justify-center items-center gap-4">
            <div className="w-1.5 h-1.5 rounded-full bg-[#FEDA75] animate-pulse" />
            <span className="text-[11px] md:text-[13px] font-black tracking-[0.4em] text-white/15 uppercase">
              © 2026 福祉ボランティア部『ミルクティ』。流通科学大学。
            </span>
            <div className="w-1.5 h-1.5 rounded-full bg-[#4F5BD5] animate-pulse" />
          </div>
        </div>
      </footer>
    </div>
  );
}
