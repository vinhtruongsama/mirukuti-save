import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isPast } from 'date-fns';
import { ja as jaLocale } from 'date-fns/locale';
import { MapPin, Clock, Users, AlertCircle, CheckCircle2, ChevronRight, Loader2, Edit2, X } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { cn } from '../lib/utils';

export default function ActivityDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { currentUser, session } = useAuthStore();

  const { data: activity, isLoading: isActivityLoading } = useQuery({
    queryKey: ['activity', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('*, academic_years(name)')
        .eq('id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      // 2. Fetch REAL occupancy counts (bypassing RLS via RPC)
      const { data: occupancy, error: occError } = await supabase
        .rpc('get_session_occupancy', { target_activity_id: id });

      if (occError) console.error('Occupancy fetch error:', occError);

      const registeredCount = data.registered_count || 0;
      const sessionCounts = occupancy || {};

      const isClosed =
        data.status === 'closed' ||
        isPast(new Date(data.registration_deadline)) ||
        (data.capacity && registeredCount >= data.capacity);

      return { ...data, registeredCount, sessionCounts, isClosed };
    },
    enabled: !!id,
  });

  const { data: myRegistration, isLoading: isRegLoading } = useQuery({
    queryKey: ['registration', id, currentUser?.id],
    queryFn: async () => {
      if (!currentUser) return null;
      const { data, error } = await supabase
        .from('registrations')
        .select('*')
        .eq('activity_id', id)
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!id && !!currentUser,
  });

  const [agreed, setAgreed] = useState(false);
  const [selectedSessions, setSelectedSessions] = useState<number[]>([]);

  const activeSessions = myRegistration?.selected_sessions || selectedSessions;

  const toggleSession = (idx: number) => {
    if (myRegistration) return;

    // Check if session is full
    const session = activity?.sessions?.[idx];
    const currentCount = activity?.sessionCounts?.[idx] || 0;
    if (session?.capacity && currentCount >= session.capacity && !activeSessions.includes(idx)) {
      toast.error('この時間帯は定員に達しています。');
      return;
    }

    setSelectedSessions((prev: number[]) =>
      prev.includes(idx) ? prev.filter((i: number) => i !== idx) : [...prev, idx]
    );
  };

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (activity.sessions?.length > 0 && selectedSessions.length === 0) {
        throw new Error('参加するセッションを1つ以上選択してください。');
      }
      if (!agreed) {
        throw new Error('内容を確認し、同意チェックを入れてください。');
      }

      // Final check for latest registration data to prevent race conditions
      const { data: latestRegs, error: fetchError } = await supabase
        .from('registrations')
        .select('selected_sessions')
        .eq('activity_id', id);

      if (fetchError) throw fetchError;

      // 1. Check Global Activity Capacity
      if (activity.capacity && (latestRegs?.length || 0) >= activity.capacity) {
        throw new Error('定員に達したため、申し込みを締め切りました。');
      }

      // 2. Check Per-Session Capacity
      if (activity.sessions?.length > 0) {
        // Calculate current occupancy from latest data
        const latestCounts: Record<number, number> = {};
        latestRegs?.forEach((reg: any) => {
          reg.selected_sessions?.forEach((sIdx: number) => {
            latestCounts[sIdx] = (latestCounts[sIdx] || 0) + 1;
          });
        });

        // Validate each selected session against its specific capacity
        for (const sIdx of selectedSessions) {
          const session = activity.sessions[sIdx];
          if (session?.capacity && (latestCounts[sIdx] || 0) >= session.capacity) {
            throw new Error(`「${format(new Date(session.date), "MM/dd")} ${session.start_time}」の枠は既に満員です。選択を解除してください。`);
          }
        }
      }

      const { error } = await supabase.from('registrations').insert({
        activity_id: id,
        user_id: currentUser!.id,
        attendance_status: 'pending',
        selected_sessions: selectedSessions
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('申し込みが完了しました！');
      queryClient.invalidateQueries({ queryKey: ['activity', id] });
      queryClient.invalidateQueries({ queryKey: ['registration', id] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
    onError: (err: any) => toast.error(err.message || '申し込みに失敗しました。')
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('registrations').delete().eq('activity_id', id).eq('user_id', currentUser!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('申し込みをキャンセルしました。');
      queryClient.invalidateQueries({ queryKey: ['activity', id] });
      queryClient.invalidateQueries({ queryKey: ['registration', id] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
    onError: () => toast.error('キャンセルの処理に失敗しました。')
  });

  if (isActivityLoading || isRegLoading) {
    return (
      <div className="flex justify-center flex-col items-center min-h-screen bg-[#F8F9FA]">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-16 h-16 text-rose-500 mb-6" />
        <h2 className="text-3xl font-serif text-gray-900 mb-4 uppercase tracking-tighter">Activity Not Found</h2>
        <p className="text-gray-500 max-w-md mx-auto mb-10">この活動は削除されたか、存在しない可能性があります。</p>
        <Link to="/activities" className="px-8 py-4 bg-gray-900 text-white rounded-2xl font-black text-[13px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl">Back to Activities</Link>
      </div>
    );
  }

  const [showScheduleWarning, setShowScheduleWarning] = useState(false);

  const handleRegister = () => {
    if (activity.sessions?.length > 0 && selectedSessions.length === 0) {
      setShowScheduleWarning(true);
      return;
    }
    setShowScheduleWarning(false);
    registerMutation.mutate();
    toast.info('申し込みを処理中...');
  };

  // Reset warning when user starts selecting
  useEffect(() => {
    if (selectedSessions.length > 0) setShowScheduleWarning(false);
  }, [selectedSessions]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] relative overflow-hidden py-10 sm:py-20 px-4 sm:px-6">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#4F5BD5]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[5%] left-[-10%] w-[700px] h-[700px] bg-[#FEDA75]/3 blur-[150px] rounded-full" />
        <div className="absolute top-[20%] left-[20%] w-[500px] h-[500px] bg-[#D62976]/5 blur-[100px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto bg-white rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.08)] border border-gray-100 relative z-10 overflow-hidden flex flex-col"
      >
        <Link
          to="/activities"
          className="absolute top-8 right-8 w-12 h-12 bg-gray-50 hover:bg-rose-50 text-gray-400 hover:text-rose-500 rounded-2xl flex items-center justify-center transition-all z-20 group"
        >
          <X className="w-6 h-6 group-hover:scale-110" />
        </Link>

        <div className="p-5 sm:p-8 lg:p-14">
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <span className="px-4 py-1.5 bg-gray-900 text-white rounded-full text-[11px] font-black uppercase tracking-[0.2em] shadow-lg shadow-gray-900/20">
              {activity.location_type === 'external' ? '学外活動' : '学内活動'}
            </span>
            <span className={cn(
              "px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-[0.2em] shadow-sm",
              activity.isClosed
                ? "bg-rose-50 text-rose-500 border border-rose-100"
                : "bg-emerald-500 text-white shadow-emerald-500/20"
            )}>
              {activity.isClosed ? '募集終了' : '募集中'}
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-7xl font-serif text-gray-900 leading-[1.1] tracking-tighter mb-8 sm:mb-12 break-words">
            {activity.title}
          </h1>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
            <div className="p-8 bg-gray-50/50 rounded-[2.5rem] border border-gray-100 flex flex-col gap-4 group hover:bg-white hover:shadow-xl transition-all duration-500">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-500 shadow-sm transition-transform group-hover:scale-110">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5">開催日時</p>
                <p className="text-xl sm:text-2xl font-serif text-gray-900">{format(new Date(activity.date), "d/M (E)", { locale: jaLocale })}</p>
              </div>
            </div>

            <div className="p-8 bg-gray-50/50 rounded-[2.5rem] border border-gray-100 flex flex-col gap-4 group hover:bg-white hover:shadow-xl transition-all duration-500">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-500 shadow-sm transition-transform group-hover:scale-110">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5">定員</p>
                <p className="text-2xl font-serif text-gray-900">{activity.capacity ? `${activity.capacity}名` : '制限なし'}</p>
              </div>
            </div>

            <div className="p-8 bg-gray-50/50 rounded-[2.5rem] border border-gray-100 flex flex-col gap-4 group hover:bg-white hover:shadow-xl transition-all duration-500">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-rose-500 shadow-sm transition-transform group-hover:scale-110">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5">募集終了</p>
                <p className="text-xl sm:text-2xl font-serif text-gray-900">
                  <span className={cn(isPast(new Date(activity.registration_deadline)) && "line-through opacity-30")}>
                    {format(new Date(activity.registration_deadline), "d/M (E)", { locale: jaLocale })}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-8 bg-gray-50/50 rounded-[2rem] sm:rounded-[2.5rem] border border-gray-100 flex items-center gap-4 sm:gap-6 mb-6 group hover:bg-white hover:shadow-xl transition-all duration-500">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-indigo-500 shadow-sm group-hover:bg-indigo-500 group-hover:text-white transition-all">
              <MapPin className="w-7 h-7" />
            </div>
            <div>
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">開催場所</p>
              <p className="text-2xl font-black text-gray-900 uppercase tracking-tight">{activity.location}</p>
            </div>
          </div>

          {activity.cancellation_deadline && (
            <div className="p-8 bg-amber-50/30 rounded-[2.5rem] border border-amber-100/50 flex items-center gap-6 mb-12 group hover:bg-white hover:shadow-xl transition-all duration-500">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-amber-500 shadow-sm group-hover:bg-amber-500 group-hover:text-white transition-all">
                <Edit2 className="w-7 h-7" />
              </div>
              <div>
                <p className="text-[11px] font-black text-amber-600/60 uppercase tracking-widest mb-1">取消・変更期限</p>
                <p className="text-2xl font-black text-gray-900 uppercase tracking-tight">
                  <span className={cn(isPast(new Date(activity.cancellation_deadline)) && "text-rose-500/50")}>
                    {format(new Date(activity.cancellation_deadline), "yyyy/MM/dd HH:mm")}
                  </span>
                </p>
              </div>
            </div>
          )}

          <div className="mb-12 sm:mb-20">
            <div className="p-5 sm:p-8 md:p-12 border-2 border-stone-600 rounded-[2rem] sm:rounded-[2.5rem] bg-gray-50/50 shadow-sm">
              <p className="text-xl text-gray-500 leading-[1.8] font-medium whitespace-pre-wrap max-w-3xl">
                {activity.description || '活動の詳細情報はありません。'}
              </p>
            </div>
          </div>

          {activity.sessions && activity.sessions.length > 0 && (
            <div className="mb-20">
              <div className="flex items-center gap-3 mb-10">
                <div className="w-1 h-6 bg-emerald-500 rounded-full" />
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-[0.2em]">参加時間帯</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activity.sessions.map((session: any, idx: number) => {
                  const currentCount = activity.sessionCounts?.[idx] || 0;
                  const isFull = session.capacity && currentCount >= session.capacity;
                  const isSelected = activeSessions.includes(idx);

                  return (
                    <button
                      key={idx}
                      onClick={() => toggleSession(idx)}
                      disabled={!!myRegistration || (isFull && !isSelected)}
                      className={cn(
                        "p-6 rounded-[2rem] border-2 transition-all duration-500 text-left relative overflow-hidden group flex items-center gap-6",
                        isSelected
                          ? "bg-white text-indigo-600 border-indigo-600 shadow-xl shadow-indigo-200/20"
                          : isFull
                            ? "bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed opacity-60"
                            : "bg-white border-gray-400 text-gray-900 hover:border-indigo-400 hover:shadow-lg",
                        myRegistration && "opacity-80 cursor-default"
                      )}
                    >
                      {/* Full Badge */}
                      {isFull && !isSelected && (
                        <div className="absolute top-0 right-0 px-4 py-1.5 bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest rounded-bl-2xl">
                          満員
                        </div>
                      )}

                      {/* Checkbox Replacement for Vol.X */}
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center border-2 transition-all shrink-0",
                        isSelected
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : isFull
                            ? "bg-gray-100 text-gray-200 border-gray-200"
                            : "bg-white text-transparent border-stone-400"
                      )}>
                        <CheckCircle2 className={cn("w-5 h-5 transition-transform", isSelected ? "scale-100" : "scale-0")} />
                      </div>

                      <div className="relative z-10 flex-1">
                        <p className="text-xl font-black uppercase tracking-tight mb-0.5">
                          {format(new Date(session.date), "MM/dd (EEE)", { locale: jaLocale })}
                        </p>
                        <div className="flex items-center gap-3">
                          <p className={cn("text-base font-medium", isSelected ? "text-indigo-600/60" : "text-gray-500")}>
                            {session.start_time} - {session.end_time}
                          </p>
                          {session.capacity && !isFull && (
                            <span className={cn(
                              "text-[10px] font-black px-2 py-0.5 rounded-full border",
                              isFull ? "bg-rose-50 border-rose-100 text-rose-500" : "bg-gray-50 border-gray-100 text-gray-400"
                            )}>
                              {currentCount}/{session.capacity}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-14 border-t border-gray-100 flex flex-col items-center gap-10">
            {!myRegistration && !activity.isClosed && session && (
              <div className="w-full max-w-md space-y-6">
                <AnimatePresence>
                  {showScheduleWarning && (
                    <motion.div
                      key="schedule-warning"
                      initial={{ opacity: 0, height: 0, scale: 0.95 }}
                      animate={{ opacity: 1, height: 'auto', scale: 1 }}
                      exit={{ opacity: 0, height: 0, scale: 0.95 }}
                      className="overflow-hidden w-full"
                    >
                      <div className="flex flex-col gap-5 py-4 w-full">
                        <div className="p-6 bg-rose-50 border border-rose-200 rounded-[2rem] flex items-start gap-4 shadow-xl shadow-rose-900/5">
                          <AlertCircle className="w-6 h-6 text-rose-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[13px] font-black text-rose-600 uppercase tracking-widest leading-tight mb-2">スケジュール未選択</p>
                            <p className="text-[11px] font-bold text-rose-700/70 leading-relaxed uppercase tracking-widest">
                              参加する時間帯を最低1つ選択してください。<br />
                              スケジュールが選ばれていないため、申し込みを完了できません。
                            </p>
                          </div>
                        </div>
                        <p className="text-center text-[10px] font-black text-rose-500 animate-pulse tracking-[0.3em] uppercase">
                          ↑ スケジュールをタップして選択してください ↑
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Consent Checkbox */}
                <div className="flex items-center justify-center pt-2">
                  <div className="flex items-center gap-4 group cursor-pointer" onClick={() => setAgreed(!agreed)}>
                    <div className={cn(
                      "w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all",
                      agreed ? "bg-indigo-600 border-indigo-600 text-white scale-110" : "border-gray-200 group-hover:border-indigo-400"
                    )}>
                      {agreed && <CheckCircle2 className="w-5 h-5" />}
                    </div>
                    <p className="text-sm font-black text-gray-500 uppercase tracking-widest">内容を全て確認し、同意しました</p>
                  </div>
                </div>

                {/* Apply Button */}
                <button
                  onClick={handleRegister}
                  disabled={registerMutation.isPending || !agreed}
                  className={cn(
                    "w-full py-6 rounded-[2rem] text-[15px] font-black uppercase tracking-[0.3em] flex items-center justify-center transition-all shadow-2xl",
                    agreed
                      ? "bg-gradient-to-r from-[#D62976] to-[#4F5BD5] text-white hover:scale-[1.02] active:scale-95 shadow-indigo-500/20"
                      : "bg-gray-100 text-gray-300 cursor-not-allowed"
                  )}
                >
                  {registerMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Apply Now <ChevronRight className="w-5 h-5 ml-2" /></>}
                </button>
              </div>
            )}

            {!session && !activity.isClosed && (
              <div className="w-full max-w-md">
                <Link
                  to="/login"
                  state={{ from: `/activities/${id}` }}
                  className="w-full py-6 bg-gray-900 text-white rounded-[2rem] text-[15px] font-black uppercase tracking-[0.3em] flex items-center justify-center shadow-2xl hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Login to Apply
                </Link>
              </div>
            )}

            {myRegistration && (
              <div className="w-full max-w-md flex flex-col items-center gap-12">
                {/* Applied Status Badge */}
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-full py-8 bg-emerald-50 text-emerald-600 rounded-[2.5rem] border-2 border-emerald-100 flex flex-col items-center justify-center gap-4 shadow-xl shadow-emerald-500/5 group"
                >
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] mb-1 opacity-60">Status</p>
                    <p className="text-2xl font-black uppercase tracking-widest">申し込み済み</p>
                  </div>
                </motion.div>

                {/* Cancel Action (Secondary) */}
                <div className="flex flex-col items-center gap-4 w-full">
                  <button
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending || (activity.cancellation_deadline && isPast(new Date(activity.cancellation_deadline)))}
                    className={cn(
                      "group flex items-center gap-2 px-8 py-3 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all",
                      (activity.cancellation_deadline && isPast(new Date(activity.cancellation_deadline)))
                        ? "text-stone-300 cursor-not-allowed"
                        : "text-stone-400 hover:text-rose-500 hover:bg-rose-50"
                    )}
                  >
                    {cancelMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <X className="w-4 h-4" />
                        <span>申し込みをキャンセルする</span>
                      </>
                    )}
                  </button>

                  {activity.cancellation_deadline && isPast(new Date(activity.cancellation_deadline)) && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="px-6 py-2 bg-rose-50 text-rose-500 text-[10px] font-black rounded-lg uppercase tracking-widest flex items-center gap-2"
                    >
                      <AlertCircle size={12} />
                      取消期限を過ぎているため、操作できません
                    </motion.p>
                  )}
                </div>
              </div>
            )}

            {activity.isClosed && !myRegistration && (
              <div className="w-full max-w-md py-6 bg-gray-100 text-gray-400 rounded-[2rem] text-[15px] font-black uppercase tracking-[0.3em] flex items-center justify-center cursor-not-allowed">
                Registration Closed
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
