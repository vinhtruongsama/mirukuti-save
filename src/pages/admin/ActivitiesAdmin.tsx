import { useState, useRef, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, isPast } from 'date-fns';
import { Search, Plus, Edit2, Trash2, CalendarDays, Loader2, Camera, Activity, X, Compass, Clock, Users } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { useDebounce } from '../../hooks/useDebounce';

// --- ZOD SCHEMA ---
const activitySchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'タイトルを入力してください'),
  description: z.string().optional(),
  date: z.string().min(1, '開催日時を入力してください'),
  registration_deadline: z.string().min(1, '申込締切を入力してください'),
  location: z.string().min(1, '開催場所を入力してください'),
  capacity: z.number().min(1).optional().or(z.nan()),
  form_link: z.string().url('有効なURLを入力してください').optional().or(z.literal('')),
  status: z.enum(['open', 'closed', 'draft']),
});

type ActivityFormData = z.infer<typeof activitySchema>;

export default function ActivitiesAdmin() {
  const queryClient = useQueryClient();
  const { selectedYear } = useAppStore();

  // States
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<ActivityFormData>({
    resolver: zodResolver(activitySchema),
    defaultValues: { status: 'open' }
  });

  const watchTitle = useWatch({ control, name: 'title' });

  // 1. Fetch
  const { data: activities, isLoading } = useQuery({
    queryKey: ['admin-activities', selectedYear?.id],
    queryFn: async () => {
      if (!selectedYear) return [];
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('academic_year_id', selectedYear.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!selectedYear,
  });

  // 2. Filter
  const filteredData = useMemo(() => {
    let result = activities || [];
    if (debouncedSearch.trim()) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter(a => a.title.toLowerCase().includes(lower) || a.location.toLowerCase().includes(lower));
    }
    return result;
  }, [activities, debouncedSearch]);

  // 3. Save Mutation (Upload Image -> Insert/Update DB)
  const saveMutation = useMutation({
    mutationFn: async (data: ActivityFormData) => {
      let finalCoverUrl = editingActivity?.cover_image_url;

      // Handle Image Upload if exists
      if (coverFile) {
        const fileExt = coverFile.name.split('.').pop();
        const fileName = `cover_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('activity_covers')
          .upload(fileName, coverFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('activity_covers')
          .getPublicUrl(fileName);

        finalCoverUrl = publicUrl;
      }

      const payload = {
        title: data.title,
        description: data.description,
        date: new Date(data.date).toISOString(),
        registration_deadline: new Date(data.registration_deadline).toISOString(),
        location: data.location,
        capacity: isNaN(data.capacity as number) ? null : data.capacity,
        form_link: data.form_link === '' ? null : data.form_link,
        status: data.status,
        cover_image_url: finalCoverUrl,
        academic_year_id: selectedYear!.id
      };

      if (editingActivity?.id) {
        // Update
        const { error } = await supabase.from('activities').update(payload).eq('id', editingActivity.id);
        if (error) throw error;
      } else {
        // Create
        const { error } = await supabase.from('activities').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingActivity ? 'イベントを更新しました' : 'イベントを作成しました');
      queryClient.invalidateQueries({ queryKey: ['admin-activities'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      setModalOpen(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message)
  });

  // 4. Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('activities').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('イベントを削除しました');
      queryClient.invalidateQueries({ queryKey: ['admin-activities'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
    onError: (err: any) => toast.error(err.message)
  });

  const resetForm = () => {
    reset({
      title: '', description: '', date: '', registration_deadline: '',
      location: '', capacity: '' as any, form_link: '', status: 'open'
    });
    setEditingActivity(null);
    setCoverFile(null);
    setCoverPreview(null);
  };

  const openForm = (act?: any) => {
    resetForm();
    if (act) {
      setEditingActivity(act);
      setCoverPreview(act.cover_image_url);

      // Convert ISO strings to local datetime-local format format (YYYY-MM-DDTHH:mm)
      const toLocalDT = (iso: string) => {
        const d = new Date(iso);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      };

      reset({
        id: act.id,
        title: act.title,
        description: act.description || '',
        date: act.date ? toLocalDT(act.date) : '',
        registration_deadline: act.registration_deadline ? toLocalDT(act.registration_deadline) : '',
        location: act.location,
        capacity: act.capacity || NaN,
        form_link: act.form_link || '',
        status: act.status
      });
    }
    setModalOpen(true);
  };

  const onCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  // --- IMAGE OPTIMIZATION (WebP, < 500KB, 1280px) ---
  const optimizeImage = useCallback(async (blob: Blob): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        // Target: 1280x720 (16:9)
        canvas.width = 1280;
        canvas.height = 720;

        // Draw with cover fit logic
        const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width / 2) - (img.width / 2) * scale;
        const y = (canvas.height / 2) - (img.height / 2) * scale;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

        // Export as WebP with 0.8 quality to hit < 500KB easily
        canvas.toBlob((result) => {
          if (!result) return reject(new Error('画像処理エラー'));
          const file = new File([result], `cover_${Date.now()}.webp`, { type: 'image/webp' });
          resolve(file);
        }, 'image/webp', 0.85);
      };
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      img.src = URL.createObjectURL(blob);
    });
  }, []);

  const handleRandomImage = useCallback(async () => {
    if (!watchTitle || watchTitle.trim().length < 2) {
      toast.error('画像を探すためにイベント名を入力してください');
      return;
    }

    setIsProcessingImage(true);
    setProcessingStatus('最適な画像を探しています...');

    try {
      // Use LoremFlickr for reliable topic-based redirect
      const topic = encodeURIComponent(watchTitle.split(' ').slice(0, 2).join(','));
      const url = `https://loremflickr.com/1280/720/${topic || 'volunteer'}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('画像の取得に失敗しました');

      const blob = await response.blob();
      setProcessingStatus('WebP形式に最適化中...');

      const optimizedFile = await optimizeImage(blob);

      setCoverFile(optimizedFile);
      setCoverPreview(URL.createObjectURL(optimizedFile));

      toast.success('画像を生成し、最適化しました');
    } catch (err: any) {
      toast.error('エラー: ' + err.message);
    } finally {
      setIsProcessingImage(false);
      setProcessingStatus('');
    }
  }, [watchTitle, optimizeImage]);

  return (
    <div className="min-h-screen relative overflow-hidden p-4 lg:pt-4 lg:px-10">
      {/* Dynamic Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <motion.div
          animate={{
            x: [0, 40, 0],
            y: [0, -60, 0],
            scale: [1, 1.1, 1]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-[#4F5BD5]/10 blur-[120px] rounded-full"
        />
        <motion.div
          animate={{
            x: [0, -50, 0],
            y: [0, 40, 0],
            scale: [1, 1.2, 1]
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-[5%] left-[-10%] w-[600px] h-[600px] bg-[#FEDA75]/5 blur-[150px] rounded-full"
        />
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[20%] left-[20%] w-[400px] h-[400px] bg-[#D62976]/10 blur-[100px] rounded-full"
        />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto space-y-6">
        {/* Header Section: Compacted */}
        <div className="flex flex-row justify-between items-center pb-4 border-b border-white/5">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1"
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-5 bg-gradient-to-b from-[#D62976] to-[#4F5BD5] rounded-full" />
              <h1 className="text-xl sm:text-2xl font-black tracking-tighter text-gray-900 uppercase">
                活動管理
              </h1>
            </div>
            <p className="text-[13px] font-black text-gray-400 uppercase tracking-[0.2em] ml-3 hidden sm:block">
              Management <span className="text-[#D62976]">Console</span>
            </p>
            {/* Mobile specific console label */}
            <span className="text-[13px] font-black text-[#D62976] uppercase tracking-widest ml-3 sm:hidden">管理コンソール</span>
          </motion.div>

          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => openForm()}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#D62976] to-[#4F5BD5] text-white rounded-2xl text-[13px] font-black shadow-[0_10px_20px_rgba(214,41,118,0.15)] transition-all uppercase tracking-widest shrink-0 ml-4"
          >
            <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">イベントを追加</span><span className="sm:hidden">追加</span>
          </motion.button>
        </div>

        {/* Search Bar Row: Occupying Full Width since Stats are removed */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-[#D62976]/5 to-[#4F5BD5]/5 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
          <div className="relative flex items-center bg-white border border-gray-100 rounded-2xl p-1 shadow-sm">
            <Search className="ml-4 w-4 h-4 text-gray-300" />
            <input
              type="text"
              placeholder="活動を検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 bg-transparent text-gray-900 rounded-xl text-[13px] font-black focus:outline-none placeholder:text-gray-200 uppercase tracking-widest"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-12 h-12 text-[#D62976] animate-spin" /></div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-32 bg-white border border-gray-100 rounded-[3rem] shadow-sm">
            <Activity className="w-16 h-16 text-gray-200 mx-auto mb-6" />
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No matching activities found in this year.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 pb-20">
            {filteredData.map((act) => (
              <motion.div
                layout
                key={act.id}
                className="group bg-white rounded-[2.5rem] overflow-hidden shadow-sm hover:shadow-[0_40px_80px_rgba(0,0,0,0.06)] border border-gray-100 transition-all duration-700 flex flex-col relative"
              >
                {/* Image Container */}
                <div className="h-64 bg-gray-50 relative overflow-hidden">
                  {act.cover_image_url ? (
                    <motion.img
                      whileHover={{ scale: 1.1 }}
                      transition={{ duration: 0.8 }}
                      src={act.cover_image_url}
                      alt={act.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center opacity-30 text-gray-400">
                      <CalendarDays className="w-12 h-12 mb-2" />
                    </div>
                  )}

                  {/* Visual Glow behind badge */}
                  {(() => {
                    const isPastDeadline = isPast(new Date(act.registration_deadline));
                    const isFull = act.capacity && (act.registered_count || 0) >= act.capacity;
                    const isClosed = act.status === 'closed' || isPastDeadline || isFull;
                    const isDraft = act.status === 'draft';

                    if (isDraft) return (
                      <div className="absolute top-6 left-6 px-4 py-2 text-[13px] font-black uppercase tracking-widest rounded-full backdrop-blur-xl border z-10 bg-gray-900 text-white border-gray-700">
                        下書き
                      </div>
                    );

                    return (
                      <div className={`absolute top-6 left-6 px-4 py-2 text-[12px] font-black uppercase tracking-[0.2em] rounded-full backdrop-blur-md border z-10 shadow-sm transition-all duration-300 ${!isClosed
                          ? 'bg-emerald-500 text-white border-emerald-400/50 shadow-[0_4px_15px_rgba(16,185,129,0.2)]'
                          : 'bg-white/95 text-brand-stone-500 border-white/50'
                        }`}>
                        {!isClosed ? '募集中' : '募集終了'}
                      </div>
                    );
                  })()}

                  {/* Floating Action Overlay on Hover */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center justify-center gap-3">
                    <button onClick={() => openForm(act)} className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-gray-900 hover:scale-110 active:scale-90 transition-all shadow-xl">
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button onClick={() => { if (window.confirm('このイベントを削除してもよろしいですか？')) deleteMutation.mutate(act.id); }} className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-[#D62976] hover:scale-110 active:scale-90 transition-all shadow-xl">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Content Panel */}
                <div className="p-8 flex-1 flex flex-col relative bg-white">
                  <span className="text-[13px] font-black text-gray-300 uppercase tracking-[0.3em] mb-2">
                    {format(new Date(act.date), 'yyyy.MM.dd')}
                  </span>
                  <h3 className="text-xl font-black text-gray-900 mb-6 line-clamp-2 leading-tight group-hover:text-[#4F5BD5] transition-colors">{act.title}</h3>

                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-gray-50 rounded-2xl p-4 flex flex-col">
                      <span className="text-[13px] font-black text-gray-400 uppercase tracking-widest mb-1">参加者</span>
                      <span className="text-sm font-black text-gray-900">{act.registered_count || 0} / {act.capacity || '∞'}</span>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4 flex flex-col overflow-hidden">
                      <span className="text-[13px] font-black text-gray-400 uppercase tracking-widest mb-1">場所</span>
                      <span className="text-sm font-black text-gray-900 truncate">{act.location}</span>
                    </div>
                  </div>

                  <Link
                    to={`/admin/activities/${act.id}`}
                    className="mt-auto w-full group/btn relative flex items-center justify-center gap-3 px-6 py-4 bg-gray-900 text-white rounded-2xl text-[13px] font-black uppercase tracking-[0.2em] overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-[#D62976] to-[#4F5BD5] opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500" />
                    <Activity className="w-4 h-4 relative z-10" />
                    <span className="relative z-10">出欠管理</span>
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        <Dialog.Root open={modalOpen} onOpenChange={(open) => { if (!open) resetForm(); setModalOpen(open); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-gray-900/40 backdrop-blur-md z-50 overflow-y-auto grid place-items-center py-10" />
            <Dialog.Content className="fixed left-[50%] top-[50%] z-[60] w-full max-w-4xl translate-x-[-50%] translate-y-[-50%] bg-white border border-gray-100 shadow-[0_40px_100px_rgba(0,0,0,0.1)] sm:rounded-[3rem] p-0 overflow-hidden flex flex-col max-h-[90vh]">

              <div className="p-10 border-b border-gray-50 bg-gray-50/50 backdrop-blur-xl shrink-0 flex justify-between items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#D62976]/5 blur-3xl rounded-full translate-x-10 -translate-y-10" />
                <div>
                  <Dialog.Title className="text-3xl font-black text-gray-900 tracking-tighter uppercase mb-2">
                    {editingActivity ? '活动内容を編集' : '新規イベント作成'}
                  </Dialog.Title>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-[2px] bg-[#D62976]" />
                    <p className="text-[13px] font-black text-[#4F5BD5] uppercase tracking-widest">高度な管理インターフェース</p>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="relative z-[100] w-12 h-12 rounded-2xl bg-white border border-gray-100 text-gray-400 hover:text-[#D62976] hover:border-[#D62976]/20 transition-all flex items-center justify-center shadow-sm cursor-pointer hover:scale-105 active:scale-95"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </Dialog.Close>
              </div>

              <div className="p-10 overflow-y-auto [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[#D62976]/60 transition-all pr-4">
                <form id="activity-form" onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-12">
                  {/* Image Part */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-[#D62976]/10 rounded-2xl flex items-center justify-center text-[#D62976]">
                        <Camera className="w-5 h-5" />
                      </div>
                      <label className="text-[15px] font-black text-gray-800 uppercase tracking-widest">カバー画像</label>
                    </div>

                    <div className="relative group">
                      <div
                        onClick={() => !isProcessingImage && coverInputRef.current?.click()}
                        className={`w-full h-72 border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center overflow-hidden transition-all relative ${isProcessingImage
                            ? 'border-[#D62976]/50 bg-[#D62976]/5 cursor-wait'
                            : 'border-gray-100 hover:border-[#D62976]/50 bg-gray-50/50 cursor-pointer'
                          }`}
                      >
                        {isProcessingImage && (
                          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md">
                            <Loader2 className="w-12 h-12 text-[#D62976] animate-spin mb-4" />
                            <p className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em] animate-pulse">{processingStatus}</p>
                          </div>
                        )}

                        {coverPreview ? (
                          <>
                            <img src={coverPreview} alt="Cover Preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-md">
                              <span className="text-white text-[13px] font-black uppercase tracking-widest bg-white/20 px-8 py-4 rounded-full border border-white/20 backdrop-blur-md">画像を変更</span>
                            </div>
                          </>
                        ) : (
                          <div className="text-gray-300 flex flex-col items-center text-center p-8">
                            <div className="w-20 h-20 bg-white shadow-sm rounded-3xl flex items-center justify-center mb-4 border border-gray-50">
                              <Camera className="w-8 h-8 text-gray-200" />
                            </div>
                            <span className="text-[13px] font-black text-gray-400 uppercase tracking-widest">クリックしてブランドビジュアルをアップロード</span>
                          </div>
                        )}
                      </div>

                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleRandomImage}
                        disabled={isProcessingImage}
                        className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3 px-10 py-5 bg-white text-gray-900 rounded-full text-[13px] font-black uppercase tracking-widest shadow-[0_20px_40px_rgba(0,0,0,0.1)] border border-gray-100 z-20 hover:text-[#D62976] transition-colors"
                      >
                        <Activity className="w-4 h-4 text-[#D62976]" />
                        画像を自動生成
                      </motion.button>
                    </div>

                    <input type="file" accept="image/jpeg, image/png" ref={coverInputRef} onChange={onCoverChange} className="hidden" />
                  </div>

                  {/* Fields Part */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                    <div className="space-y-3 sm:col-span-2">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-4 bg-[#4F5BD5] rounded-full" />
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">イベント名 *</label>
                      </div>
                      <input {...register('title')} className="w-full bg-gray-50 border border-gray-100 text-gray-900 rounded-3xl px-8 py-5 text-sm font-bold focus:bg-white focus:border-[#4F5BD5]/30 focus:shadow-[0_20px_40px_rgba(79,91,213,0.05)] outline-none transition-all placeholder:text-gray-300 uppercase tracking-widest" placeholder="イベント名を入力..." />
                      {errors.title && <p className="text-[#D62976] text-[10px] font-black uppercase tracking-widest px-8 mt-2">{errors.title.message}</p>}
                    </div>

                    <div className="space-y-3 sm:col-span-2">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-4 bg-gray-200 rounded-full" />
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">詳細説明</label>
                      </div>
                      <textarea {...register('description')} rows={4} className="w-full bg-gray-50 border border-gray-100 text-gray-900 rounded-3xl px-8 py-6 text-sm font-bold focus:bg-white focus:border-gray-200 outline-none transition-all resize-none placeholder:text-gray-300" placeholder="イベントの詳細内容を入力..." />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 text-[#D62976]" />
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">開催日時 *</label>
                      </div>
                      <input type="datetime-local" {...register('date')} className="w-full bg-gray-50 border border-gray-100 text-gray-900 rounded-3xl px-8 py-5 text-sm font-bold focus:bg-white focus:border-[#D62976]/30 outline-none transition-all" />
                      {errors.date && <p className="text-[#D62976] text-[10px] font-black uppercase tracking-widest px-8 mt-2">{errors.date.message}</p>}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 text-[#4F5BD5]" />
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">申込締切 *</label>
                      </div>
                      <input type="datetime-local" {...register('registration_deadline')} className="w-full bg-gray-50 border border-gray-100 text-gray-900 rounded-3xl px-8 py-5 text-sm font-bold focus:bg-white focus:border-[#4F5BD5]/30 outline-none transition-all" />
                      {errors.registration_deadline && <p className="text-[#D62976] text-[10px] font-black uppercase tracking-widest px-8 mt-2">{errors.registration_deadline.message}</p>}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Compass className="w-4 h-4 text-[#FEDA75]" />
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">開催場所 *</label>
                      </div>
                      <input {...register('location')} className="w-full bg-gray-50 border border-gray-100 text-gray-900 rounded-3xl px-8 py-5 text-sm font-bold focus:bg-white outline-none transition-all placeholder:text-gray-300" placeholder="場所を入力..." />
                      {errors.location && <p className="text-[#D62976] text-[10px] font-black uppercase tracking-widest px-8 mt-2">{errors.location.message}</p>}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Users className="w-4 h-4 text-gray-400" />
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">定員</label>
                      </div>
                      <input type="number" {...register('capacity', { valueAsNumber: true })} placeholder="無制限の場合は空欄" className="w-full bg-gray-50 border border-gray-100 text-gray-900 rounded-3xl px-8 py-5 text-sm font-bold focus:bg-white outline-none transition-all" />
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-8">公開ステータス</label>
                      <select {...register('status')} className="w-full bg-gray-50 border border-gray-100 text-gray-900 rounded-3xl px-8 py-5 text-sm font-black uppercase tracking-widest focus:bg-white outline-none transition-all cursor-pointer">
                        <option value="draft">下書き (非公開)</option>
                        <option value="open">公開 (募集中)</option>
                        <option value="closed">締切 (募集終了)</option>
                      </select>
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-10 border-t border-gray-50 bg-gray-50/50 backdrop-blur-xl shrink-0 flex justify-end gap-6">
                <Dialog.Close asChild>
                  <button type="button" className="px-10 py-5 hover:bg-white hover:shadow-sm text-gray-500 hover:text-gray-900 text-xs font-black uppercase tracking-widest rounded-3xl transition-all">キャンセル</button>
                </Dialog.Close>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  form="activity-form"
                  disabled={saveMutation.isPending}
                  className="px-12 py-5 bg-gradient-to-r from-[#D62976] to-[#4F5BD5] text-white text-[13px] font-black uppercase tracking-[0.2em] rounded-3xl transition-all shadow-[0_20px_40px_rgba(214,41,118,0.2)] flex items-center justify-center gap-3 min-w-[220px]"
                >
                  {saveMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : '承認して保存'}
                </motion.button>
              </div>

            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </div>
  );
}
