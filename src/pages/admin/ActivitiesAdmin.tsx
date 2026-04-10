import { useState, useRef, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, isPast } from 'date-fns';
import { Search, Plus, Edit2, CalendarDays, Loader2, Camera, Activity, X, Compass, Clock, Users, Calendar, Pin, PinOff, Trash2, Check, ChevronDown } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { useDebounce } from '../../hooks/useDebounce';
import ActivityDeleteConfirmModal from '../../components/admin/ActivityDeleteConfirmModal';

// --- ZOD SCHEMA ---
const activitySchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'タイトルを入力してください'),
  description: z.string().optional(),
  date: z.string().min(1, '開催日時を入力してください'),
  registration_deadline: z.string().min(1, '申込締切を入力してください'),
  cancellation_deadline: z.string().optional(),
  location: z.string().min(1, '開催場所を入力してください'),
  location_type: z.enum(['internal', 'external']),
  capacity: z.number().min(0, '0以上の数値を入力してください').optional().nullable().or(z.nan()),
  sessions: z.array(z.object({
    date: z.string().min(1, '日付'),
    start_time: z.string().min(1, '開始時間'),
    end_time: z.string().min(1, '終了時間'),
    capacity: z.number().min(0).optional().nullable().or(z.nan()),
  })).optional(),
  status: z.enum(['open', 'closed', 'draft']),
  is_pinned: z.boolean().optional(),
});

