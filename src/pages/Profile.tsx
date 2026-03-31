import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Camera, Edit2, Info, Loader2, User as UserIcon, ChevronDown, ChevronUp, Sparkles, Compass } from 'lucide-react';
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
      <div className="flex justify-center items-center min-h-[calc(100vh-4rem)] bg-brand-stone-900">
         <Loader2 className="w-8 h-8 text-brand-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!profileData) return null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-serif text-brand-stone-50 mb-10 tracking-tight">プロフィール設定</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        
        {/* Left Column: Profile Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-brand-stone-800/20 border border-brand-stone-800 rounded-sm p-6 overflow-hidden relative">
            
            {/* Avatar Section */}
            <div className="flex flex-col items-center mb-8 relative">
              <div className="relative group w-32 h-32 rounded-full overflow-hidden border-4 border-brand-stone-800 bg-brand-stone-900 shadow-xl">
                {profileData.avatar_url ? (
                  <img src={profileData.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-brand-stone-700">
                    <UserIcon className="w-12 h-12" />
                  </div>
                )}
                
                {/* Upload Overlay */}
                <div 
                  className={`absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${avatarMutation.isPending ? 'opacity-100' : ''}`}
                  onClick={() => !avatarMutation.isPending && fileInputRef.current?.click()}
                >
                  {avatarMutation.isPending ? (
                    <Loader2 className="w-6 h-6 text-brand-emerald-400 animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-brand-stone-200" />
                  )}
                </div>
                <input 
                  type="file" 
                  accept="image/jpeg, image/png" 
                  ref={fileInputRef} 
                  onChange={handleAvatarChange} 
                  className="hidden" 
                />
              </div>
              <h2 className="text-2xl font-serif text-brand-stone-50 mt-4 leading-none">{profileData.full_name}</h2>
              <p className="text-brand-stone-400 mt-2 text-sm tracking-wide uppercase font-medium">{profileData.mssv}</p>
              
              {activeMembership && (
                <div className="mt-4 px-4 py-1.5 flex items-center gap-2 bg-brand-emerald-950/30 border border-brand-emerald-500/20 text-brand-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded-full">
                   {activeMembership.role === 'admin' ? '管理者' : 
                    activeMembership.role === 'executive' ? '幹部' : 
                    activeMembership.role === 'alumni' ? 'OB/OG' : 'メンバー'}
                </div>
              )}
            </div>

            {/* Info Section - Collapsible */}
            <div className="pt-6 border-t border-brand-stone-800/50">
              <div className="space-y-4 text-sm font-medium">
                <div className="flex items-center justify-between">
                  <span className="text-brand-stone-500">メールアドレス</span>
                  <span className="text-brand-stone-200 select-all">{profileData.email}</span>
                </div>
                
                <AnimatePresence>
                  {showFullProfile && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden space-y-4 pt-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-brand-stone-500">フリガナ</span>
                        <span className="text-brand-stone-200">{profileData.full_name_furigana || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-brand-stone-500">国籍</span>
                        <span className="text-brand-stone-200">{profileData.nationality || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-brand-stone-500">学部・部署</span>
                        <span className="text-brand-stone-200">{activeMembership?.department || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-brand-stone-500">学年・クラス</span>
                        <span className="text-brand-stone-200">{activeMembership?.university_year || '-'}年 {activeMembership?.class_name || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-brand-stone-500">電話番号</span>
                        <span className="text-brand-stone-200">{profileData.phone || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-brand-stone-500">LINE ID</span>
                        <span className="text-brand-stone-200">{profileData.line_id || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-brand-stone-500">出身地</span>
                        <span className="text-brand-stone-200">{profileData.hometown || '—'}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button 
                onClick={() => setShowFullProfile(!showFullProfile)}
                className="w-full mt-6 flex items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-widest text-brand-stone-500 hover:text-brand-emerald-400 transition-colors group"
              >
                {showFullProfile ? (
                  <>表示を減らす <ChevronUp className="w-3.5 h-3.5 group-hover:-translate-y-0.5 transition-transform" /></>
                ) : (
                  <>詳細を表示 <ChevronDown className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" /></>
                )}
              </button>
            </div>

            {/* Edit Button */}
            <div className="mt-8">
              <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
                <Dialog.Trigger asChild>
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-stone-800 hover:bg-brand-stone-700 text-brand-stone-200 text-sm font-bold rounded-2xl border border-brand-stone-700/50 transition-all active:scale-[0.98]">
                    <Edit2 className="w-4 h-4" /> プロフィールを更新
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                  <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border border-brand-stone-800 bg-brand-stone-900 p-8 shadow-2xl sm:rounded-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
                    <Dialog.Title className="text-2xl font-serif text-brand-stone-50 mb-2">プロフィール編集</Dialog.Title>
                    
                    <form onSubmit={handleSubmit((d) => updateProfileMutation.mutate(d))} className="space-y-4">
                      
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-brand-stone-500 pl-1">氏名(漢字または ROMAJI)</label>
                          <input {...register('full_name')} className="w-full bg-brand-stone-800/50 border border-brand-stone-700 text-brand-stone-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-emerald-500 transition-all shadow-inner" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-brand-stone-500 pl-1">フリガナ</label>
                          <input {...register('full_name_furigana')} className="w-full bg-brand-stone-800/50 border border-brand-stone-700 text-brand-stone-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-emerald-500 transition-all shadow-inner" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-brand-stone-500 pl-1">国籍</label>
                          <input {...register('nationality')} className="w-full bg-brand-stone-800/50 border border-brand-stone-700 text-brand-stone-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-emerald-500 transition-all shadow-inner" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-brand-stone-500 pl-1">電話番号</label>
                          <input {...register('phone')} className="w-full bg-brand-stone-800/50 border border-brand-stone-700 text-brand-stone-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-emerald-500 transition-all shadow-inner" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-brand-stone-500 pl-1">LINEのニックネーム</label>
                          <input {...register('line_id')} className="w-full bg-brand-stone-800/50 border border-brand-stone-700 text-brand-stone-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-emerald-500 transition-all shadow-inner" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-brand-stone-500 pl-1">出身地</label>
                          <input {...register('hometown')} className="w-full bg-brand-stone-800/50 border border-brand-stone-700 text-brand-stone-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-emerald-500 transition-all shadow-inner" />
                        </div>
                      </div>

                      <div className="pt-6 flex justify-end gap-3">
                        <Dialog.Close asChild>
                          <button type="button" className="px-5 py-2.5 hover:bg-brand-stone-800 text-brand-stone-400 text-sm font-bold rounded-xl transition-colors">キャンセル</button>
                        </Dialog.Close>
                        <button 
                          type="submit" 
                          disabled={updateProfileMutation.isPending}
                          className="px-8 py-2.5 bg-brand-stone-50 hover:bg-white text-brand-stone-900 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-black/20 active:scale-95"
                        >
                          {updateProfileMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                          保存する
                        </button>
                      </div>
                    </form>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
          </div>
        </div>

        {/* Right Column: Registrations History */}
        <div className="lg:col-span-2">
          <div className="bg-brand-stone-900 border border-brand-stone-800 rounded-sm h-full">
            <div className="p-6 border-b border-brand-stone-800 flex items-center justify-between">
              <h3 className="text-xl font-serif text-brand-stone-50">活動履歴</h3>
              <div className="text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 bg-brand-stone-800/50 text-brand-stone-400 rounded-full border border-brand-stone-700/50">
                {selectedYear?.name}学年度
              </div>
            </div>

            <div className="p-6">
              {isHistoryLoading ? (
                <div className="py-20 flex justify-center">
                  <Loader2 className="w-6 h-6 text-brand-stone-500 animate-spin" />
                </div>
              ) : historyData && historyData.length > 0 ? (
                <div className="relative border-l border-brand-stone-800 pl-6 ml-3 space-y-10">
                  {historyData.map((reg: any) => {
                    const activity = reg.activities;
                    const isMissing = reg.attendance_status === 'unexcused_absence';
                    const isExcused = reg.attendance_status === 'excused_absence';
                    const isPresent = reg.attendance_status === 'present';
                    const isPending = !reg.attendance_status || reg.attendance_status === 'pending';

                    let badgeProps = { label: '出席確認中', color: 'text-brand-stone-400 bg-brand-stone-800 border-brand-stone-700' };
                    if (isPresent) badgeProps = { label: '出席', color: 'text-brand-emerald-400 bg-brand-emerald-950/40 border-brand-emerald-500/30' };
                    if (isExcused) badgeProps = { label: '公欠', color: 'text-amber-400 bg-amber-950/40 border-amber-500/30' };
                    if (isMissing) badgeProps = { label: '欠席', color: 'text-rose-400 bg-rose-950/40 border-rose-500/30' };

                    return (
                      <div key={reg.id} className="relative">
                        {/* Timeline Dot */}
                        <div className={`absolute -left-[31px] top-1.5 w-3 h-3 rounded-full border-2 border-brand-stone-900 ${
                            isPending ? 'bg-brand-stone-600' : 
                            isPresent ? 'bg-brand-emerald-500' : 
                            isExcused ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                        />
                        
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div>
                            <h4 className="text-lg font-serif text-brand-stone-100 group-hover:text-brand-emerald-400 transition-colors">
                              {activity.title}
                            </h4>
                            <p className="text-sm text-brand-stone-400 mt-1 flex items-center gap-2">
                              {format(new Date(activity.date), 'dd/MM/yyyy HH:mm')} 
                              <span className="w-1 h-1 rounded-full bg-brand-stone-700 block"></span>
                              <span className="truncate max-w-[200px]">{activity.location}</span>
                            </p>
                          </div>

                          <div className="flex flex-col sm:items-end gap-2 shrink-0">
                            <span className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest rounded-sm border ${badgeProps.color} inline-block whitespace-nowrap`}>
                              {badgeProps.label}
                            </span>
                          </div>
                        </div>

                        {reg.admin_note && (
                          <div className="mt-3 bg-brand-stone-800/30 border border-brand-stone-800 p-3 rounded-sm">
                            <p className="text-xs text-brand-stone-400 italic flex gap-2">
                              <Info className="w-3.5 h-3.5 text-brand-stone-500 shrink-0 mt-0.5" />
                              "{reg.admin_note}"
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-24 text-center flex flex-col items-center relative overflow-hidden group">
                  {/* Background Decoration */}
                  <div className="absolute inset-0 bg-gradient-to-b from-brand-emerald-500/5 to-transparent pointer-events-none" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-brand-emerald-500/10 blur-[100px] rounded-full group-hover:bg-brand-emerald-500/20 transition-colors duration-1000" />

                  <div className="relative z-10">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-brand-stone-800 to-brand-stone-900 flex items-center justify-center mb-6 mx-auto shadow-2xl border border-brand-stone-700/50 group-hover:rotate-6 transition-transform duration-500">
                      <Sparkles className="w-10 h-10 text-brand-emerald-400 animate-pulse" />
                    </div>
                    
                    <h3 className="text-2xl font-serif text-brand-stone-50 mb-3 tracking-tight">新しい冒険が待っています</h3>
                    <p className="text-brand-stone-400 text-base max-w-[320px] mx-auto leading-relaxed mb-10">
                      ボランティア活動に参加して、一緒に素晴らしい価値を広めましょう。
                    </p>
                    
                    <button 
                      onClick={() => window.location.href = '/activities'}
                      className="group/btn flex items-center gap-2 px-8 py-4 bg-brand-stone-50 hover:bg-white text-brand-stone-900 rounded-2xl font-bold text-sm transition-all shadow-xl shadow-black/20 hover:scale-105 active:scale-95"
                    >
                      <Compass className="w-4 h-4 group-hover/btn:rotate-90 transition-transform duration-500" />
                      今すぐ探す
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
