import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone,
  Edit2,
  ChevronRight,
  Compass,
  Sparkles,
  Crown,
  MapPin,
  Loader2,
  X,
} from 'lucide-react';

const LineIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738s-12 4.369-12 9.738c0 4.814 4.269 8.846 10.036 9.608.391.084.922.258 1.057.592.121.303.079.778.039 1.085l-.171 1.027c-.052.303-.242 1.186 1.039.646 1.281-.54 6.912-4.069 9.428-6.967 1.739-1.907 2.572-3.891 2.572-5.791zm-15.656 3.666h-2.182c-.391 0-.709-.317-.709-.708v-5.263c0-.392.318-.709.709-.709.391 0 .708.317.708.709v4.554h1.474c.391 0 .709.317.709.709s-.318.708-.709.708zm4.004-.708c0 .391-.317.708-.708.708h-1.637c-.391 0-.708-.317-.708-.708v-5.263c0-.392.317-.709.708-.709s.708.317.708.709v4.554h.929c.391 0 .708.317.708.709zm1.373.708c0-.391-.318-.708-.709-.708s-.708.317-.708.708v-5.263c0-.392.317-.709.708-.709s.709.317.709.709v5.263zm4.512 0h-2.182c-.391 0-.709-.317-.709-.708v-5.263c0-.392.318-.709.709-.709.391 0 .708.317.708.709v4.554h1.474c.391 0 .709.317.709.709s-.318.708-.709.708zm3.626-.708c0 .391-.317.708-.708.708h-2.182c-.391 0-.708-.317-.708-.708v-5.263c0-.392.317-.709.708-.709h2.182c.391 0 .708.317.708.709s-.317.708-.708.708h-1.474v1.261h1.474c.391 0 .708.317.708.709s-.317.708-.708.708h-1.474v1.54h1.474c.391 0 .708.317.708.709s-.317.708-.708.708z" />
  </svg>
);
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useAppStore } from '../store/useAppStore';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { toast } from 'sonner';

