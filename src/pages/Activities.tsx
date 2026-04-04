import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Search, Calendar, MapPin, Users, Info, ArrowRight, X, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { format, isPast } from 'date-fns';
import { ja as jaLocale } from 'date-fns/locale';
import * as Dialog from '@radix-ui/react-dialog';
import { useAuthStore } from '../store/useAuthStore';
import { useAppStore } from '../store/useAppStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

export default function Activities() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const { selectedYear } = useAppStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [selectedSessions, setSelectedSessions] = useState<number[]>([]);

  const toggleSession = (idx: number) => {
    setSelectedSessions(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const queryClient = useQueryClient();
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['activities', selectedYear?.id],
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

  // --- REGISTRATION STATUS (User Specific) ---
  const { data: userRegistrations = [] } = useQuery({
    queryKey: ['user-registrations', currentUser?.id, selectedYear?.id],
    queryFn: async () => {
      if (!currentUser || !selectedYear) return [];
      const { data, error } = await supabase
        .from('registrations')
        .select('activity_id')
        .eq('user_id', currentUser.id);

      if (error) throw error;
      return data.map(r => r.activity_id);
    },
    enabled: !!currentUser && !!selectedYear,
  });

  const toggleRegistrationMutation = useMutation({
    mutationFn: async ({ activityId, isRegistered }: { activityId: string, isRegistered: boolean }) => {
      if (!currentUser) throw new Error('Unauthorized');

      if (isRegistered) {
        // Cancel
        const { error } = await supabase
          .from('registrations')
          .delete()
          .eq('user_id', currentUser.id)
          .eq('activity_id', activityId);
        if (error) throw error;
        return { type: 'cancel' };
      } else {
        // Register
        const { error } = await supabase
          .from('registrations')
          .insert({
            user_id: currentUser.id,
            activity_id: activityId,
            attendance_status: 'pending',
            selected_sessions: selectedSessions,
            confirmed_at: new Date().toISOString()
          });
        if (error) throw error;
        return { type: 'register' };
      }
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['user-registrations'] });
      toast.success(res.type === 'register' ? '参加申し込みを受け付けました' : 'キャンセルしました');
    },
    onError: (err: any) => {
      toast.error(err.message || 'エラーが発生しました');
    }
  });

  const customFontClass = 'font-sans tracking-tight';

  const currentActivities = useMemo(() => {
    return activities.map(act => {
      const isPastYear = selectedYear ? !selectedYear.is_current : false;
      const registeredCount = act.registered_count || 0;

      let computedStatus: 'OPEN' | 'CLOSED' = act.status === 'closed' ? 'CLOSED' : 'OPEN';

      if (isPastYear || isPast(new Date(act.registration_deadline))) {
        computedStatus = 'CLOSED';
      } else if (act.capacity && registeredCount >= act.capacity) {
        computedStatus = 'CLOSED';
      }

      return {
        ...act,
        computedStatus,
        registered: registeredCount,
        displayText: act.title,
        displayLocation: act.location,
        displayDesc: act.description,
        displayNote: act.note || '',
        imageUrl: act.cover_image_url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1500&auto=format&fit=crop',
        yearName: selectedYear?.name || ''
      };
    }).filter(act => {
      if (act.status === 'draft') return false;
      if (filterMode !== 'ALL' && act.computedStatus !== filterMode) return false;
      if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        const matchesTitle = act.displayText.toLowerCase().includes(lowerSearch);
        const matchesLocation = act.displayLocation.toLowerCase().includes(lowerSearch);
        if (!matchesTitle && !matchesLocation) return false;
      }
      return true;
    });
  }, [activities, selectedYear, filterMode, searchTerm]);

  return (
    <div className={`min-h-screen bg-brand-stone-50/50 pb-32 relative overflow-hidden ${customFontClass}`}>
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[5%] -right-[5%] w-[40%] h-[40%] bg-[#4F5BD5] rounded-full blur-[140px] opacity-[0.08]" />
        <div className="absolute top-1/2 left-0 w-[40%] h-[40%] bg-[#D62976] rounded-full blur-[140px] opacity-[0.05]" />
        <div className="absolute -bottom-[10%] left-1/2 w-[50%] h-[50%] bg-[#FEDA75] rounded-full blur-[140px] opacity-[0.1]" />
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-12 relative z-10">
        <div className="mb-14 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="relative">
              <div className="absolute -left-4 top-0 w-1 h-8 md:h-12 bg-gradient-to-b from-[#4F5BD5] to-[#D62976] rounded-full" />
              <h1 className="text-3xl md:text-5xl font-black text-brand-stone-900 mb-2 tracking-tighter">ボランティア活動</h1>
            </div>

            <div className="bg-white/80 backdrop-blur-xl px-6 md:px-8 py-3 md:py-5 rounded-[1.5rem] md:rounded-[2rem] border border-white shadow-[0_10px_40px_rgba(0,0,0,0.04)] flex items-center gap-4 md:gap-5 group hover:scale-[1.02] transition-all duration-500 w-fit">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-[#4F5BD5]/10 to-[#D62976]/10 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 md:w-6 md:h-6 text-[#4F5BD5]" />
              </div>
              <div>
                <p className="text-[9px] md:text-[11px] font-black text-[#D62976] uppercase tracking-[0.25em] mb-0.5">{selectedYear?.name || '---'}</p>
                <p className="text-brand-stone-900 font-black text-lg md:text-xl">
                  {currentActivities.length} <span className="text-xs md:text-sm text-brand-stone-400 font-bold ml-1">件の活動</span>
                </p>
              </div>
            </div>
          </div>

          {/* Optimized Search & Filter Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 md:gap-10">
            {/* Minimalist Search Area */}
            <div className="relative flex-1 max-w-2xl group w-full">
              <div className="absolute inset-0 bg-gradient-to-r from-[#4F5BD5]/20 to-[#D62976]/20 blur-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-700 -z-10" />
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-stone-300 group-focus-within:text-[#4F5BD5] transition-all duration-300" />
              <input
                type="text"
                placeholder="活動名・場所を検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-16 pr-8 py-4 bg-white/60 backdrop-blur-xl border border-white/60 rounded-[1.2rem] text-brand-stone-700 placeholder-brand-stone-300 focus:outline-none focus:bg-white focus:border-[#4F5BD5]/30 focus:shadow-[0_15px_40px_-5px_rgba(79,91,213,0.1)] transition-all duration-500 font-bold text-[15px] tracking-tight placeholder:italic"
              />
              {/* Decorative Search Accent */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-brand-stone-50 text-brand-stone-300 text-[10px] font-black uppercase tracking-widest rounded-lg border border-brand-stone-100 hidden sm:block">
                Enter
              </div>
            </div>

            {/* Streamlined Filter Pills */}
            <div className="flex items-center gap-2 bg-white/40 backdrop-blur-md p-1.5 rounded-[1.5rem] border border-white/40 shadow-sm overflow-x-auto scrollbar-hide shrink-0">
              {[
                { id: 'ALL', label: 'すべて' },
                { id: 'OPEN', label: '募集中' },
                { id: 'CLOSED', label: '募集終了' },
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setFilterMode(filter.id as any)}
                  className={`px-7 py-2.5 rounded-[1rem] font-black text-[11px] tracking-[0.15em] transition-all duration-500 whitespace-nowrap uppercase ${filterMode === filter.id
                    ? 'bg-white text-[#4F5BD5] shadow-[0_8px_20px_-3px_rgba(79,91,213,0.15)] scale-[1.02] border border-[#4F5BD5]/5'
                    : 'text-brand-stone-400 hover:text-brand-stone-700'
                    }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence mode="popLayout">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-48">
              <div className="w-12 h-12 border-4 border-[#4F5BD5]/20 border-t-[#4F5BD5] rounded-full animate-spin mb-4" />
              <p className="text-[11px] font-black uppercase text-stone-400 tracking-[0.2em] animate-pulse">Loading data...</p>
            </div>
          ) : currentActivities.length > 0 ? (
            <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {currentActivities.map((activity, index) => {
                const progress = activity.capacity
                  ? Math.min((activity.registered / activity.capacity) * 100, 100)
                  : 100;

                const isOpen = activity.computedStatus === 'OPEN';

                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -20 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    key={activity.id}
                    className={`bg-white rounded-2xl overflow-hidden border transition-all duration-500 flex flex-col h-full group relative ${isOpen
                        ? 'border-[#4F5BD5]/20 shadow-[0_15px_35px_-5px_rgba(79,91,213,0.1)] hover:shadow-[0_25px_50px_-12px_rgba(79,91,213,0.2)]'
                        : 'border-stone-100 shadow-sm hover:shadow-xl'
                      }`}
                  >
                    <div className="relative aspect-[16/9] overflow-hidden bg-stone-100 rounded-t-2xl">
                      <img
                        src={activity.imageUrl}
                        alt={activity.displayText}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                      <div className="absolute top-4 left-4 flex flex-col gap-2">
                        {isOpen ? (
                          <span className="px-4 py-2 bg-emerald-500 text-white text-[12px] font-black uppercase tracking-[0.2em] rounded-full shadow-[0_4px_15px_rgba(16,185,129,0.3)]">
                            募集中
                          </span>
                        ) : (
                          <span className="px-4 py-2 bg-white/95 backdrop-blur-md text-brand-stone-500 text-[12px] font-black uppercase tracking-[0.25em] rounded-full shadow-sm">
                            募集終了
                          </span>
                        )}
                      </div>
                      <div className="absolute top-4 right-4">
                        <span className="px-4 py-2 bg-stone-900/90 backdrop-blur-md text-[#FEDA75] text-[12px] font-black uppercase tracking-widest rounded-full shadow-[0_8px_25px_rgba(0,0,0,0.2)] border border-white/10">
                          {activity.yearName}
                        </span>
                      </div>
                    </div>

                    <div className="p-6 flex flex-col flex-1">
                      <div className="flex items-center gap-2 text-[#4F5BD5] font-black text-[11px] mb-2 uppercase tracking-wider">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{activity.date ? format(new Date(activity.date), 'yyyy/MM/dd', { locale: jaLocale }) : '---'}</span>
                      </div>
                      <h3 className="text-xl md:text-2xl font-black text-stone-900 leading-[1.25] line-clamp-2 mb-4 group-hover:text-[#D62976] transition-colors duration-500 h-[3.2rem]">
                        {activity.displayText}
                      </h3>
                      <div className="space-y-3 pt-3 border-t border-stone-100 mb-5 mt-auto">
                        <div className="flex items-start gap-2 text-stone-500 text-sm">
                          <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                          <span className="line-clamp-1">{activity.displayLocation}</span>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-stone-500 text-sm">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 shrink-0" />
                              <span>
                                {activity.capacity
                                  ? `${activity.registered}/${activity.capacity}名`
                                  : `${activity.registered}名`}
                              </span>
                            </div>
                            {activity.capacity && (
                              <span className="font-medium text-stone-900 text-[9px] bg-stone-100 px-2 py-0.5 rounded-md uppercase tracking-tighter">
                                {Math.round(progress)}%
                              </span>
                            )}
                          </div>
                          {activity.capacity && (
                            <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                              <div className={`h-full transition-all duration-1000 ${progress >= 100 ? 'bg-[#D62976]' : 'bg-gradient-to-r from-[#4F5BD5] to-[#D62976]'}`} style={{ width: `${progress}%` }} />
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedActivity(activity as any)}
                        className="w-full group/btn relative flex items-center justify-center gap-3 px-6 py-4 bg-brand-stone-900 text-white rounded-2xl text-[13px] font-black uppercase tracking-[0.2em] overflow-hidden transition-all duration-500 shadow-[0_10px_20px_rgba(0,0,0,0.1)] active:scale-[0.97] hover:-translate-y-1 mt-auto"
                      >
                        <div className={`absolute inset-0 bg-gradient-to-r from-[#4F5BD5] to-[#D62976] transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0 group-hover/btn:opacity-100'
                          }`} />
                        <span className="relative z-10">詳細を見る</span>
                        <ArrowRight className="w-4 h-4 relative z-10 transition-transform group-hover/btn:translate-x-1" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-20 h-20 bg-brand-stone-100/80 rounded-full flex items-center justify-center mb-6">
                <Info className="w-8 h-8 text-brand-stone-400" />
              </div>
              <h3 className="text-xl font-bold text-brand-stone-900 mb-2">該当する活動が見つかりませんでした。</h3>
              <p className="text-brand-stone-500 max-w-sm">検索キーワードを変更するか、別の学年度を選択してください。</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Detail Dialog */}
      <Dialog.Root open={!!selectedActivity} onOpenChange={(open) => {
        if (!open) {
          setSelectedActivity(null);
          setIsConfirmed(false);
          setSelectedSessions([]);
        }
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-stone-900/60 backdrop-blur-lg z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className={`fixed left-[50%] top-[50%] z-50 w-[94%] md:w-full max-w-4xl max-h-[90vh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] bg-white p-5 md:p-10 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-[2rem] md:rounded-[2.5rem] ${customFontClass} scrollbar-hide`}>
            {selectedActivity && (
              <div className="space-y-6 md:space-y-8">
                {/* Header Pills */}
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  <span className="px-3 py-1 bg-stone-900 text-[#FEDA75] text-[10px] md:text-xs font-black uppercase tracking-widest rounded-full shadow-lg">
                    {selectedActivity.yearName}
                  </span>
                  <span className="px-3 py-1 bg-[#4F5BD5]/5 text-[#4F5BD5] text-[10px] md:text-xs font-black uppercase tracking-widest rounded-full border border-[#4F5BD5]/10">
                    {selectedActivity.date ? format(new Date(selectedActivity.date), 'EEEE, MM/dd', { locale: jaLocale }) : '---'}
                  </span>
                  {selectedActivity.computedStatus === 'OPEN' ? (
                    <span className="px-4 py-1.5 bg-emerald-500 text-white text-[11px] md:text-[12px] font-black uppercase tracking-[0.2em] rounded-full shadow-[0_4px_12px_rgba(16,185,129,0.2)]">募集中</span>
                  ) : (
                    <span className="px-3 py-1 bg-brand-stone-100 text-brand-stone-500 text-[10px] font-black uppercase tracking-[0.25em] rounded-full border border-brand-stone-200">募集終了</span>
                  )}
                </div>

                <Dialog.Title className="text-2xl md:text-5xl font-black text-stone-900 leading-tight">
                  {selectedActivity.displayText}
                </Dialog.Title>

                {/* Optimized Stats Grid for Mobile */}
                <div className="space-y-3 md:space-y-4">
                  {/* Top Row: Time, Capacity, Deadline */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                    {/* Time box */}
                    <div className="bg-stone-50 rounded-[1.25rem] md:rounded-[1.5rem] p-4 flex items-center gap-4">
                      <div className="bg-white rounded-xl p-2.5 h-fit shadow-sm border border-stone-100 shrink-0">
                        <Clock className="w-5 h-5 text-[#4F5BD5]" />
                      </div>
                      <div className="flex flex-col justify-center min-w-0">
                        <span className="text-[14px] text-brand-stone-400 font-black uppercase tracking-[0.2em] mb-0.5 truncate">開催日時</span>
                        <span className="text-sm font-black text-brand-stone-900 truncate">
                          {selectedActivity.date ? format(new Date(selectedActivity.date), 'HH:mm') : '---'}
                        </span>
                      </div>
                    </div>
                    {/* Quantity box */}
                    <div className="bg-stone-50 rounded-[1.25rem] md:rounded-[1.5rem] p-4 flex items-center gap-4">
                      <div className="bg-white rounded-xl p-2.5 h-fit shadow-sm border border-stone-100 shrink-0">
                        <Users className="w-5 h-5 text-purple-600" />
                      </div>
                      <div className="flex flex-col justify-center min-w-0">
                        <span className="text-[14px] text-brand-stone-400 font-black uppercase tracking-[0.2em] mb-0.5 truncate">定員</span>
                        <span className="text-sm font-black text-brand-stone-900 truncate">
                          {selectedActivity.capacity ? `${selectedActivity.registered}/${selectedActivity.capacity}名` : `${selectedActivity.registered}名`}
                        </span>
                      </div>
                    </div>
                    {/* Deadline box */}
                    <div className="bg-stone-50 rounded-[1.25rem] md:rounded-[1.5rem] p-4 flex items-center gap-4">
                      <div className="bg-white rounded-xl p-2.5 h-fit shadow-sm border border-stone-100 shrink-0">
                        <AlertCircle className="w-5 h-5 text-rose-500" />
                      </div>
                      <div className="flex flex-col justify-center min-w-0">
                        <span className="text-[14px] text-brand-stone-400 font-black uppercase tracking-[0.2em] mb-0.5 truncate">募集終了</span>
                        <span className="text-sm font-black text-brand-stone-900 truncate">{format(new Date(selectedActivity.registration_deadline), 'MM/dd HH:mm', { locale: jaLocale })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Full-width Location */}
                  <div className="bg-stone-50 rounded-[1.25rem] md:rounded-[1.5rem] p-4 md:p-5 flex items-start gap-4">
                    <div className="bg-white rounded-xl p-2.5 md:p-3 h-fit shadow-sm border border-stone-100 shrink-0 mt-1">
                      <MapPin className="w-5 h-5 md:w-6 md:h-6 text-blue-500" />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[14px] text-brand-stone-400 font-black uppercase tracking-[0.2em] mb-1.5 block">開催場所</span>
                      <span className="text-sm md:text-base font-black text-brand-stone-900 leading-relaxed break-words">
                        {selectedActivity.displayLocation}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 md:pt-4 space-y-10 md:space-y-12">
                  {/* Body: Activity Content */}
                  <div className="space-y-12">
                    <div className="space-y-5">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-6 bg-brand-stone-900 rounded-full" />
                        <h3 className="text-xl font-black text-brand-stone-900 uppercase tracking-widest">内容</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start">
                        <div className={selectedActivity.displayNote ? "md:col-span-2" : "md:col-span-3"}>
                          <div className="bg-stone-50/50 rounded-[2.5rem] p-8 md:p-12 border border-stone-100/50 w-full shadow-sm">
                            <p className="bg-gradient-to-br from-stone-900 via-stone-800 to-stone-600 bg-clip-text text-transparent text-sm md:text-base font-medium leading-relaxed whitespace-pre-line w-full">
                              {selectedActivity.displayDesc}
                            </p>
                          </div>
                        </div>

                        {selectedActivity.displayNote && (
                          <div className="md:col-span-1">
                            <div className="bg-amber-50/30 rounded-2xl p-6 border border-amber-100/50 flex gap-4 h-full">
                              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <span className="text-[14px] text-amber-700 font-bold uppercase tracking-[0.2em] block mb-2">注意事項</span>
                                <p className="text-amber-800 italic text-xs leading-relaxed whitespace-pre-line">{selectedActivity.displayNote}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* NEW: Schedule Section in Modal */}
                    {selectedActivity.sessions && Array.isArray(selectedActivity.sessions) && selectedActivity.sessions.length > 0 && (
                      <div className="space-y-6">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-6 bg-brand-stone-900 rounded-full" />
                          <h3 className="text-xl font-black text-brand-stone-900 uppercase tracking-widest">スケジュール</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-4">
                          {(() => {
                            const myReg = selectedActivity.registrations?.find((r: any) => r.user_id === currentUser?.id);
                            const isRegistered = !!myReg;
                            const activeSessions = myReg?.selected_sessions || selectedSessions;
                            
                            return selectedActivity.sessions.map((session: any, idx: number) => {
                              const isSelected = activeSessions.includes(idx);
                              const canToggle = !isRegistered;
                              
                              return (
                                <div 
                                  key={idx}
                                  onClick={() => canToggle && toggleSession(idx)}
                                  className={`group p-5 rounded-2xl border transition-all duration-300 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${
                                    !canToggle ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                                  } ${
                                    isSelected
                                      ? 'bg-brand-emerald-50/30 border-brand-emerald-200 shadow-sm'
                                      : 'bg-stone-50/50 border-stone-100 hover:border-brand-stone-200'
                                  }`}
                                >
                                <div className="flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${
                                   isSelected
                                     ? 'bg-brand-emerald-500 text-white border-brand-emerald-400'
                                     : 'bg-white text-stone-400 border-stone-200'
                                  }`}>
                                    <span className="text-xs font-black">Vol.{idx + 1}</span>
                                  </div>
                                  <div>
                                    <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${isSelected ? 'text-brand-emerald-600' : 'text-stone-400'}`}>
                                      {format(new Date(session.date), "yyyy.MM.dd (EEE)", { locale: jaLocale })}
                                    </p>
                                    <p className="text-sm font-bold text-brand-stone-900">
                                      {session.start_time} - {session.end_time}
                                    </p>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-4">
                                  <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-brand-emerald-600' : 'text-stone-400'}`}>
                                    {isSelected ? '参加予定' : '未選択'}
                                  </span>
                                  <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                                    isSelected
                                      ? 'bg-brand-emerald-500 border-brand-emerald-500 text-white'
                                      : 'bg-white border-stone-200'
                                  }`}>
                                    {isSelected && <motion.svg initial={{scale:0}} animate={{scale:1}} className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></motion.svg>}
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Top: Status Badges / Info / Registration */}
                  <div className="flex flex-col items-center justify-center gap-4 pt-4 border-t border-stone-100">
                    {(() => {
                      const isRegistered = userRegistrations.includes(selectedActivity.id);
                      const isPending = toggleRegistrationMutation.isPending;

                      return (
                        <>
                          <div className="w-full flex items-center justify-center">
                            {isRegistered ? (
                              <div className="flex flex-col items-center gap-3 bg-brand-emerald-50/50 border border-brand-emerald-100 rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-sm">
                                <div className="flex items-center gap-2 text-brand-emerald-600 font-black text-sm uppercase tracking-widest">
                                  <div className="w-2 h-2 rounded-full bg-brand-emerald-500 animate-pulse" />
                                  申し込み済み
                                </div>
                                <p className="text-[10px] md:text-[11px] font-bold text-brand-stone-400 text-center whitespace-nowrap italic">
                                  ※ キャンセル・変更については、ミルクティ運営部まで直接ご連絡ください。
                                </p>
                              </div>
                            ) : (
                              <div className="w-full flex flex-col items-center gap-8">
                                {currentUser && selectedActivity.computedStatus === 'OPEN' && (
                                  <div
                                    onClick={() => setIsConfirmed(!isConfirmed)}
                                    className={`group/confirm flex items-start gap-4 p-5 rounded-2xl border transition-all duration-300 cursor-pointer w-full max-w-lg ${isConfirmed
                                        ? 'bg-brand-emerald-50/30 border-brand-emerald-200 shadow-sm shadow-brand-emerald-500/5'
                                        : 'bg-stone-50/50 border-stone-100 hover:border-brand-stone-200'
                                      }`}
                                  >
                                    <div className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-500 shrink-0 ${isConfirmed
                                        ? 'bg-brand-emerald-500 border-brand-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                                        : 'bg-white border-stone-200 group-hover/confirm:border-brand-stone-300'
                                      }`}>
                                      {isConfirmed && (
                                        <motion.svg
                                          initial={{ scale: 0, opacity: 0 }}
                                          animate={{ scale: 1, opacity: 1 }}
                                          className="w-3.5 h-3.5 text-white"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={4}
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </motion.svg>
                                      )}
                                    </div>
                                    <div className="flex flex-col">
                                      <span className={`text-[13px] md:text-sm font-black transition-colors duration-300 ${isConfirmed ? 'text-brand-emerald-700' : 'text-stone-600'}`}>
                                        内容を確認しました
                                      </span>
                                      <p className="text-[10px] md:text-[11px] text-stone-400 font-medium leading-relaxed mt-0.5">
                                        活動内容および注意事項をすべて読み、理解した上で参加を申し込みます。
                                      </p>
                                    </div>
                                  </div>
                                )}

                                <button
                                  onClick={() => {
                                    if (!currentUser) {
                                      navigate('/login');
                                      return;
                                    }
                                    if (!isConfirmed && selectedActivity.computedStatus === 'OPEN') return;

                                    toggleRegistrationMutation.mutate({
                                      activityId: selectedActivity.id,
                                      isRegistered: false
                                    });
                                  }}
                                  disabled={
                                    selectedActivity.computedStatus !== 'OPEN' || 
                                    !!isPending || 
                                    (!!currentUser && !isConfirmed) ||
                                    (selectedActivity.sessions?.length > 0 && selectedSessions.length === 0)
                                  }
                                  className={`w-full sm:w-auto rounded-xl transition-all duration-500 flex items-center justify-center gap-3 font-black px-12 py-5 text-sm shadow-xl relative overflow-hidden group
                                    ${isPending ? 'opacity-70 cursor-wait' : ''}
                                    ${(selectedActivity.computedStatus === 'OPEN' && (!currentUser || isConfirmed))
                                      ? 'bg-brand-stone-900 text-white hover:brightness-110 translate-y-[-2px] cursor-pointer'
                                      : 'bg-stone-50 text-stone-400 border border-stone-200 cursor-not-allowed shadow-none'}
                                  `}
                                >
                                  {/* Background Gradient on Hover */}
                                  {selectedActivity.computedStatus === 'OPEN' && (!currentUser || isConfirmed) && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-[#4F5BD5] to-[#D62976] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                  )}

                                  <div className="relative z-10 flex items-center gap-3">
                                    {isPending ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : !currentUser ? (
                                      <>
                                        <span className="whitespace-nowrap">ログインして申し込む</span>
                                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                                      </>
                                    ) : selectedActivity.computedStatus === 'OPEN' ? (
                                      <>
                                        <span className="whitespace-nowrap">参加を申し込む</span>
                                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                                      </>
                                    ) : (
                                      <span className="whitespace-nowrap flex items-center gap-2 font-bold opacity-60">
                                        <X className="w-3.5 h-3.5" /> 募集終了
                                      </span>
                                    )}
                                  </div>
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
            <Dialog.Close className="absolute right-4 top-4 md:right-6 md:top-6 z-[60] w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-stone-100 text-stone-400 transition-all duration-300 hover:text-stone-900 hover:shadow-[0_15px_45px_rgb(0,0,0,0.18)] hover:scale-110 active:scale-95 group/close">
              <X className="h-5 w-5 md:h-6 md:w-6 transition-transform group-hover/close:rotate-90" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