type ActivityFormData = z.infer<typeof activitySchema>;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function ActivitiesAdmin() {
  const queryClient = useQueryClient();
  const { selectedYear } = useAppStore();

  // States
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  const { register, handleSubmit, reset, control, setValue, watch, formState: { errors } } = useForm<ActivityFormData>({
    resolver: zodResolver(activitySchema),
    defaultValues: { status: 'open', location_type: 'internal', sessions: [], is_pinned: false }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "sessions"
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
        .order('is_pinned', { ascending: false })
        .order('pinned_at', { ascending: false })
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
        cancellation_deadline: data.cancellation_deadline ? new Date(data.cancellation_deadline).toISOString() : null,
        location: data.location,
        location_type: data.location_type,
        capacity: isNaN(data.capacity as number) ? null : data.capacity,
        status: data.status,
        sessions: data.sessions,
        cover_image_url: finalCoverUrl,
        academic_year_id: selectedYear!.id,
        is_pinned: data.is_pinned || false,
        pinned_at: (data.is_pinned && !editingActivity?.is_pinned) ? new Date().toISOString() : editingActivity?.pinned_at
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
      const { error } = await supabase.from('activities').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('イベントを削除しました');
      queryClient.invalidateQueries({ queryKey: ['admin-activities'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
    onError: (err: any) => toast.error(err.message)
  });

  // 5. Toggle Pin Mutation
  const togglePinMutation = useMutation({
    mutationFn: async ({ id, isPinned }: { id: string, isPinned: boolean }) => {
      const { error } = await supabase
        .from('activities')
        .update({
          is_pinned: isPinned,
          pinned_at: isPinned ? new Date().toISOString() : null
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(variables.isPinned ? 'イベントを固定しました' : '固定を解除しました');
      queryClient.invalidateQueries({ queryKey: ['admin-activities'] });
    },
    onError: (err: any) => toast.error(err.message)
  });

  const resetForm = () => {
    reset({
      title: '', description: '', date: '', registration_deadline: '',
      cancellation_deadline: '',
      location: '', capacity: NaN as any, status: 'open', is_pinned: false,
      sessions: []
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

      const toLocalDT = (iso: string) => {
        const d = new Date(iso);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      };

      const toLocalDate = (iso: string) => {
        const d = new Date(iso);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      };

      reset({
        id: act.id,
        title: act.title,
        description: act.description || '',
        date: act.date ? toLocalDate(act.date) : '',
        registration_deadline: act.registration_deadline ? toLocalDate(act.registration_deadline) : '',
        cancellation_deadline: act.cancellation_deadline ? toLocalDate(act.cancellation_deadline) : '',
        location: act.location,
        location_type: act.location_type || 'internal',
        capacity: act.capacity === null ? NaN : act.capacity,
        status: act.status,
        is_pinned: act.is_pinned || false,
        sessions: act.sessions || []
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


  return (
    <div className="min-h-screen relative overflow-hidden p-4 lg:pt-4 lg:px-10">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-[#4F5BD5]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[5%] left-[-10%] w-[600px] h-[600px] bg-[#FEDA75]/3 blur-[150px] rounded-full" />
        <div className="absolute top-[20%] left-[20%] w-[400px] h-[400px] bg-[#D62976]/5 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto space-y-6">
        {/* Header Section: Compacted */}
        <div className="flex flex-row justify-between items-center pb-4 border-b border-white/5">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-start gap-6"
          >
            {/* Vertical Gradient Bar */}
            <div className="w-1.5 h-16 rounded-full bg-gradient-to-b from-[#D62976] to-[#4F5BD5] mt-1 hidden sm:block" />

            <div className="flex flex-col gap-3 text-left">
              <h1 className="text-4xl md:text-4xl font-black text-brand-stone-900 tracking-tighter leading-none">
                活動管理
              </h1>
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.4em] leading-none">
                <span className="text-brand-stone-400">Management</span>
                <span className="text-[#D62976]">Console</span>
              </div>
            </div>
          </motion.div>

          <div className="flex items-center gap-2">

            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => openForm()}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#D62976] to-[#4F5BD5] text-white rounded-2xl text-[13px] font-black shadow-[0_10px_20px_rgba(214,41,118,0.15)] transition-all uppercase tracking-widest shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">イベント</span><span className="sm:hidden">追加</span>
            </motion.button>
          </div>
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
              <div
                key={act.id}
                className="group bg-white rounded-[2.5rem] overflow-hidden shadow-sm hover:shadow-[0_30px_60px_rgba(0,0,0,0.08)] border border-gray-100 transition-all duration-500 flex flex-col relative"
              >
                {/* Image Container */}
                <div className="h-64 bg-gray-50 relative overflow-hidden">
                  {act.cover_image_url ? (
                    <img
                      src={act.cover_image_url}
                      alt={act.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
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

                  {/* Pin Badge */}
                  {act.is_pinned && (
                    <div className="absolute top-6 right-6 w-10 h-10 bg-[#4F5BD5] text-white rounded-2xl flex items-center justify-center shadow-lg shadow-[#4F5BD5]/30 z-10 scale-100 group-hover:scale-110 transition-transform">
                      <Pin className="w-5 h-5 fill-current" />
                    </div>
                  )}

                  {/* Floating Action Overlay on Hover */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center justify-center gap-3">
                    <button onClick={() => openForm(act)} className="px-6 py-4 bg-white rounded-2xl flex items-center justify-center gap-3 text-gray-900 hover:scale-105 active:scale-95 transition-all shadow-xl font-black text-[14px] uppercase tracking-widest">
                      <Edit2 className="w-4 h-4" /> 編集する
                    </button>
                    <button
                      onClick={() => togglePinMutation.mutate({ id: act.id, isPinned: !act.is_pinned })}
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-xl active:scale-90 ${act.is_pinned ? 'bg-[#4F5BD5] text-white hover:bg-white hover:text-[#4F5BD5]' : 'bg-white text-gray-900 hover:bg-[#4F5BD5] hover:text-white'
                        }`}
                      title={act.is_pinned ? '固定を解除' : 'トップに固定'}
                    >
                      {act.is_pinned ? <PinOff className="w-6 h-6" /> : <Pin className="w-6 h-6" />}
                    </button>
                  </div>
                </div>

                {/* Content Panel */}
                <div className="p-8 pt-12 flex-1 flex flex-col relative bg-white">
                  {/* Attendance Button (Repositioned to junction) */}
                  <div className="absolute -top-7 left-8 right-8 z-30">
                    <Link
                      to={`/admin/activities/${act.id}`}
                      className="w-full relative flex items-center justify-center gap-3 px-6 py-4.5 bg-gradient-to-r from-[#D62976] to-[#4F5BD5] text-white rounded-2xl text-[14px] font-black uppercase tracking-[0.2em] shadow-xl shadow-[#4F5BD5]/30 hover:scale-[1.03] active:scale-95 transition-all duration-300"
                    >
                      <Activity className="w-4 h-12" />
                      <span>出欠管理</span>
                    </Link>
                  </div>

                  <span className="text-[13px] font-black text-gray-300 uppercase tracking-[0.3em] mb-2">
                    {format(new Date(act.date), 'yyyy.MM.dd')}
                  </span>
                  <h3 className="text-xl font-black text-gray-900 mb-6 line-clamp-2 leading-tight group-hover:text-[#4F5BD5] transition-colors">{act.title}</h3>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-gray-50 rounded-2xl p-4 flex flex-col">
                      <span className="text-[13px] font-black text-gray-400 uppercase tracking-widest mb-1">参加者</span>
                      <span className="text-sm font-black text-gray-900">{act.registered_count || 0} / {act.capacity || '∞'}</span>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4 flex flex-col overflow-hidden">
                      <span className="text-[13px] font-black text-gray-400 uppercase tracking-widest mb-1">場所</span>
                      <span className="text-sm font-black text-gray-900 truncate">{act.location}</span>
                    </div>
                  </div>

                  {/* Mobile Quick Actions (Tasks: Edit & Pin moved to bottom for better balance) */}
                  <div className="mt-auto flex items-center gap-3">
                    <button
                      onClick={() => openForm(act)}
                      className="lg:hidden flex-1 py-4 bg-white border-2 border-stone-100 rounded-2xl flex items-center justify-center gap-2 text-stone-900 font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all shadow-sm"
                    >
                      <Edit2 size={16} /> 編集
                    </button>

                    <button
                      onClick={() => togglePinMutation.mutate({ id: act.id, isPinned: !act.is_pinned })}
                      className={`lg:hidden w-14 h-14 rounded-2xl flex items-center justify-center active:scale-90 transition-all border-2 shadow-sm ${act.is_pinned ? 'bg-[#4F5BD5] text-white border-[#4F5BD5]' : 'bg-white text-stone-900 border-stone-100'
                        }`}
                    >
                      {act.is_pinned ? <PinOff size={20} /> : <Pin size={20} />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}



        {/* Create/Edit Modal */}
        <Dialog.Root open={modalOpen} onOpenChange={(open) => { if (!open) resetForm(); setModalOpen(open); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-gray-900/40 backdrop-blur-md z-50 overflow-y-auto grid place-items-center py-10" />
            <Dialog.Content className="fixed left-[50%] top-[50%] z-[60] w-full max-w-4xl translate-x-[-50%] translate-y-[-50%] bg-white border border-gray-200 shadow-[0_40px_100px_rgba(0,0,0,0.1)] sm:rounded-[3rem] p-0 overflow-hidden flex flex-col max-h-[90vh]">

              <div className="py-6 px-10 border-b border-gray-200 bg-gray-50/50 backdrop-blur-xl shrink-0 flex justify-between items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#D62976]/5 blur-3xl rounded-full translate-x-10 -translate-y-10" />
                <div>
                  <Dialog.Title className="text-3xl font-black text-gray-900 tracking-tighter uppercase mb-2">
                    {editingActivity ? '活动内容を編集' : '新規イベント作成'}
                  </Dialog.Title>

                </div>
                <div className="absolute top-5 right-10">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="w-12 h-12 rounded-2xl bg-rose-500 text-white hover:bg-rose-600 transition-all flex items-center justify-center shadow-[0_10px_20px_rgba(244,63,94,0.3)] cursor-pointer hover:scale-105 active:scale-95"
                    >
                      <X className="w-6 h-6" strokeWidth={3} />
                    </button>
                  </Dialog.Close>
                </div>
              </div>

              <div className="flex-1 px-10 py-2 overflow-y-auto [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[#D62976]/60 transition-all">
                <form id="activity-form" onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-12">
                  {/* Image Part */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <div className="w-10 h-10 bg-[#D62976]/10 rounded-2xl flex items-center justify-center text-[#D62976]">
                        <Camera className="w-5 h-5" />
                      </div>
                      <label className="text-[15px] font-black text-gray-800 uppercase tracking-widest">画像</label>
                    </div>

                    <div className="grid grid-cols-1 gap-7 w-full">
                      <div
                        onClick={() => !isProcessingImage && coverInputRef.current?.click()}
                        className={`w-full h-40 border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center overflow-hidden transition-all relative ${isProcessingImage
                          ? 'border-[#D62976]/50 bg-[#D62976]/5 cursor-wait'
                          : 'border-gray-200 hover:border-[#D62976]/50 bg-gray-50/50 cursor-pointer shadow-inner'
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
                          <div className="text-gray-300 flex flex-col items-center text-center p-8 gap-4">
                            <div className="w-24 h-24 bg-white shadow-xl rounded-[2.5rem] flex items-center justify-center border border-gray-100">
                              <Camera className="w-10 h-10 text-gray-200" />
                            </div>
                            <span className="text-sm font-black text-gray-400 uppercase tracking-[0.3em]">画像をアップロード</span>
                          </div>
                        )}
                      </div>

                    </div>

                    <input type="file" accept="image/jpeg, image/png" ref={coverInputRef} onChange={onCoverChange} className="hidden" />
                  </div>

                  {/* Fields Part */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                    <div className="space-y-3 sm:col-span-2">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-4 bg-[#4F5BD5] rounded-full" />
                        <label className="text-[14px] font-black text-gray-800 uppercase tracking-widest">イベント名 *</label>
                      </div>
                      <input {...register('title')} className="w-full bg-gray-50 border border-gray-400 text-[#0f172a] rounded-3xl px-8 py-5 text-sm font-bold focus:bg-white focus:border-[#4F5BD5]/30 focus:shadow-[0_20px_40px_rgba(79,91,213,0.05)] outline-none transition-all placeholder:text-gray-300 uppercase tracking-widest" placeholder="イベント名を入力..." />
                      {errors.title && <p className="text-[#D62976] text-[10px] font-black uppercase tracking-widest px-8 mt-2">{errors.title.message}</p>}
                    </div>

                    <div className="space-y-3 sm:col-span-2">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-4 bg-gray-200 rounded-full" />
                        <label className="text-[14px] font-black text-gray-800 uppercase tracking-widest">詳細説明</label>
                      </div>
                      <textarea {...register('description')} rows={4} className="w-full bg-gray-50 border border-gray-400 text-[#0f172a] rounded-3xl px-8 py-6 text-sm font-bold focus:bg-white focus:border-gray-200 outline-none transition-all resize-none placeholder:text-gray-300" placeholder="イベントの詳細内容を入力..." />
                    </div>

                    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-6">
                      {/* Event Date Card */}
                      <div className="relative group/card p-6 bg-pink-50/30 border border-pink-100/50 rounded-[2.5rem] transition-all hover:bg-white hover:shadow-[0_20px_40px_rgba(214,41,118,0.05)]">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-[#D62976]/10 rounded-2xl flex items-center justify-center text-[#D62976] shadow-sm">
                            <CalendarDays className="w-5 h-5" />
                          </div>
                          <div>
                            <label className="text-[13px] font-black text-gray-900 uppercase tracking-widest block">開催日時 *</label>
                            <span className="text-[10px] font-bold text-pink-500/60 uppercase tracking-widest">活動が行われる日</span>
                          </div>
                        </div>
                        <div className="relative group/input">
                          <input
                            type="text"
                            readOnly
                            value={(() => {
                              const val = watch('date');
                              return val ? format(new Date(val), 'dd/MM/yyyy') : '';
                            })()}
                            placeholder="DD/MM/YYYY"
                            className="w-full bg-white/50 border border-pink-200/50 text-[#0f172a] rounded-[1.5rem] px-6 py-4 text-sm font-black focus:bg-white focus:border-[#D62976]/30 outline-none transition-all shadow-sm cursor-pointer hover:border-[#D62976]/40"
                          />
                          <input
                            type="date"
                            {...register('date')}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            onClick={(e) => {
                              try {
                                (e.currentTarget as any).showPicker();
                              } catch (err) {
                                // Fallback for older browsers
                              }
                            }}
                          />
                          <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-pink-300 pointer-events-none transition-transform group-hover/input:translate-y-[-40%]" />
                        </div>
                        {errors.date && <p className="text-[#D62976] text-[10px] font-black uppercase tracking-widest px-4 mt-2">{errors.date.message}</p>}
                      </div>

                      {/* Reg Deadline Card */}
                      <div className="relative group/card p-6 bg-indigo-50/30 border border-indigo-100/50 rounded-[2.5rem] transition-all hover:bg-white hover:shadow-[0_20px_40px_rgba(79,91,213,0.05)]">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-[#4F5BD5]/10 rounded-2xl flex items-center justify-center text-[#4F5BD5] shadow-sm">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <label className="text-[13px] font-black text-gray-900 uppercase tracking-widest block">申込締切 *</label>
                            <span className="text-[10px] font-bold text-indigo-500/60 uppercase tracking-widest">参加登録の最後の日</span>
                          </div>
                        </div>
                        <div className="relative group/input">
                          <input
                            type="text"
                            readOnly
                            value={(() => {
                              const val = watch('registration_deadline');
                              return val ? format(new Date(val), 'dd/MM/yyyy') : '';
                            })()}
                            placeholder="DD/MM/YYYY"
                            className="w-full bg-white/50 border border-indigo-200/50 text-[#0f172a] rounded-[1.5rem] px-6 py-4 text-sm font-black focus:bg-white focus:border-[#4F5BD5]/30 outline-none transition-all shadow-sm cursor-pointer hover:border-[#4F5BD5]/40"
                          />
                          <input
                            type="date"
                            {...register('registration_deadline')}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            onClick={(e) => {
                              try {
                                (e.currentTarget as any).showPicker();
                              } catch (err) {}
                            }}
                          />
                          <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-300 pointer-events-none transition-transform group-hover/input:translate-y-[-40%]" />
                        </div>
                        {errors.registration_deadline && <p className="text-[#D62976] text-[10px] font-black uppercase tracking-widest px-4 mt-2">{errors.registration_deadline.message}</p>}
                      </div>

                      {/* Cancel Deadline Card */}
                      <div className="relative group/card p-6 bg-amber-50/30 border border-amber-100/50 rounded-[2.5rem] transition-all hover:bg-white hover:shadow-[0_20px_40px_rgba(245,158,11,0.05)]">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-600 shadow-sm">
                            <Edit2 className="w-5 h-5" />
                          </div>
                          <div>
                            <label className="text-[13px] font-black text-gray-900 uppercase tracking-widest block">取消期限</label>
                            <span className="text-[10px] font-bold text-amber-600/60 uppercase tracking-widest">自身で変更できる最後の日</span>
                          </div>
                        </div>
                        <div className="relative group/input">
                          <input
                            type="text"
                            readOnly
                            value={(() => {
                              const val = watch('cancellation_deadline');
                              return val ? format(new Date(val), 'dd/MM/yyyy') : '';
                            })()}
                            placeholder="DD/MM/YYYY"
                            className="w-full bg-white/50 border border-amber-200/50 text-[#0f172a] rounded-[1.5rem] px-6 py-4 text-sm font-black focus:bg-white focus:border-amber-500/30 outline-none transition-all shadow-sm cursor-pointer hover:border-amber-500/40"
                          />
                          <input
                            type="date"
                            {...register('cancellation_deadline')}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            onClick={(e) => {
                              try {
                                (e.currentTarget as any).showPicker();
                              } catch (err) {}
                            }}
                          />
                          <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-300 pointer-events-none transition-transform group-hover/input:translate-y-[-40%]" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Compass className="w-4 h-4 text-[#FEDA75]" />
                        <label className="text-[14px] font-black text-gray-800 uppercase tracking-widest">開催場所 *</label>
                      </div>
                      <input {...register('location')} className="w-full bg-gray-50 border border-gray-300 text-[#0f172a] rounded-3xl px-8 py-5 text-sm font-bold focus:bg-white outline-none transition-all placeholder:text-gray-300" placeholder="場所を入力..." />
                      {errors.location && <p className="text-[#D62976] text-[10px] font-black uppercase tracking-widest px-8 mt-2">{errors.location.message}</p>}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Users className="w-4 h-4 text-gray-400" />
                        <label className="text-[14px] font-black text-gray-800 uppercase tracking-widest border-gray-300">定員</label>
                      </div>
                      <input type="number" min="0" {...register('capacity', { valueAsNumber: true })} placeholder="無制限の場合は空欄" className="w-full bg-gray-50 border border-gray-200 text-[#0f172a] rounded-3xl px-8 py-5 text-sm font-bold focus:bg-white outline-none transition-all" />
                    </div>

                    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-8 pt-6 border-t border-gray-300">
                      {/* Type Toggle */}
                      <div className="space-y-3">
                        <label className="text-[14px] font-black text-gray-800 uppercase tracking-widest px-8">タイプ</label>
                        <div className="flex gap-4 p-1 bg-gray-50 rounded-3xl border border-gray-300 h-[62px] items-center px-4">
                          <label className="flex-1 cursor-pointer relative">
                            <input type="radio" value="internal" {...register('location_type')} className="peer opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10" />
                            <div className="w-full py-2 text-center rounded-xl text-[16px] font-black uppercase tracking-widest transition-all peer-checked:bg-white peer-checked:text-[#4F5BD5] peer-checked:shadow-sm text-gray-400 hover:text-gray-600">学内</div>
                          </label>
                          <label className="flex-1 cursor-pointer relative">
                            <input type="radio" value="external" {...register('location_type')} className="peer opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10" />
                            <div className="w-full py-2 text-center rounded-xl text-[16px] font-black uppercase tracking-widest transition-all peer-checked:bg-white peer-checked:text-[#D62976] peer-checked:shadow-sm text-gray-400 hover:text-gray-600">学外</div>
                          </label>
                        </div>
                      </div>

                      {/* Status Selector */}
                      <div className="space-y-3">
                        <label className="text-[14px] font-black text-gray-800 uppercase tracking-widest px-8">公開ステータス</label>
                        {(() => {
                          const currentStatus = watch('status');
                          return (
                            <Select.Root value={currentStatus} onValueChange={(val) => setValue('status', val as any)}>
                              <Select.Trigger
                                className={cn(
                                  "w-full h-[62px] flex items-center justify-between gap-2 px-8 py-5 rounded-3xl border-2 transition-all outline-none font-black text-sm uppercase tracking-widest overflow-hidden",
                                  currentStatus === 'open' ? 'border-emerald-100 bg-emerald-50/30 text-emerald-600' :
                                    currentStatus === 'closed' ? 'border-rose-100 bg-rose-50/30 text-rose-600' :
                                      'border-stone-100 bg-stone-50/50 text-stone-500'
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-2.5 h-2.5 rounded-full border-2 border-current",
                                    currentStatus === 'open' ? 'text-emerald-500' :
                                      currentStatus === 'closed' ? 'text-rose-500' :
                                        'text-stone-400'
                                  )} />
                                  <Select.Value />
                                </div>
                                <Select.Icon>
                                  <ChevronDown className="w-4 h-4 opacity-50" />
                                </Select.Icon>
                              </Select.Trigger>

                              <Select.Portal>
                                <Select.Content className="z-[110] overflow-hidden rounded-[2rem] bg-white border border-stone-100 shadow-2xl animate-in fade-in zoom-in-95 duration-200 min-w-[280px]">
                                  <Select.Viewport className="p-2">
                                    {[
                                      { value: 'draft', label: '下書き', color: 'stone', desc: '管理者のみ確認可能' },
                                      { value: 'open', label: '公開', color: 'emerald', desc: 'メンバー全員が閲覧・申込可能' },
                                      { value: 'closed', label: '締切', color: 'rose', desc: '閲覧のみ可能' }
                                    ].map((opt) => (
                                      <Select.Item
                                        key={opt.value}
                                        value={opt.value}
                                        className="relative flex items-center gap-4 px-6 py-4 rounded-2xl text-sm font-black outline-none cursor-pointer group transition-all focus:bg-stone-50 data-[state=checked]:bg-stone-50"
                                      >
                                        <div className={cn(
                                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border-2 transition-colors",
                                          opt.value === 'open' ? 'border-emerald-100 bg-emerald-50 text-emerald-500' :
                                            opt.value === 'closed' ? 'border-rose-100 bg-rose-50 text-rose-500' :
                                              'border-stone-100 bg-stone-50 text-stone-400'
                                        )}>
                                          <div className="w-2.5 h-2.5 rounded-full border-2 border-current shadow-sm" />
                                        </div>
                                        <div className="flex flex-col">
                                          <Select.ItemText>
                                            <span className="text-[13px] uppercase tracking-widest leading-none mb-1 text-gray-900 block">{opt.label}</span>
                                          </Select.ItemText>
                                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{opt.desc}</span>
                                        </div>
                                        <Select.ItemIndicator className="ml-auto flex items-center justify-center">
                                          <Check className={cn(
                                            "w-5 h-5",
                                            opt.value === 'open' ? 'text-emerald-500' :
                                              opt.value === 'closed' ? 'text-rose-500' :
                                                'text-stone-900'
                                          )} />
                                        </Select.ItemIndicator>
                                      </Select.Item>
                                    ))}
                                  </Select.Viewport>
                                </Select.Content>
                              </Select.Portal>
                            </Select.Root>
                          )
                        })()}
                      </div>

                      {/* Pinned Toggle */}
                      <div className="space-y-3 p-4 bg-[#4F5BD5]/5 rounded-[1.5rem] border border-[#4F5BD5]/10 flex items-center justify-between h-[62px] self-end mb-[1px]">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                            useWatch({ control, name: 'is_pinned' }) ? 'bg-[#4F5BD5] text-white shadow-lg' : 'bg-white text-[#4F5BD5] border border-[#4F5BD5]/20'
                          )}>
                            <Pin className="w-5 h-5" />
                          </div>
                          <p className="text-[14px] font-black text-[#4F5BD5] uppercase tracking-widest leading-none">トップに固定</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" {...register('is_pinned')} className="sr-only peer" />
                          <div className="w-12 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4F5BD5]"></div>
                        </label>
                      </div>
                    </div>

                    <div className="sm:col-span-2 pt-10 border-t border-gray-100">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-[#4F5BD5]/10 rounded-2xl flex items-center justify-center text-[#4F5BD5]">
                            <CalendarDays className="w-5 h-5" />
                          </div>
                          <div className="text-center sm:text-left">
                            <h3 className="text-[15px] font-black text-gray-800 uppercase tracking-widest leading-none mb-1">スケジュール</h3>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => append({ date: '', start_time: '', end_time: '', capacity: NaN })}
                          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-2xl text-[14px] font-black uppercase tracking-widest hover:bg-[#4F5BD5] transition-all shadow-lg hover:shadow-[#4F5BD5]/20"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          セッションを追加
                        </button>
                      </div>

                      <div className="space-y-4">
                        {fields.map((field, index) => (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={field.id}
                            className="bg-white border border-gray-200 rounded-3xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow relative group"
                          >
                            <button
                              type="button"
                              onClick={() => remove(index)}
                              className="absolute -top-4 -right-4 w-9 h-9 bg-rose-50 border-2 border-rose-200 shadow-lg rounded-full flex items-center justify-center text-[#D62976] hover:bg-[#D62976] hover:text-white hover:border-[#D62976] transition-all z-20 group/delete"
                              title="セッションを削除"
                            >
                              <X className="w-5 h-5" />
                            </button>

                            <div className="grid grid-cols-2 gap-4 md:gap-6 items-end">
                              {/* Row 1: Date & Capacity */}
                              <div className="space-y-2 col-span-1">
                                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-2">日付</label>
                                <div className="relative group/input">
                                  <input
                                    type="text"
                                    readOnly
                                    value={(() => {
                                      const val = watch(`sessions.${index}.date`);
                                      return val ? format(new Date(val), 'dd/MM/yyyy') : '';
                                    })()}
                                    placeholder="DD/MM/YYYY"
                                    className="w-full bg-gray-50 border border-gray-100 text-[#0f172a] rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:bg-white focus:border-[#4F5BD5]/30 outline-none transition-all shadow-sm cursor-pointer"
                                  />
                                  <input
                                    type="date"
                                    {...register(`sessions.${index}.date` as const)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    onClick={(e) => {
                                      try {
                                        (e.currentTarget as any).showPicker();
                                      } catch (err) {}
                                    }}
                                  />
                                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 shadow-sm pointer-events-none group-hover/input:text-[#4F5BD5] transition-colors" />
                                </div>
                              </div>
                              <div className="space-y-2 col-span-1">
                                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-2">定員 (限定)</label>
                                <div className="relative">
                                  <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 shadow-sm" />
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="無制限"
                                    {...register(`sessions.${index}.capacity` as const, { valueAsNumber: true })}
                                    className="w-full bg-gray-50 border border-gray-100 text-[#0f172a] rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:bg-white outline-none transition-all shadow-sm"
                                  />
                                </div>
                              </div>

                              {/* Row 2: Start & End */}
                              <div className="space-y-2 col-span-1">
                                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-2">開始</label>
                                <div className="relative">
                                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 shadow-sm" />
                                  <input
                                    type="time"
                                    {...register(`sessions.${index}.start_time` as const)}
                                    className="w-full bg-gray-50 border border-gray-100 text-[#0f172a] rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:bg-white outline-none transition-all shadow-sm"
                                  />
                                </div>
                              </div>
                              <div className="space-y-2 col-span-1">
                                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-2">終了</label>
                                <div className="relative">
                                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 shadow-sm" />
                                  <input
                                    type="time"
                                    {...register(`sessions.${index}.end_time` as const)}
                                    className="w-full bg-gray-50 border border-gray-100 text-[#0f172a] rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:bg-white outline-none transition-all shadow-sm"
                                  />
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}

                      </div>
                    </div>



                    <div className="sm:col-span-2 pt-5 py-5 flex flex-col sm:flex-row justify-end gap-3 sm:gap-6 items-center border-t border-gray-300">
                      {/* Save Button - Top on Mobile, Right on Desktop */}
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        disabled={saveMutation.isPending}
                        className="w-full sm:w-auto order-1 sm:order-3 px-10 py-4 bg-gradient-to-r from-[#D62976] to-[#4F5BD5] text-white text-[14px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-lg hover:shadow-[#D62976]/20 flex items-center justify-center gap-2 min-w-[180px]"
                      >
                        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : '保存'}
                      </motion.button>

                      {/* Cancel Button - Middle on Mobile, Middle on Desktop */}
                      <Dialog.Close asChild>
                        <button type="button" className="w-full sm:w-auto order-2 sm:order-2 px-3 py-3.5 hover:bg-white hover:shadow-sm text-gray-800 hover:text-gray-900 text-[14px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all">
                          キャンセル
                        </button>
                      </Dialog.Close>

                      <div className="hidden sm:block flex-1 order-none" />

                      {/* Delete Button - Bottom on Mobile, Left on Desktop */}
                      {editingActivity && (
                        <button
                          type="button"
                          onClick={() => setIsDeleteConfirmOpen(true)}
                          className="w-full sm:w-auto order-3 sm:order-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-rose-50 border border-rose-200 text-[#D62976] hover:bg-[#D62976] hover:text-white rounded-2xl text-[13px] font-black uppercase tracking-widest transition-all active:scale-95"
                        >
                          <Trash2 className="w-4 h-4" />
                          削除する
                        </button>
                      )}
                    </div>

                    {/* Activity Deletion Confirm Modal - Localized inside Portal for proper layering */}
                    <ActivityDeleteConfirmModal
                      isOpen={isDeleteConfirmOpen}
                      onClose={() => setIsDeleteConfirmOpen(false)}
                      onConfirm={() => {
                        if (editingActivity?.id) {
                          deleteMutation.mutate(editingActivity.id);
                          setModalOpen(false);
                        }
                      }}
                      title={useWatch({ control, name: 'title' }) || editingActivity?.title || 'この活動'}
                    />
                  </div>
                </form>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </div>
  );
}