const profileSchema = z.object({
  full_name: z.string().min(1, '氏名は必須です'),
  full_name_kana: z.string().optional(),
  gender: z.enum(['Male', 'Female', 'Other']).optional().nullable(),
  mssv: z.string().optional(),
  university_email: z.string().email('正しい形式で入力してください').or(z.literal('')),
  phone: z.string().optional(),
  line_nickname: z.string().optional(),
  line_id: z.string().optional(),
  hometown: z.string().optional(),
  nationality: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function Profile() {
  const queryClient = useQueryClient();
  const { currentUser } = useAuthStore();
  const { selectedYear } = useAppStore();

  const [modalOpen, setModalOpen] = useState(false);
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

  // 2. Edit Profile Form
  const { register, handleSubmit } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    values: {
      full_name: profileData?.full_name || '',
      full_name_kana: profileData?.full_name_kana || '',
      gender: profileData?.gender || null,
      mssv: profileData?.mssv || '',
      university_email: profileData?.university_email || '',
      phone: profileData?.phone || '',
      line_nickname: profileData?.line_nickname || '',
      line_id: profileData?.line_id || '',
      hometown: profileData?.hometown || '',
      nationality: profileData?.nationality || '',
    }
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: data.full_name,
          full_name_kana: data.full_name_kana,
          gender: data.gender,
          mssv: data.mssv,
          university_email: data.university_email,
          phone: data.phone,
          line_nickname: data.line_nickname,
          line_id: data.line_id,
          hometown: data.hometown,
          nationality: data.nationality,
        })
        .eq('id', currentUser!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('プロフィールを更新しました');
      queryClient.invalidateQueries({ queryKey: ['profile', currentUser?.id] });
      setModalOpen(false);
    }
  });



  // 4. Fetch Activity History
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

  // 5. Fetch Attendance Stats (Badge Logic)
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

  return (
    <div className="h-[calc(100vh-4.5rem)] bg-[#FDFDFD] overflow-hidden relative font-sans text-stone-900">

      <AnimatePresence>
        {isSidebarVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarVisible(false)}
            className="lg:hidden fixed inset-0 bg-stone-900/10 backdrop-blur-sm z-[40]"
          />
        )}
      </AnimatePresence>

      <div className="h-full flex relative overflow-hidden">

        <motion.aside
          animate={{
            width: isSidebarVisible ? (window.innerWidth < 1024 ? '100%' : 420) : 0,
            x: isSidebarVisible ? 0 : -420
          }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className={`bg-white border-r border-stone-100 flex flex-col z-[50] shrink-0 overflow-hidden relative ${window.innerWidth < 1024 ? 'fixed inset-y-0 left-0 max-w-[340px] shadow-2xl' : ''
            }`}
        >
          <button
            onClick={() => setIsSidebarVisible(false)}
            className="absolute top-2 right-2 w-10 h-10 bg-rose-500 hover:bg-rose-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-rose-200 transition-all active:scale-95 z-50"
          >
            <X className="w-5 h-5" strokeWidth={3} />
          </button>

          <div className="flex-1 flex flex-col p-10 lg:p-12 overflow-y-auto scrollbar-none">
            <div className="flex flex-col items-center mb-20 text-center">
              <div className="space-y-4">
                <h2 className="text-[30px] font-black tracking-tight leading-tight font-serif flex items-center justify-center">
                  {profileData.full_name}
                  {activeMembership?.role === 'admin' && (
                    <Crown className="w-8 h-8 text-[#CDA01E] fill-[#CDA01E]/10" />
                  )}
                </h2>
                <div className="space-y-1">
                  <p className="text-[14px] font-black text-stone-600 tracking-[0.5em]">
                    {profileData.full_name_kana}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-12">
              {/* Participation Badges */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#4F5BD5]/5 border border-[#4F5BD5]/10 rounded-[2rem] p-6 flex flex-col items-center gap-3 transition-all hover:bg-[#4F5BD5]/10 group">
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-xl shadow-indigo-100 flex items-center justify-center text-[#4F5BD5] group-hover:scale-110 transition-transform">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="text-center">
                    <p className="text-[24px] font-black leading-none">{attendanceStats?.internal_count || 0}</p>
                    <p className="text-[14px] font-black text-[#4F5BD5] mt-2">学内活動</p>
                  </div>
                </div>
                <div className="bg-[#FF833D]/5 border border-[#FF833D]/10 rounded-[2rem] p-6 flex flex-col items-center gap-3 transition-all hover:bg-[#FF833D]/10 group">
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-xl shadow-orange-100 flex items-center justify-center text-[#FF833D] group-hover:scale-110 transition-transform">
                    <Compass className="w-5 h-5" />
                  </div>
                  <div className="text-center">
                    <p className="text-[24px] font-black leading-none">{attendanceStats?.external_count || 0}</p>
                    <p className="text-[14px] font-black text-[#FF833D] mt-2">学外活動</p>
                  </div>
                </div>
              </div>

              <div className="space-y-10">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <span className="text-[14px] font-black uppercase tracking-[0.2em] text-[#D62976]">My Information</span>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-10">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-black text-stone-600 uppercase tracking-widest">学籍番号</label>
                    <p className="text-[14px] font-bold">{profileData.mssv || '—'}</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-black text-stone-600 uppercase tracking-widest">学年</label>
                    <p className="text-[14px] font-bold">{activeMembership?.university_year ? `${activeMembership.university_year}年` : '—'}</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-black text-stone-600 uppercase tracking-widest">性別</label>
                    <p className="text-[14px] font-bold">
                      {profileData.gender === 'Male' ? '男性' : profileData.gender === 'Female' ? '女性' : 'その他'}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-black text-stone-600 uppercase tracking-widest">出身地</label>
                    <p className="text-[14px] font-bold truncate">{profileData.hometown || '—'}</p>
                  </div>
                </div>

                  <div className="space-y-1.5">
                    <label className="text-[13px] font-black text-stone-600 uppercase tracking-widest">大学メール</label>
                    <p className="text-[13px] font-bold text-indigo-600 truncate">{profileData.university_email || '—'}</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-black text-stone-600 uppercase tracking-widest">連絡先</label>
                    <div className="space-y-3">
                      <p className="text-[13px] font-bold flex items-center gap-2"><Phone className="w-3 h-3 text-stone-600" /> {profileData.phone || '—'}</p>
                      <p className="text-[13px] font-bold flex items-center gap-2 text-[#00B900]"><LineIcon className="w-3 h-3 text-stone-600" /> @{profileData.line_nickname || '—'}</p>
                    </div>
                  </div>
              </div>
            </div>

            <div className="mt-auto pt-16">
              <button
                onClick={() => setModalOpen(true)}
                className="w-full h-14 bg-stone-900 hover:bg-black text-white rounded-2xl font-black text-[13px] shadow-2xl shadow-stone-200 transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                <Edit2 className="w-4 h-4" />
                情報修正
              </button>
            </div>
          </div>
        </motion.aside>

        <motion.main
          className="flex-1 flex flex-col bg-[#FAFAFA] relative overflow-hidden"
        >
          <AnimatePresence>
            {!isSidebarVisible && (
              <motion.button
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onClick={() => setIsSidebarVisible(true)}
                className="absolute left-0 top-32 z-50 w-8 h-20 bg-[#D62976] text-white flex items-center justify-start pl-1 shadow-xl shadow-[#D62976]/20 transition-all group active:scale-95 hover:w-10"
                style={{
                  clipPath: 'polygon(0 0, 100% 50%, 0 100%)'
                }}
              >
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </motion.button>
            )}
          </AnimatePresence>

          <header className="px-10 lg:px-16 py-10 flex items-center justify-between border-b border-stone-50 bg-white/40 backdrop-blur-xl shrink-0 z-10">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-[2rem] bg-white shadow-xl shadow-stone-100 flex items-center justify-center text-[#D62976] border border-stone-50">
                <Sparkles className="w-7 h-7" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-[28px] font-black tracking-tight font-serif uppercase">活動履歴</h3>
                <p className="text-[10px] font-black text-stone-300 uppercase tracking-[0.4em]">Registered Activities</p>
              </div>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-stone-300 uppercase tracking-widest mb-1">所属年度</span>
              <div className="px-5 py-2 bg-stone-100 rounded-full text-[11px] font-black text-indigo-600">
                {selectedYear?.name}
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-10 lg:px-20 py-16 scrollbar-thin scrollbar-thumb-stone-100">
            {isHistoryLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-stone-100 animate-spin" />
              </div>
            ) : historyData && historyData.length > 0 ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                {historyData.map((reg, idx) => {
                  const activity = reg.activities;
                  return (
                    <motion.div
                      key={reg.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group bg-white border border-stone-200 p-10 rounded-[2.5rem] hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.06)] transition-all duration-700 relative overflow-hidden"
                    >
                      <div className="absolute top-10 right-10 flex flex-col items-end gap-2">
                        {reg.attendance_status === 'present' ? (
                          <span className="px-4 py-1.5 bg-emerald-50 text-emerald-600 text-[11px] font-black rounded-full border border-emerald-200 uppercase tracking-widest shadow-sm">出席</span>
                        ) : reg.attendance_status === 'excused_absence' ? (
                          <span className="px-4 py-1.5 bg-blue-50 text-blue-600 text-[11px] font-black rounded-full border border-blue-200 uppercase tracking-widest shadow-sm">公欠</span>
                        ) : reg.attendance_status === 'unexcused_absence' ? (
                          <span className="px-4 py-1.5 bg-rose-50 text-rose-600 text-[11px] font-black rounded-full border border-rose-200 uppercase tracking-widest shadow-sm">欠席</span>
                        ) : (
                          <span className="px-4 py-1.5 bg-amber-50 text-amber-600 text-[11px] font-black rounded-full border border-amber-200 uppercase tracking-widest shadow-sm">確認待ち</span>
                        )}
                      </div>
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <span className="text-[11px] font-black text-stone-500 tracking-[0.2em]">{format(new Date(activity.date), 'yyyy.MM.dd')}</span>
                          <h4 className="text-xl font-black text-stone-900 group-hover:text-rose-600 transition-colors uppercase tracking-tight">{activity.title}</h4>
                        </div>
                        <div className="flex items-center gap-6 text-[12px] font-bold text-stone-500">
                          <span className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> {activity.location}</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto">
                <div className="w-28 h-28 rounded-[3rem] bg-white shadow-2xl flex items-center justify-center mb-10 group hover:scale-110 transition-all duration-1000">
                  <Sparkles className="w-10 h-10 text-rose-500/20 group-hover:text-rose-500 transition-colors duration-1000" />
                </div>
                <h4 className="text-2xl font-black tracking-tight mb-5 uppercase">一緒に新しいボランティア活動に参加しましょう！</h4>

              </div>
            )}
          </div>
        </motion.main>
      </div>

      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-stone-900/10 backdrop-blur-md z-[100]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-white border border-stone-50 p-10 lg:p-14 shadow-2xl rounded-[3.5rem] z-[101] max-h-[90vh] overflow-y-auto scrollbar-none">
            <Dialog.Title className="text-3xl font-black tracking-tight mb-12">プロフィール編集</Dialog.Title>

            <form onSubmit={handleSubmit(d => updateProfileMutation.mutate(d))} className="space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-stone-400 px-1 uppercase tracking-widest">氏名 (Romaji)</label>
                  <input {...register('full_name')} className="w-full h-14 bg-stone-50/50 border-none rounded-2xl px-6 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-stone-400 px-1 uppercase tracking-widest">フリガナ</label>
                  <input {...register('full_name_kana')} className="w-full h-14 bg-stone-50/50 border-none rounded-2xl px-6 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-stone-400 px-1 uppercase tracking-widest">性別</label>
                  <select {...register('gender')} className="w-full h-14 bg-stone-50/50 border-none rounded-2xl px-6 text-sm font-bold appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500/20">
                    <option value="Male">男性</option>
                    <option value="Female">女性</option>
                    <option value="Other">その他</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-stone-400 px-1 uppercase tracking-widest">出身地</label>
                  <input {...register('hometown')} className="w-full h-14 bg-stone-50/50 border-none rounded-2xl px-6 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-stone-400 px-1 uppercase tracking-widest">大学メール</label>
                <input {...register('university_email')} className="w-full h-14 bg-stone-50/50 border-none rounded-2xl px-6 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 transition-all" />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-stone-400 px-1 uppercase tracking-widest">電話番号</label>
                  <input {...register('phone')} className="w-full h-14 bg-stone-50/50 border-none rounded-2xl px-6 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-stone-400 px-1 uppercase tracking-widest">LINE ID</label>
                  <input {...register('line_nickname')} className="w-full h-14 bg-stone-50/50 border-none rounded-2xl px-6 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                </div>
              </div>

              <div className="pt-10 flex justify-end items-center gap-6">
                <Dialog.Close className="text-stone-300 font-bold text-sm hover:text-stone-900 transition-colors">キャンセル</Dialog.Close>
                <button
                  type="submit"
                  disabled={updateProfileMutation.status === 'pending'}
                  className="px-12 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 flex items-center gap-3 transition-all active:scale-95"
                >
                  {updateProfileMutation.status === 'pending' && <Loader2 className="w-4 h-4 animate-spin" />}
                  更新
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

    </div>
  );
}
