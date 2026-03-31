import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Search, Calendar, MapPin, Users, Info, ArrowRight, X, Clock, AlertCircle } from 'lucide-react';
import { format, isPast } from 'date-fns';
import { ja as jaLocale } from 'date-fns/locale';
import * as Dialog from '@radix-ui/react-dialog';
import { useAuthStore } from '../store/useAuthStore';
import { useAppStore } from '../store/useAppStore';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export default function Activities() {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const { selectedYear } = useAppStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', selectedYear?.id],
    queryFn: async () => {
      if (!selectedYear) return [];
      const { data, error } = await supabase
        .from('activities')
        .select(`
          *,
          registrations(count)
        `)
        .eq('academic_year_id', selectedYear.id)
        .is('deleted_at', null)
        .order('date', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!selectedYear,
  });

  const customFontClass = 'font-sans tracking-tight';
  const dateLocale = jaLocale;

  const currentActivities = useMemo(() => {
    return activities.map(act => {
      const isPastYear = selectedYear ? !selectedYear.is_current : false;
      const registeredCount = (act.registrations?.[0] as any)?.count || 0;

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
                <p className="text-[9px] md:text-[11px] font-black text-[#D62976] uppercase tracking-[0.25em] mb-0.5">{selectedYear?.name || '2025-2026'}</p>
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
                  className={`px-7 py-2.5 rounded-[1rem] font-black text-[11px] tracking-[0.15em] transition-all duration-500 whitespace-nowrap uppercase ${
                    filterMode === filter.id 
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
          {currentActivities.length > 0 ? (
            <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {currentActivities.map((activity, index) => {
                const progress = activity.capacity
                  ? Math.min((activity.registered / activity.capacity) * 100, 100)
                  : 100;

                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -20 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    key={activity.id}
                    className="bg-white rounded-2xl overflow-hidden border border-stone-100 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full group"
                  >
                    <div className="relative aspect-[16/9] overflow-hidden bg-stone-100 rounded-t-2xl">
                      <img
                        src={activity.imageUrl}
                        alt={activity.displayText}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                      <div className="absolute top-4 left-4 flex flex-col gap-2">
                        {activity.computedStatus === 'OPEN' ? (
                          <span className="px-4 py-2 bg-white/95 backdrop-blur-md text-[#D62976] text-[10px] font-black uppercase tracking-[0.25em] rounded-full shadow-sm">
                            募集中
                          </span>
                        ) : (
                          <span className="px-4 py-2 bg-white/95 backdrop-blur-md text-brand-stone-500 text-[10px] font-black uppercase tracking-[0.25em] rounded-full shadow-sm">
                            募集終了
                          </span>
                        )}
                      </div>
                      <div className="absolute top-4 right-4">
                        <span className="px-4 py-2 bg-stone-900/90 backdrop-blur-md text-[#FEDA75] text-[10px] font-black uppercase tracking-widest rounded-full shadow-[0_8px_25px_rgba(0,0,0,0.2)] border border-white/10">
                          {activity.yearName}
                        </span>
                      </div>
                    </div>

                    <div className="p-6 flex flex-col flex-1">
                      <div className="flex items-center gap-2 text-[#4F5BD5] font-black text-[11px] mb-2 uppercase tracking-wider">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{activity.date ? format(new Date(activity.date), 'yyyy/MM/dd', { locale: dateLocale }) : '---'}</span>
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
                      <button onClick={() => setSelectedActivity(activity as any)} className={`w-full flex items-center justify-center gap-3 h-[48px] rounded-xl font-black text-[0.85rem] tracking-wider transition-all duration-500 active:scale-[0.97] hover:-translate-y-1 ${activity.computedStatus === 'OPEN' ? 'bg-gradient-to-r from-[#4F5BD5] to-[#D62976] text-white shadow-[0_12px_40px_rgba(79,91,213,0.25)] hover:brightness-110' : 'bg-stone-50 text-stone-400 border border-stone-200'}`}>
                        <span>詳細を見る</span>
                        <ArrowRight className="w-4 h-4" />
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
      <Dialog.Root open={!!selectedActivity} onOpenChange={(open) => !open && setSelectedActivity(null)}>
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
                    <span className="px-3 py-1 bg-[#D62976]/5 text-[#D62976] text-[10px] font-black uppercase tracking-[0.25em] rounded-full border border-[#D62976]/10">募集中</span>
                  ) : (
                    <span className="px-3 py-1 bg-brand-stone-100 text-brand-stone-500 text-[10px] font-black uppercase tracking-[0.25em] rounded-full border border-brand-stone-200">募集終了</span>
                  )}
                </div>

                <Dialog.Title className="text-2xl md:text-5xl font-black text-stone-900 leading-tight">
                  {selectedActivity.displayText}
                </Dialog.Title>

                {/* Optimized Stats Grid for Mobile */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                  {/* Time box */}
                  <div className="bg-stone-50 rounded-[1.25rem] md:rounded-[1.5rem] p-3 md:p-4 flex items-center gap-3 md:gap-4">
                    <div className="bg-white rounded-xl p-2 md:p-2.5 h-fit shadow-sm border border-stone-100 shrink-0">
                      <Clock className="w-4 h-4 md:w-5 md:h-5 text-[#4F5BD5]" />
                    </div>
                    <div className="flex flex-col justify-center min-w-0">
                      <span className="text-[8px] md:text-[10px] text-brand-stone-400 font-black uppercase tracking-[0.1em] md:tracking-[0.2em] mb-0.5 truncate">開催日時</span>
                      <span className="text-xs md:text-sm font-black text-brand-stone-900 truncate">
                        {selectedActivity.date ? format(new Date(selectedActivity.date), 'HH:mm') : '---'}
                      </span>
                    </div>
                  </div>
                  {/* Location box */}
                  <div className="bg-stone-50 rounded-[1.25rem] md:rounded-[1.5rem] p-3 md:p-4 flex items-center gap-3 md:gap-4">
                    <div className="bg-white rounded-xl p-2 md:p-2.5 h-fit shadow-sm border border-stone-100 shrink-0">
                      <MapPin className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
                    </div>
                    <div className="flex flex-col justify-center min-w-0">
                      <span className="text-[8px] md:text-[10px] text-brand-stone-400 font-black uppercase tracking-[0.1em] md:tracking-[0.2em] mb-0.5 truncate">開催場所</span>
                      <span className="text-xs md:text-sm font-black text-brand-stone-900 truncate">{selectedActivity.displayLocation}</span>
                    </div>
                  </div>
                  {/* Quantity box */}
                  <div className="bg-stone-50 rounded-[1.25rem] md:rounded-[1.5rem] p-3 md:p-4 flex items-center gap-3 md:gap-4">
                    <div className="bg-white rounded-xl p-2 md:p-2.5 h-fit shadow-sm border border-stone-100 shrink-0">
                      <Users className="w-4 h-4 md:w-5 md:h-5 text-purple-600" />
                    </div>
                    <div className="flex flex-col justify-center min-w-0">
                      <span className="text-[8px] md:text-[10px] text-brand-stone-400 font-black uppercase tracking-[0.1em] md:tracking-[0.2em] mb-0.5 truncate">定員</span>
                      <span className="text-xs md:text-sm font-black text-brand-stone-900 truncate">
                        {selectedActivity.capacity ? `${selectedActivity.registered}/${selectedActivity.capacity}名` : `${selectedActivity.registered}名`}
                      </span>
                    </div>
                  </div>
                  {/* Deadline box */}
                  <div className="bg-stone-50 rounded-[1.25rem] md:rounded-[1.5rem] p-3 md:p-4 flex items-center gap-3 md:gap-4">
                    <div className="bg-white rounded-xl p-2 md:p-2.5 h-fit shadow-sm border border-stone-100 shrink-0">
                      <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-rose-500" />
                    </div>
                    <div className="flex flex-col justify-center min-w-0">
                      <span className="text-[8px] md:text-[10px] text-brand-stone-400 font-black uppercase tracking-[0.1em] md:tracking-[0.2em] mb-0.5 truncate">申込締切</span>
                      <span className="text-xs md:text-sm font-black text-brand-stone-900 truncate">{format(new Date(selectedActivity.registration_deadline), 'MM/dd HH:mm', { locale: jaLocale })}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 md:pt-4 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="text-xl font-black text-brand-stone-900">活動内容</h3>
                    <div className="w-full sm:w-auto">
                      <button
                        onClick={() => !currentUser ? navigate('/login') : console.log('Apply')}
                        className={`w-full sm:w-auto group rounded-xl transition-all duration-300 flex items-center justify-center gap-3 font-black ${selectedActivity.computedStatus === 'OPEN' ? 'bg-gradient-to-r from-[#4F5BD5] to-[#D62976] text-white hover:brightness-110 hover:translate-y-[-2px] px-8 py-4 text-sm shadow-lg' : 'bg-rose-50 text-rose-500 border border-rose-100 px-6 py-3 text-[11px] uppercase cursor-not-allowed'}`}
                        disabled={selectedActivity.computedStatus !== 'OPEN'}
                      >
                        {selectedActivity.computedStatus === 'OPEN' ? (
                          <>
                            <span className="whitespace-nowrap">{currentUser ? '参加を申し込む' : 'ログインして申し込む'}</span>
                            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                          </>
                        ) : (
                          <span className="whitespace-nowrap flex items-center gap-2"><X className="w-3 h-3" /> 募集終了</span>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start">
                    <div className="md:col-span-2">
                      <div className="bg-stone-50 rounded-2xl md:rounded-3xl p-5 md:p-6 border border-stone-100 min-h-[120px] md:min-h-[140px]">
                        <p className="text-stone-600 text-sm md:text-base leading-relaxed whitespace-pre-line">{selectedActivity.displayDesc}</p>
                      </div>
                    </div>
                    {selectedActivity.displayNote && (
                      <div className="md:col-span-1">
                        <div className="bg-amber-50/50 rounded-2xl p-5 md:p-6 border border-amber-100 flex gap-4">
                          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[10px] text-amber-700 font-bold uppercase tracking-[0.2em] block mb-2">注意事項</span>
                            <p className="text-amber-800 italic text-xs leading-relaxed whitespace-pre-line">{selectedActivity.displayNote}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <Dialog.Close className="absolute right-4 top-4 md:right-8 md:top-8 rounded-full p-2 bg-stone-100/50 backdrop-blur-sm opacity-70 transition-opacity hover:opacity-100 hover:bg-stone-200 text-stone-500">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
