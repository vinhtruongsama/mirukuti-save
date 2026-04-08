import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Compass,
  Sparkles,
  MapPin,
  Loader2,
  X,
  Shield,
  Crown,
  ChevronRight,
  Hash,
  GraduationCap,
  Heart,
  Globe,
  Mail,
  Phone,
  MessageCircle
} from 'lucide-react';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useAppStore } from '../store/useAppStore';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Profile() {
  const { currentUser } = useAuthStore();
  const { selectedYear } = useAppStore();
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);

  // 1. Fetch Profile Data
  const { data: profileData, isLoading: isProfileLoading } = useQuery({
    queryKey: ['profile', currentUser?.id, selectedYear?.id],
    queryFn: async () => {
      if (!currentUser || !selectedYear) return null;
      const { data: user, error } = await supabase
        .from('users')
        .select(`*, club_memberships(*)`)
        .eq('id', currentUser.id)
        .eq('club_memberships.academic_year_id', selectedYear.id)
        .single();
      if (error) throw error;
      return user;
    },
    enabled: !!currentUser && !!selectedYear,
  });

  const activeMembership = profileData?.club_memberships?.[0] || null;

  // 2. App Settings (Global Toggle)
  const { data: appSettings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*');
      if (error) throw error;
      return data.reduce((acc: any, curr) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});
    }
  });

  const isFullDisclosure = appSettings?.allow_profile_edit !== false;

  // 3. Fetch Activity History
  const { data: historyData, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['user-history', currentUser?.id, selectedYear?.id],
    queryFn: async () => {
      if (!currentUser || !selectedYear) return [];
      const { data, error } = await supabase
        .from('registrations')
        .select(`*, activities!inner(*)`)
        .eq('user_id', currentUser.id)
        .eq('activities.academic_year_id', selectedYear.id);
      if (error) throw error;
      return data.sort((a: any, b: any) => new Date(b.activities.date).getTime() - new Date(a.activities.date).getTime());
    }
  });

  // 4. Fetch Attendance Stats
  const { data: attendanceStats } = useQuery({
    queryKey: ['attendance-stats', currentUser?.id, selectedYear?.id],
    queryFn: async () => {
      if (!currentUser || !selectedYear) return { internal_count: 0, external_count: 0 };
      const { data, error } = await supabase.rpc('get_user_attendance_stats', {
        user_uuid: currentUser.id,
        academic_year_uuid: selectedYear.id
      });
      if (error) throw error;
      return data;
    },
    enabled: !!currentUser && !!selectedYear
  });

  if (isProfileLoading) {
    return (
      <div className="h-[calc(100vh-4.5rem)] flex items-center justify-center bg-[#FAFBFF]">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!profileData) return null;

  const InfoRow = ({ label, value, icon: Icon, color, isVertical }: any) => (
    <div className={cn(
      "group flex py-2.5 border-b border-stone-50 transition-colors gap-2 overflow-visible",
      isVertical ? "flex-col items-start" : "items-center"
    )}>
      <div className="flex items-center gap-2.5 shrink-0 min-w-[90px]">
        <div className={`p-1.5 rounded-lg ${color} bg-opacity-10 text-opacity-100`}>
          <Icon className={`w-3.5 h-3.5 ${color.replace('bg-', 'text-')}`} />
        </div>
        <label className="text-[16px] font-bold text-stone-700 uppercase tracking-[0.05em] font-sans">{label}</label>
      </div>
      <div className="flex items-center gap-2 text-stone-900 w-full">
        {!isVertical && <span className="text-stone-600 font-black">:</span>}
        <span className={cn(
          "text-[16px] font-black tracking-tight font-sans break-all",
          label === 'LINE' ? "text-[#06C755]" : "text-stone-900",
          isVertical ? "pl-9 text-[15px] opacity-80" : "" // Thêm padding để cân đối với icon
        )}>
          {(value && value.toString().trim() !== '' && value !== 'null') ? value : '無'}
        </span>
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-4.5rem)] bg-[#F8F9FD] overflow-hidden relative font-sans text-stone-900">
      <AnimatePresence>
        {isSidebarVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarVisible(false)}
            className="lg:hidden fixed inset-0 bg-indigo-900/10 backdrop-blur-md z-[40]"
          />
        )}
      </AnimatePresence>

      <div className="h-full flex relative overflow-hidden">
        <motion.aside
          animate={{
            width: isSidebarVisible ? (window.innerWidth < 1024 ? '100%' : 440) : 0,
            x: isSidebarVisible ? 0 : -440
          }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className={`bg-white border-r border-stone-100 flex flex-col z-[50] shrink-0 overflow-hidden relative shadow-2xl lg:shadow-none ${window.innerWidth < 1024 ? 'fixed inset-y-0 left-0 max-w-[440px]' : ''
            }`}
        >
          <button
            onClick={() => setIsSidebarVisible(false)}
            className="absolute top-4 right-4 w-12 h-12 bg-white hover:bg-rose-50 text-stone-400 hover:text-rose-500 rounded-2xl flex items-center justify-center shadow-sm border border-stone-100 transition-all active:scale-95 z-50 lg:hidden"
          >
            <X className="w-6 h-6" strokeWidth={2.5} />
          </button>

          <div className="flex-1 flex flex-col p-8 lg:p-12 overflow-y-auto scrollbar-none">
            {/* Profile Header */}
            <div className="flex flex-col items-center mb-12">
              <div className="relative mb-6">
                <div className="w-24 h-24 rounded-[2.5rem] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-2xl shadow-indigo-200">
                  <span className="text-3xl font-black">{profileData.full_name[0]}</span>
                </div>
                {activeMembership?.role === 'admin' && (
                  <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-amber-400 rounded-2xl flex items-center justify-center border-4 border-white shadow-lg">
                    <Crown className="w-5 h-5 text-white fill-white/20" />
                  </div>
                )}
              </div>
              <h2 className="text-[32px] font-black tracking-tighter leading-tight font-serif mb-2 text-center">
                {profileData.full_name}
              </h2>
              <p className="text-[12px] font-black text-indigo-500 tracking-[0.4em] uppercase opacity-70 text-center">
                {profileData.full_name_kana}
              </p>
            </div>

            {/* Attendance Cards */}
            <div className="grid grid-cols-2 gap-4 mb-12">
              <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-[2rem] p-5 flex flex-col items-center gap-2 transition-all hover:bg-white hover:shadow-xl hover:shadow-indigo-100 group">
                <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-indigo-600">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="text-center">
                  <p className="text-[22px] font-black text-indigo-900 leading-none">{attendanceStats?.internal_count || 0}</p>
                  <p className="text-[11px] font-black text-indigo-400 mt-2 uppercase tracking-widest text-[10px]">学内活動</p>
                </div>
              </div>
              <div className="bg-orange-50/50 border border-orange-100/50 rounded-[2rem] p-5 flex flex-col items-center gap-2 transition-all hover:bg-white hover:shadow-xl hover:shadow-orange-100 group">
                <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-orange-500">
                  <Compass className="w-5 h-5" />
                </div>
                <div className="text-center">
                  <p className="text-[22px] font-black text-orange-900 leading-none">{attendanceStats?.external_count || 0}</p>
                  <p className="text-[11px] font-black text-orange-400 mt-2 uppercase tracking-widest text-[10px]">学外活動</p>
                </div>
              </div>
            </div>

            {/* Information Grid */}
            <div className="space-y-10">
              <div className="flex items-center gap-1 pb-2 border-b border-stone-100">
                <Shield className="w-4 h-4 text-indigo-400" />
                <span className="text-[16px] font-black text-stone-900 uppercase tracking-[0.2em] font-serif">基本情報</span>
              </div>

              <div className="flex flex-col gap-1">
                {/* MSSV in full line */}
                <InfoRow label="学籍番号" value={profileData.mssv} icon={Hash} color="bg-blue-500" />

                {/* Gender in full line */}
                <InfoRow
                  label="性別"
                  value={profileData.gender === 'Male' ? '男性' : profileData.gender === 'Female' ? '女性' : 'その他'}
                  icon={Heart}
                  color="bg-rose-500"
                />

                {/* Year in full line */}
                <InfoRow
                  label="学年"
                  value={profileData.university_year === 0 ? '卒業生' : (profileData.university_year ? `${profileData.university_year}年` : '無')}
                  icon={GraduationCap}
                  color="bg-purple-500"
                />

                {/* Nationality in full line */}
                <InfoRow
                  label="国籍"
                  value={profileData.nationality}
                  icon={Globe}
                  color="bg-emerald-500"
                />
              </div>

              {/* Conditional Contacts Section */}
              {isFullDisclosure && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-6 overflow-hidden"
                >
                  <div className="flex items-center gap-3 pt-6 pb-2 border-b border-stone-100">
                    <Mail className="w-4 h-4 text-indigo-400" />
                    <span className="text-[16px] font-black text-stone-900 uppercase tracking-[0.2em] font-serif">連絡先</span>
                  </div>

                  <div className="space-y-6">
                    <InfoRow label="連絡用メール" value={profileData.email} icon={Mail} color="bg-rose-500" isVertical={true} />
                    <InfoRow label="大学メール" value={profileData.university_email} icon={Mail} color="bg-indigo-500" isVertical={true} />
                    <InfoRow label="電話番号" value={profileData.phone} icon={Phone} color="bg-stone-600" />
                    <InfoRow label="LINE" value={profileData.line_nickname ? `@${profileData.line_nickname}` : null} icon={MessageCircle} color="bg-[#06C755]" />
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </motion.aside>

        {/* Main Content Area */}
        <motion.main className="flex-1 flex flex-col bg-[#F8F9FD] relative overflow-hidden">
          <AnimatePresence>
            {!isSidebarVisible && (
              <motion.button
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onClick={() => setIsSidebarVisible(true)}
                className="absolute left-0 top-32 z-50 w-9 h-24 bg-indigo-600 text-white flex items-center justify-start pl-1.5 shadow-2xl shadow-indigo-200 transition-all group active:scale-95 hover:w-12"
                style={{ clipPath: 'polygon(0 0, 100% 50%, 0 100%)' }}
              >
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform" strokeWidth={3} />
              </motion.button>
            )}
          </AnimatePresence>

          <header className="px-8 lg:px-16 py-10 flex flex-col sm:flex-row items-center justify-between gap-6 border-b border-indigo-50 bg-white/60 backdrop-blur-2xl shrink-0 z-10 shadow-sm">
            <div className="flex items-center gap-8">
              {/* Vertical Gradient Bar (Style from Image 23) */}
              <div className="w-1.5 h-16 rounded-full bg-gradient-to-b from-[#4F5BD5] to-[#D62976] hidden sm:block" />

              <div className="space-y-2">
                <h3 className="text-[36px] font-black tracking-tighter font-serif leading-none text-stone-900">活動履歴</h3>
                <div className="flex items-center gap-2 text-[10px] font-black text-stone-400 uppercase tracking-[0.6em] opacity-60">
                  <span>Activity</span>
                  <span className="text-[#D62976]">Records</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-white p-2 pr-6 rounded-[2rem] border border-indigo-50 shadow-sm transition-all hover:shadow-md">
              <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 font-black text-[12px]">26</div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-stone-300 uppercase tracking-widest">Academic Year</span>
                <span className="text-[14px] font-black text-indigo-600">{selectedYear?.name}</span>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-6 lg:px-16 py-12 scrollbar-thin scrollbar-thumb-indigo-100">
            {isHistoryLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
              </div>
            ) : historyData && historyData.length > 0 ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {historyData.map((reg, idx) => {
                  const activity = reg.activities;
                  return (
                    <motion.div
                      key={reg.id}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group bg-white border border-indigo-50/50 p-8 rounded-[3rem] hover:shadow-[0_45px_100px_-25px_rgba(79,91,213,0.12)] transition-all duration-700 relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                      <div className="flex flex-col h-full relative z-10">
                        <div className="flex items-start justify-between mb-8">
                          <div className="px-4 py-2 bg-stone-50 rounded-2xl border border-stone-100 transition-colors group-hover:bg-white group-hover:border-indigo-100">
                            <span className="text-[13px] font-black text-stone-900">{format(new Date(activity.date), 'yyyy.MM.dd')}</span>
                          </div>

                          {reg.attendance_status === 'present' ? (
                            <span className="px-5 py-2 bg-emerald-50 text-emerald-600 text-[11px] font-black rounded-full border border-emerald-100 uppercase tracking-widest shadow-sm">出席</span>
                          ) : reg.attendance_status === 'excused_absence' ? (
                            <span className="px-5 py-2 bg-blue-50 text-blue-600 text-[11px] font-black rounded-full border border-blue-100 uppercase tracking-widest shadow-sm">公欠</span>
                          ) : reg.attendance_status === 'unexcused_absence' ? (
                            <span className="px-5 py-2 bg-rose-50 text-rose-600 text-[11px] font-black rounded-full border border-rose-100 uppercase tracking-widest shadow-sm">欠席</span>
                          ) : (
                            <span className="px-5 py-2 bg-amber-50 text-amber-600 text-[11px] font-black rounded-full border border-amber-100 uppercase tracking-widest shadow-sm">確認待ち</span>
                          )}
                        </div>

                        <h4 className="text-[22px] font-black text-stone-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight leading-snug mb-6">
                          {activity.title}
                        </h4>

                        <div className="mt-auto flex items-center gap-4 text-[13px] font-bold text-stone-400">
                          <div className="flex items-center gap-2 bg-stone-50 px-4 py-2 rounded-xl group-hover:bg-indigo-50/50 group-hover:text-indigo-600 transition-all">
                            <MapPin className="w-4 h-4" />
                            <span>{activity.location}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto p-8">
                <div className="w-32 h-32 rounded-[3.5rem] bg-white shadow-2xl flex items-center justify-center mb-10 group hover:rotate-12 transition-all duration-700">
                  <Sparkles className="w-12 h-12 text-rose-500/20 group-hover:text-rose-500 transition-colors duration-700" />
                </div>
                <h4 className="text-[26px] font-black tracking-tight mb-4 uppercase leading-tight">一緒に新しい活動に<br />参加しましょう！</h4>
                <p className="text-stone-400 font-bold text-[14px]">
                  イベントに参加すると、ここにあなたの素敵な活動記録が刻まれます。
                </p>
              </div>
            )}
          </div>
        </motion.main>
      </div>
    </div>
  );
}
