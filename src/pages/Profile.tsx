import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User as UserIcon, 
  MapPin, 
  Phone, 
  MessageSquare, 
  Edit2, 
  Loader2, 
  Camera, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp,
  Compass,
  Sparkles,
} from 'lucide-react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showFullProfile, setShowFullProfile] = useState(false);
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

  // 3. Avatar Upload
  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 2 * 1024 * 1024) throw new Error('2MB以下の画像を選択してください');
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${currentUser!.id}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', currentUser!.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast.success('画像を更新しました');
      queryClient.invalidateQueries({ queryKey: ['profile', currentUser?.id] });
    },
    onError: (err: any) => toast.error(err.message)
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) avatarMutation.mutate(e.target.files[0]);
  };

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
          className={`bg-white border-r border-stone-100 flex flex-col z-[50] shrink-0 overflow-hidden relative ${
            window.innerWidth < 1024 ? 'fixed inset-y-0 left-0 max-w-[340px] shadow-2xl' : ''
          }`}
        >
          <button 
            onClick={() => setIsSidebarVisible(false)}
            className="absolute top-6 right-6 p-2 text-stone-300 hover:text-stone-900 transition-colors"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>

          <div className="flex-1 flex flex-col p-10 lg:p-12 overflow-y-auto scrollbar-none">
            <div className="flex flex-col items-center mb-16 text-center">
              <div className="relative mb-10 group">
                <div className="w-32 h-32 rounded-[3.5rem] bg-stone-50 border-[6px] border-white shadow-[0_40px_80px_-15px_rgba(0,0,0,0.12)] overflow-hidden relative group-hover:scale-[1.05] transition-all duration-500 transform-gpu">
                  {profileData.avatar_url ? (
                    <img src={profileData.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-200">
                      <UserIcon className="w-14 h-14" />
                    </div>
                  )}
                  <div 
                    className="absolute inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleAvatarChange} className="hidden" />

                {activeMembership && (
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-5 py-1.5 bg-[#4F5BD5] text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-indigo-100 whitespace-nowrap">
                    {activeMembership.role === 'admin' ? '管理者' :
                      activeMembership.role === 'executive' ? '幹部' :
                        activeMembership.role === 'alumni' ? 'OB/OG' : 'メンバー'}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h2 className="text-3xl font-black tracking-tight">{profileData.full_name}</h2>
                <p className="text-[11px] font-bold text-stone-300 uppercase tracking-[0.2em]">{profileData.full_name_kana || 'Name Index'}</p>
              </div>
            </div>

            <div className="space-y-12">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-[0.3em] text-indigo-500">Details</span>
                <button 
                  onClick={() => setShowFullProfile(!showFullProfile)}
                  className="p-1 hover:bg-stone-50 rounded-lg transition-colors"
                >
                  {showFullProfile ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
                </button>
              </div>

              <div className="space-y-10">
                <div className="grid grid-cols-2 gap-x-8 gap-y-10">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">学籍番号</label>
                    <p className="text-[14px] font-bold">{profileData.mssv || '—'}</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">学年</label>
                    <p className="text-[14px] font-bold">{activeMembership?.university_year ? `${activeMembership.university_year}年` : '—'}</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">性別</label>
                    <p className="text-[14px] font-bold">
                      {profileData.gender === 'Male' ? '男性' : profileData.gender === 'Female' ? '女性' : 'その他'}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">出身地</label>
                    <p className="text-[14px] font-bold truncate">{profileData.hometown || '—'}</p>
                  </div>
                </div>

                <AnimatePresence>
                  {showFullProfile && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-10"
                    >
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">大学メール</label>
                        <p className="text-[13px] font-bold text-indigo-600 truncate">{profileData.university_email || '—'}</p>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">連絡先</label>
                        <div className="space-y-3">
                          <p className="text-[13px] font-bold flex items-center gap-2"><Phone className="w-3 h-3 text-stone-300" /> {profileData.phone || '—'}</p>
                          <p className="text-[13px] font-bold flex items-center gap-2 text-emerald-600"><MessageSquare className="w-3 h-3 text-stone-300" /> @{profileData.line_nickname || '—'}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                onClick={() => setIsSidebarVisible(true)}
                className="absolute left-6 top-1/2 -translate-y-1/2 z-50 w-12 h-12 bg-white border border-stone-100 rounded-2xl flex items-center justify-center shadow-lg text-stone-300 hover:text-indigo-600 transition-all group"
              >
                <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </motion.button>
            )}
          </AnimatePresence>

          <header className="px-10 lg:px-16 py-10 flex items-center justify-between border-b border-stone-100 bg-white/40 backdrop-blur-xl shrink-0 z-10">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-rose-500 border border-stone-50">
                <Compass className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-2xl font-black tracking-tight">活動ログ</h3>
                <p className="text-[10px] font-bold text-stone-300 uppercase tracking-[0.25em]">Activities</p>
              </div>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-stone-300 uppercase tracking-widest mb-1">Year</span>
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
                  const isPresent = reg.attendance_status === 'present';
                  return (
                    <motion.div
                      key={reg.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group bg-white border border-stone-100/60 p-10 rounded-[2.5rem] hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.06)] transition-all duration-700 relative overflow-hidden"
                    >
                      <div className={`absolute top-10 right-10 w-3 h-3 rounded-full ${isPresent ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <span className="text-[11px] font-black text-stone-300 tracking-[0.2em]">{format(new Date(activity.date), 'yyyy.MM.dd')}</span>
                          <h4 className="text-xl font-black text-stone-900 group-hover:text-rose-500 transition-colors uppercase tracking-tight">{activity.title}</h4>
                        </div>
                        <div className="flex items-center gap-6 text-[12px] font-bold text-stone-400">
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
                <h4 className="text-2xl font-black tracking-tight mb-4 uppercase">Let's Adventure</h4>
                <p className="text-sm font-bold text-stone-300 leading-relaxed max-w-[280px]">MilkTeaと一緒に新しいボランティア活動に参加しましょう！</p>
                <button 
                  onClick={() => window.location.href = '/activities'}
                  className="mt-12 px-10 py-5 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-[13px] shadow-2xl active:scale-95 transition-all text-center"
                >
                  活動を探しに行く
                </button>
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
