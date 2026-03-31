import { useState, useRef, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Search, Plus, Edit2, Trash2, CalendarDays, Loader2, Camera, MapPin, Users, Activity, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
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
        .select('*, registrations(count)')
        .eq('academic_year_id', selectedYear.id)
        .is('deleted_at', null)
        .order('date', { ascending: false });

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
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-4xl font-serif text-brand-stone-50 mb-2 tracking-tight">イベント管理</h1>
          <p className="text-sm text-brand-stone-400 font-medium">{selectedYear?.name} 年度</p>
        </div>
        
        <button 
          onClick={() => openForm()}
          className="flex items-center gap-2 px-6 py-3 bg-brand-emerald-600 hover:bg-brand-emerald-500 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] shadow-lg shadow-brand-emerald-950/20"
        >
          <Plus className="w-5 h-5" /> イベントを追加
        </button>
      </div>

      <div className="bg-brand-stone-800/20 p-6 border border-brand-stone-800 rounded-2xl backdrop-blur-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-stone-500" />
          <input 
            type="text"
            placeholder="イベント名、場所で検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-6 py-3 bg-brand-stone-950 border border-brand-stone-800 text-brand-stone-100 rounded-xl text-sm focus:ring-1 focus:ring-brand-emerald-500 outline-none transition-all placeholder:text-brand-stone-600"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-brand-emerald-500 animate-spin" /></div>
      ) : filteredData.length === 0 ? (
        <div className="text-center py-32 bg-brand-stone-800/10 border border-brand-stone-800 rounded-3xl animate-in fade-in zoom-in duration-500">
          <Activity className="w-12 h-12 text-brand-stone-700 mx-auto mb-4" />
          <p className="text-brand-stone-500 font-medium">該当するイベントが見つかりませんでした。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredData.map((act) => (
            <div key={act.id} className="group bg-brand-stone-900 border border-brand-stone-800 rounded-3xl overflow-hidden hover:border-brand-emerald-500/30 transition-all duration-500 flex flex-col hover:shadow-2xl hover:shadow-brand-emerald-950/10 hover:-translate-y-1">
              <div className="h-48 bg-brand-stone-800 relative overflow-hidden">
                {act.cover_image_url ? (
                  <img src={act.cover_image_url} alt={act.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center opacity-30 text-brand-stone-500 bg-brand-stone-950"><CalendarDays className="w-12 h-12 mb-2" /> No Cover</div>
                )}
                <div className="absolute top-4 right-4">
                  <span className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full backdrop-blur-xl border shadow-xl ${
                    act.status === 'open' ? 'bg-brand-emerald-500/20 text-brand-emerald-400 border-brand-emerald-500/30' : 
                    act.status === 'closed' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 
                    'bg-brand-stone-500/20 text-brand-stone-400 border-brand-stone-500/30'
                  }`}>
                    {act.status === 'open' ? '募集中' : act.status === 'closed' ? '締切' : '下書き'}
                  </span>
                </div>
              </div>

              <div className="p-6 flex-1 flex flex-col">
                <h3 className="text-xl font-serif text-brand-stone-50 mb-4 line-clamp-2 leading-tight group-hover:text-brand-emerald-400 transition-colors">{act.title}</h3>
                
                <div className="space-y-3 text-sm text-brand-stone-400 mb-8 flex-1">
                  <div className="flex items-start gap-3">
                    <CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-brand-emerald-500" />
                    <span className="font-medium text-brand-stone-300">{format(new Date(act.date), 'yyyy年MM月dd日 HH:mm', { locale: ja })}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-brand-emerald-500" />
                    <span className="line-clamp-1 text-brand-stone-300">{act.location}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 shrink-0 text-brand-emerald-500" />
                    <span className="text-brand-stone-300 font-bold">{act.registrations?.[0]?.count || 0} <span className="text-brand-stone-500 font-normal">/ {act.capacity || '∞'} 名申込</span></span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-6 border-t border-brand-stone-800/50 mt-auto">
                  <div className="flex gap-2">
                    <button onClick={() => openForm(act)} className="p-2.5 text-brand-stone-400 hover:text-brand-emerald-400 bg-brand-stone-800/50 hover:bg-brand-emerald-950/40 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => { if(window.confirm('このイベントを削除してもよろしいですか？')) deleteMutation.mutate(act.id); }} className="p-2.5 text-brand-stone-400 hover:text-rose-400 bg-brand-stone-800/50 hover:bg-rose-950/40 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  
                  <Link 
                    to={`/admin/activities/${act.id}`}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-stone-800 text-brand-stone-300 hover:text-brand-stone-100 text-xs font-bold rounded-xl border border-brand-stone-700 transition-all hover:border-brand-stone-500"
                  >
                    <Activity className="w-4 h-4" /> 出欠管理
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog.Root open={modalOpen} onOpenChange={(open) => { if(!open) resetForm(); setModalOpen(open); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 overflow-y-auto grid place-items-center py-10" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-3xl translate-x-[-50%] translate-y-[-50%] bg-brand-stone-900 border border-brand-stone-800 shadow-2xl sm:rounded-3xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="p-8 border-b border-brand-stone-800 shrink-0 flex justify-between items-center">
              <Dialog.Title className="text-2xl font-serif text-brand-stone-50 tracking-tight">
                {editingActivity ? 'イベント情報を編集' : '新規イベント作成'}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="text-brand-stone-500 hover:text-brand-stone-300 transition-colors"><X className="w-5 h-5"/></button>
              </Dialog.Close>
            </div>

            <div className="p-8 overflow-y-auto">
              <form id="activity-form" onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-10">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-brand-stone-500">
                      イベントカバー画像
                    </label>
                  </div>

                  <div className="relative group">
                    <div 
                      onClick={() => !isProcessingImage && coverInputRef.current?.click()}
                      className={`w-full h-56 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center overflow-hidden transition-all relative ${
                        isProcessingImage
                          ? 'border-brand-emerald-500/50 bg-brand-emerald-950/10 cursor-wait'
                          : 'border-brand-stone-700 hover:border-brand-emerald-500/50 bg-brand-stone-950/50 cursor-pointer'
                      }`}
                    >
                      {isProcessingImage && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-brand-stone-900/80 backdrop-blur-md">
                          <Loader2 className="w-10 h-10 text-brand-emerald-400 animate-spin mb-4" />
                          <p className="text-xs font-bold text-white uppercase tracking-[0.2em] animate-pulse">{processingStatus}</p>
                        </div>
                      )}

                      {coverPreview ? (
                        <>
                          <img src={coverPreview} alt="Cover Preview" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                            <span className="text-white text-xs font-bold bg-white/10 hover:bg-white/20 px-6 py-3 rounded-full border border-white/20 transition-all">画像をアップロード</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-brand-stone-500 flex flex-col items-center text-center p-8">
                          <div className="w-16 h-16 bg-brand-stone-900 rounded-full flex items-center justify-center mb-4 border border-brand-stone-800">
                            <Camera className="w-8 h-8 opacity-50" />
                          </div>
                          <span className="text-sm font-bold text-brand-stone-300 mb-1">画像をアップロード</span>
                          <span className="text-xs text-brand-stone-500">推奨アスペクト比 16:9 (WebP対応)</span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleRandomImage}
                      disabled={isProcessingImage}
                      className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-8 py-3.5 bg-brand-emerald-600 hover:bg-brand-emerald-500 text-white rounded-full text-xs font-bold shadow-2xl shadow-brand-emerald-900/40 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 z-20 border border-white/10 whitespace-nowrap"
                    >
                      <Activity className="w-4 h-4" />
                      最適な画像を自動生成 🎲
                    </button>
                  </div>

                  {/* Removed AI Suggestion Area */}

                  <input type="file" accept="image/jpeg, image/png" ref={coverInputRef} onChange={onCoverChange} className="hidden" />
                </div>

                {/* Form Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs text-brand-stone-400 font-medium">イベント名 *</label>
                    <input {...register('title')} className="w-full bg-brand-stone-950 border border-brand-stone-800 text-brand-stone-100 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-brand-emerald-500 outline-none transition-all placeholder:text-brand-stone-700" placeholder="例：新入生歓迎会" />
                    {errors.title && <p className="text-rose-500 text-xs font-medium mt-1">{errors.title.message}</p>}
                  </div>
                  
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs text-brand-stone-400 font-medium">説明</label>
                    <textarea {...register('description')} rows={4} className="w-full bg-brand-stone-950 border border-brand-stone-800 text-brand-stone-100 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-brand-emerald-500 outline-none transition-all resize-none placeholder:text-brand-stone-700" placeholder="イベントの詳細内容を入力..." />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-brand-stone-400 font-medium">開催日時 *</label>
                    <input type="datetime-local" {...register('date')} className="w-full bg-brand-stone-950 border border-brand-stone-800 text-brand-stone-100 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-brand-emerald-500 outline-none transition-all [color-scheme:dark]" />
                    {errors.date && <p className="text-rose-500 text-xs font-medium mt-1">{errors.date.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-brand-stone-400 font-medium">申込締切 *</label>
                    <input type="datetime-local" {...register('registration_deadline')} className="w-full bg-brand-stone-950 border border-brand-stone-800 text-brand-stone-100 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-brand-emerald-500 outline-none transition-all [color-scheme:dark]" />
                    {errors.registration_deadline && <p className="text-rose-500 text-xs font-medium mt-1">{errors.registration_deadline.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-brand-stone-400 font-medium">開催場所 *</label>
                    <input {...register('location')} className="w-full bg-brand-stone-950 border border-brand-stone-800 text-brand-stone-100 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-brand-emerald-500 outline-none transition-all placeholder:text-brand-stone-700" placeholder="例：多目的ホール" />
                    {errors.location && <p className="text-rose-500 text-xs font-medium mt-1">{errors.location.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-brand-stone-400 font-medium">定員 (名)</label>
                    <input type="number" {...register('capacity', { valueAsNumber: true })} placeholder="無制限の場合は空欄" className="w-full bg-brand-stone-950 border border-brand-stone-800 text-brand-stone-100 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-brand-emerald-500 outline-none transition-all" />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs text-brand-stone-400 font-medium">外部フォームURL (必要な場合)</label>
                    <input type="url" {...register('form_link')} placeholder="https://forms.gle/..." className="w-full bg-brand-stone-950 border border-brand-stone-800 text-brand-stone-100 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-brand-emerald-500 outline-none transition-all" />
                    {errors.form_link && <p className="text-rose-500 text-xs font-medium mt-1">{errors.form_link.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-brand-stone-400 font-medium">公開ステータス</label>
                    <select {...register('status')} className="w-full bg-brand-stone-950 border border-brand-stone-800 text-brand-stone-100 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-brand-emerald-500 outline-none transition-all">
                      <option value="draft">下書き (非公開)</option>
                      <option value="open">公開 (募集中)</option>
                      <option value="closed">締切 (募集終了)</option>
                    </select>
                  </div>
                </div>

              </form>
            </div>

            <div className="p-8 border-t border-brand-stone-800 shrink-0 flex justify-end gap-4 bg-brand-stone-900">
              <Dialog.Close asChild>
                <button type="button" className="px-6 py-3 hover:bg-brand-stone-800 text-brand-stone-300 text-sm font-bold rounded-xl transition-all">キャンセル</button>
              </Dialog.Close>
              <button 
                 type="submit" 
                 form="activity-form"
                 disabled={saveMutation.isPending}
                 className="px-8 py-3 bg-brand-emerald-600 hover:bg-brand-emerald-500 text-white text-sm font-bold rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 min-w-[160px] shadow-lg shadow-brand-emerald-950/20"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'イベントを保存'}
              </button>
            </div>

          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

    </div>
  );
}
