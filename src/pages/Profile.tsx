import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Camera, Edit2, Loader2, User as UserIcon, Compass, ChevronDown, ChevronUp, Sparkles, X, ChevronRight } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useAppStore } from '../store/useAppStore';

const profileSchema = z.object({
  full_name: z.string().min(1, '氏名を入力してください'),
  full_name_furigana: z.string().optional(),
  nationality: z.string().optional(),
  phone: z.string().optional(),
  line_id: z.string().optional(),
  hometown: z.string().optional(),
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

  // 1. Fetch Profile Data (Join with current year's membership)
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

  // 2. Edit Profile Info Mutation
  const { register, handleSubmit } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    values: {
      full_name: profileData?.full_name || '',
      full_name_furigana: profileData?.full_name_furigana || '',
      nationality: profileData?.nationality || '',
      phone: profileData?.phone || '',
      line_id: profileData?.line_id || '',
      hometown: profileData?.hometown || '',
    }
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: data.full_name,
          full_name_furigana: data.full_name_furigana,
          nationality: data.nationality,
          phone: data.phone,
          line_id: data.line_id,
          hometown: data.hometown,
        })
        .eq('id', currentUser!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('プロフィールを更新しました。');
      queryClient.invalidateQueries({ queryKey: ['profile', currentUser?.id] });
      setModalOpen(false);
    },
    onError: (err: any) => {
      toast.error('エラーが発生しました: ' + err.message);
    }
  });

  // 3. Avatar Upload Mutation
  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      // Validate
      if (file.size > 2 * 1024 * 1024) throw new Error('画像のサイズは2MB以下にしてください');
      if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('.jpg または .png 形式の画像のみアップロード可能です');

      const fileExt = file.name.split('.').pop();
      const fileName = `${currentUser!.id}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update Users table
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', currentUser!.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast.success('プロフィール画像を更新しました');
      queryClient.invalidateQueries({ queryKey: ['profile', currentUser?.id] });
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (err: any) => {
      toast.error('アップロードエラー: ' + err.message);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      avatarMutation.mutate(e.target.files[0]);
    }
  };

  // 4. Fetch Registrations History
  const { data: historyData, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['user-history', currentUser?.id, selectedYear?.id],
    queryFn: async () => {
      if (!currentUser || !selectedYear) return [];

      const { data, error } = await supabase
        .from('registrations')
        .select(`
          *,
          activities!inner(*)
        `)
        .eq('user_id', currentUser.id)
        .eq('activities.academic_year_id', selectedYear.id);

      if (error) throw error;

      // Sort in frontend by date descending
      return data.sort((a: any, b: any) => new Date(b.activities.date).getTime() - new Date(a.activities.date).getTime());
    },
    enabled: !!currentUser && !!selectedYear,
  });

  if (isProfileLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-4.5rem)] bg-white">
        <Loader2 className="w-8 h-8 text-[#4F5BD5] animate-spin" />
      </div>
    );
  }

  if (!profileData) return null;

  return (
    <div className="h-[calc(100vh-4.5rem)] bg-[#F8F9FC] overflow-hidden relative font-sans">
      
      {/* Re-opening Trigger: Red Triangle / Chevron */}
      <AnimatePresence>
        {!isSidebarVisible && (
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onClick={() => setIsSidebarVisible(true)}
            className="absolute left-0 top-[15%] z-50 w-10 h-24 bg-rose-500 text-white rounded-r-3xl flex items-center justify-center shadow-lg shadow-rose-200 hover:w-12 transition-all group"
          >
            <ChevronRight className="w-6 h-6 group-hover:scale-125 transition-transform" />
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

      <div className="h-full flex overflow-hidden">

        {/* Left Sidebar: Profile Identity */}
        <motion.aside 
          animate={{ 
            width: isSidebarVisible ? (window.innerWidth < 1024 ? '100%' : 380) : 0,
            opacity: isSidebarVisible ? 1 : 0,
            x: isSidebarVisible ? 0 : -380
          }}
          transition={{ type: "spring", damping: 30, stiffness: 250 }}
          className={`bg-white border-r border-brand-stone-100 flex flex-col shadow-[10px_0_30px_rgba(0,0,0,0.02)] z-20 shrink-0 overflow-hidden ${
            window.innerWidth < 1024 ? 'absolute inset-y-0 left-0 max-w-[320px]' : 'relative'
          }`}
        >
          {/* Close Button (X) */}
          <button 
            onClick={() => setIsSidebarVisible(false)}
            className="absolute top-6 right-4 p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all z-30"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="p-8 w-[320px] lg:w-[380px] flex-1 flex flex-col items-center">
            {/* Avatar Section */}
            <div className="relative group mb-6">
              <div className="w-24 h-24 rounded-[2rem] overflow-hidden bg-brand-stone-50 border-[6px] border-white shadow-[0_20px_50px_rgba(0,0,0,0.1)] group-hover:scale-105 transition-all duration-500 transform-gpu">
                {profileData.avatar_url ? (
                  <img src={profileData.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-brand-stone-200 bg-gradient-to-br from-brand-stone-50 to-brand-stone-100">
                    <UserIcon className="w-12 h-12" />
                  </div>
                )}
                <div
                  className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer ${avatarMutation.status === 'pending' ? 'opacity-100' : ''}`}
                  onClick={() => avatarMutation.status !== 'pending' && fileInputRef.current?.click()}
                >
                  {avatarMutation.status === 'pending' ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </div>
              </div>
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleAvatarChange} className="hidden" />

              {/* Role Badge Floating */}
              {activeMembership && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-[#4F5BD5] text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-[#4F5BD5]/30 whitespace-nowrap">
                  {activeMembership.role === 'admin' ? '管理者' :
                    activeMembership.role === 'executive' ? '幹部' :
                      activeMembership.role === 'alumni' ? 'OB/OG' : 'メンバー'}
                </div>
              )}
            </div>

            <div className="text-center w-full space-y-1 mb-6">
              <h2 className="text-2xl font-black tracking-tighter text-brand-stone-900">{profileData.full_name}</h2>
            </div>

            {/* Info Section - Collapsible / Reveal on Click */}
            <div className="w-full pt-8 border-t border-brand-stone-50">
              <div className="relative">
                {!showFullProfile ? (
                  <button
                    onClick={() => setShowFullProfile(true)}
                    className="w-full py-4 flex items-center justify-between px-6 bg-[#F8F9FC] rounded-2xl group/reveal hover:bg-[#4F5BD5]/5 transition-all"
                  >
                    <span className="text-[16px] font-black uppercase tracking-widest text-brand-stone-400 group-hover/reveal:text-[#D62976] transition-colors">詳細情報を表示</span>
                    <ChevronDown className="w-4 h-4 text-brand-stone-300 group-hover/reveal:text-[#4F5BD5] group-hover/reveal:translate-y-0.5 transition-all" />
                  </button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <div className="flex items-center justify-between px-2">
                      <span className="text-[16px] font-black uppercase tracking-widest text-[#4F5BD5]">詳細情報を表示</span>
                      <button onClick={() => setShowFullProfile(false)} className="group/hide">
                        <ChevronUp className="w-5 h-5 text-brand-stone-300 group-hover/hide:text-brand-stone-900 transition-colors" />
                      </button>
                    </div>

                    <div className="space-y-5">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-black uppercase tracking-widest text-brand-stone-400">Email Address</span>
                        <span className="text-base font-bold text-brand-stone-600 truncate">{profileData.email}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-black uppercase tracking-widest text-brand-stone-400">Nationality</span>
                          <span className="text-base font-bold text-brand-stone-600">{profileData.nationality || '—'}</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-black uppercase tracking-widest text-brand-stone-400">Department</span>
                          <span className="text-base font-bold text-brand-stone-600">{activeMembership?.department || '—'}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-black uppercase tracking-widest text-brand-stone-400">Phone / Hometown</span>
                        <span className="text-base font-bold text-brand-stone-600">
                          {profileData.phone || 'N/A'} • {profileData.hometown || '—'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="p-8 bg-brand-stone-50/50">
            <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
              <Dialog.Trigger asChild>
                <button className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-brand-stone-900 hover:bg-black text-white text-sm font-black rounded-2xl transition-all shadow-xl shadow-brand-stone-900/10 active:scale-95 group">
                  <Edit2 className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                  プロフィールを編集
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/20 backdrop-blur-md z-[100]" />
                <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white border border-brand-stone-100 p-10 shadow-2xl rounded-[2.5rem] z-[101]">
                  <Dialog.Title className="text-3xl font-black tracking-tighter text-brand-stone-900 mb-6">Edit Identity</Dialog.Title>
                  <form onSubmit={handleSubmit((d) => updateProfileMutation.mutate(d))} className="space-y-5">
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-brand-stone-400 pl-1">Full Name</label>
                        <input {...register('full_name')} className="w-full bg-[#F8F9FC] border-none rounded-xl px-5 py-3 text-sm font-bold text-brand-stone-900 focus:ring-2 focus:ring-[#4F5BD5] transition-all" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-brand-stone-400 pl-1">Name Furigana</label>
                        <input {...register('full_name_furigana')} className="w-full bg-[#F8F9FC] border-none rounded-xl px-5 py-3 text-sm font-bold text-brand-stone-900 focus:ring-2 focus:ring-[#4F5BD5] transition-all" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-brand-stone-400 pl-1">Nationality</label>
                        <input {...register('nationality')} className="w-full bg-[#F8F9FC] border-none rounded-xl px-5 py-3 text-sm font-bold text-brand-stone-900 focus:ring-2 focus:ring-[#4F5BD5] transition-all" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-brand-stone-400 pl-1">Phone Number</label>
                        <input {...register('phone')} className="w-full bg-[#F8F9FC] border-none rounded-xl px-5 py-3 text-sm font-bold text-brand-stone-900 focus:ring-2 focus:ring-[#4F5BD5] transition-all" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-brand-stone-400 pl-1">Hometown</label>
                      <input {...register('hometown')} className="w-full bg-[#F8F9FC] border-none rounded-xl px-5 py-3 text-sm font-bold text-brand-stone-900 focus:ring-2 focus:ring-[#4F5BD5] transition-all" />
                    </div>
                    <div className="pt-8 flex justify-end gap-3">
                      <Dialog.Close asChild>
                        <button type="button" className="px-6 py-3 text-brand-stone-400 text-sm font-black hover:text-brand-stone-900 transition-colors">Cancel</button>
                      </Dialog.Close>
                      <button
                        type="submit"
                        disabled={updateProfileMutation.status === 'pending'}
                        className="px-10 py-3 bg-[#4F5BD5] hover:bg-[#3D4AB5] text-white text-sm font-black rounded-2xl transition-all shadow-lg active:scale-95 flex items-center gap-2"
                      >
                        {updateProfileMutation.status === 'pending' && <Loader2 className="w-4 h-4 animate-spin" />}
                        Save Profile
                      </button>
                    </div>
                  </form>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </motion.aside>

        {/* Right Content: Activity Log (Synchronized Layout Animation) */}
        <motion.main 
          layout
          transition={{ type: "spring", damping: 28, stiffness: 220 }}
          className="flex-1 flex flex-col overflow-hidden"
        >
          
          {/* Dashboard Header */}
          <motion.header 
            layout
            className="px-6 lg:px-10 py-6 lg:py-8 flex items-center justify-between border-b border-brand-stone-100 bg-white/50 backdrop-blur-md shrink-0"
          >
            <div className="flex items-center gap-3 lg:gap-4">
              <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-[#4F5BD5]/10 flex items-center justify-center text-[#4F5BD5]">
                <Compass className="w-5 h-5 lg:w-6 lg:h-6" />
              </div>
              <div>
                <h3 className="text-lg lg:text-xl font-black tracking-tight text-brand-stone-900">活動ログ</h3>
                <p className="text-[10px] lg:text-xs font-bold text-brand-stone-400 uppercase tracking-widest">Activity History</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-stone-400">Current Academic Year</span>
                <span className="text-sm font-black text-[#D62976]">{selectedYear?.name}</span>
              </div>
            </div>
          </motion.header>

          {/* List Section: Scrollable purely here */}
          <div className="flex-1 overflow-y-auto p-10 scrollbar-thin scrollbar-thumb-brand-stone-200">
            {isHistoryLoading ? (
              <div className="h-full flex justify-center items-center">
                <Loader2 className="w-8 h-8 text-[#4F5BD5]/20 animate-spin" />
              </div>
            ) : historyData && historyData.length > 0 ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {historyData.map((reg: any) => {
                  const activity = reg.activities;
                  const isPresent = reg.attendance_status === 'present';
                  const isMissing = reg.attendance_status === 'unexcused_absence';
                  const isExcused = reg.attendance_status === 'excused_absence';

                  return (
                    <motion.div
                      key={reg.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group bg-white border border-brand-stone-100/50 p-6 rounded-3xl hover:shadow-[0_20px_40px_rgba(0,0,0,0.03)] hover:border-[#4F5BD5]/20 transition-all duration-500 relative overflow-hidden"
                    >
                      {/* Status Accent Strip */}
                      <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${isPresent ? 'bg-emerald-400' :
                        isMissing ? 'bg-rose-400' :
                          isExcused ? 'bg-amber-400' : 'bg-[#4F5BD5]/20'
                        }`} />

                      <div className="flex justify-between items-start mb-4">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-brand-stone-400 tracking-[0.2em] uppercase">
                            {format(new Date(activity.date), 'yyyy.MM.dd')}
                          </span>
                          <h4 className="text-lg font-black text-brand-stone-900 leading-tight group-hover:text-[#4F5BD5] transition-colors">
                            {activity.title}
                          </h4>
                        </div>
                        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${isPresent ? 'text-emerald-500 bg-emerald-50 border-emerald-100' :
                          isMissing ? 'text-rose-500 bg-rose-50 border-rose-100' :
                            isExcused ? 'text-amber-500 bg-amber-50 border-amber-100' :
                              'text-brand-stone-400 bg-brand-stone-50 border-brand-stone-100'
                          }`}>
                          {isPresent ? 'Present' : isMissing ? 'Absent' : isExcused ? 'Excused' : 'Confirmed'}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-bold text-brand-stone-500">
                        <span className="flex items-center gap-1.5 truncate">
                          <Compass className="w-3.5 h-3.5 text-brand-stone-300" />
                          {activity.location}
                        </span>
                      </div>

                      {reg.admin_note && (
                        <div className="mt-4 pt-4 border-t border-brand-stone-50">
                          <p className="text-[11px] text-brand-stone-500 italic leading-relaxed">
                            "{reg.admin_note}"
                          </p>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                <div className="w-24 h-24 rounded-[2rem] bg-white shadow-2xl flex items-center justify-center mb-8 relative">
                  <div className="absolute inset-0 bg-[#4F5BD5]/5 blur-3xl rounded-full" />
                  <Sparkles className="w-10 h-10 text-[#4F5BD5]" />
                </div>
                <h3 className="text-2xl font-black tracking-tighter text-brand-stone-900 mb-3">新しい冒険が待っています</h3>
                <p className="text-sm font-bold text-brand-stone-400 leading-relaxed mb-8">
                  ボランティア活動に参加して、ミルクティと一緒に素晴らしい価値を広めましょう。
                </p>
                <button
                  onClick={() => window.location.href = '/activities'}
                  className="px-10 py-4 bg-[#4F5BD5] hover:bg-[#3D4AB5] text-white rounded-2xl font-black text-sm shadow-xl shadow-[#4F5BD5]/20 active:scale-95 transition-all"
                >
                  Activityを見つける
                </button>
              </div>
            )}
          </div>
        </motion.main>
      </div>
    </div>
  );
}
