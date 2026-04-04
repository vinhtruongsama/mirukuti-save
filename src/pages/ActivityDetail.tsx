import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isPast } from 'date-fns';
import { ja as jaLocale } from 'date-fns/locale';
import { MapPin, Clock, Users, AlertCircle, CheckCircle2, ChevronRight, Loader2, Edit2, X } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
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
        .select('*, registrations(count), academic_years(name)')
        .eq('id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      const registeredCount = data.registrations?.[0]?.count || 0;
      const isClosed =
        data.status === 'closed' ||
        isPast(new Date(data.registration_deadline)) ||
        (data.capacity && registeredCount >= data.capacity);

      return { ...data, registeredCount, isClosed };
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

      const { count, error: countError } = await supabase
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('activity_id', id);

      if (countError) throw countError;
      if (activity.capacity && (count || 0) >= activity.capacity) {
        throw new Error('定員に達したため、申し込みを締め切りました。');
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

        <div className="p-8 sm:p-14">
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <span className="px-4 py-1.5 bg-gray-900 text-white rounded-full text-[11px] font-black uppercase tracking-[0.2em] shadow-lg shadow-gray-900/20">
              {activity.academic_years?.name || '2026-2027'}
            </span>
            <span className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-[11px] font-black uppercase tracking-[0.2em] border border-indigo-100">
              {format(new Date(activity.date), "EEEE, MM/dd", { locale: jaLocale })}
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

          <h1 className="text-4xl sm:text-7xl font-serif text-gray-900 leading-[1.1] tracking-tighter mb-12">
            {activity.title}
          </h1>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
            <div className="p-8 bg-gray-50/50 rounded-[2.5rem] border border-gray-100 flex flex-col gap-4 group hover:bg-white hover:shadow-xl transition-all duration-500">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-500 shadow-sm transition-transform group-hover:scale-110">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5">開催日時</p>
                <p className="text-2xl font-serif text-gray-900">{format(new Date(activity.date), "HH:mm")}</p>
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
                <p className="text-2xl font-serif text-gray-900">
                  <span className={cn(isPast(new Date(activity.registration_deadline)) && "line-through opacity-30")}>
                    {format(new Date(activity.registration_deadline), "MM/dd HH:mm")}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="p-8 bg-gray-50/50 rounded-[2.5rem] border border-gray-100 flex items-center gap-6 mb-6 group hover:bg-white hover:shadow-xl transition-all duration-500">
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

          <div className="mb-20">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1 h-6 bg-indigo-500 rounded-full" />
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-[0.2em]">活動内容</h3>
            </div>
            <p className="text-xl text-gray-500 leading-[1.8] font-medium whitespace-pre-wrap max-w-3xl">
              {activity.description || '活動の詳細情報はありません。'}
            </p>
          </div>

          {activity.sessions && activity.sessions.length > 0 && (
            <div className="mb-20">
              <div className="flex items-center gap-3 mb-10">
                <div className="w-1 h-6 bg-emerald-500 rounded-full" />
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-[0.2em]">参加時間帯</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activity.sessions.map((session: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => toggleSession(idx)}
                    disabled={!!myRegistration}
                    className={cn(
                      "p-8 rounded-[2rem] border transition-all duration-500 text-left relative overflow-hidden group",
                      activeSessions.includes(idx)
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-200"
                        : "bg-white border-gray-200 text-gray-900 hover:border-indigo-400 hover:shadow-lg",
                      myRegistration && "opacity-80 cursor-default"
                    )}
                  >
                    <div className={cn(
                      "absolute top-0 right-0 w-32 h-32 blur-3xl rounded-full translate-x-10 -translate-y-10 transition-opacity",
                      activeSessions.includes(idx) ? "bg-white/10 opacity-100" : "bg-indigo-500/5 opacity-0 group-hover:opacity-100"
                    )} />
                    <div className="relative z-10">
                      <p className={cn("text-[11px] font-black uppercase tracking-widest mb-3", activeSessions.includes(idx) ? "text-indigo-200" : "text-gray-400")}>
                        Session {idx + 1}
                      </p>
                      <p className="text-2xl font-black uppercase tracking-tight mb-1">
                        {format(new Date(session.date), "MM/dd (EEE)", { locale: jaLocale })}
                      </p>
                      <p className={cn("text-lg font-medium", activeSessions.includes(idx) ? "text-indigo-100" : "text-gray-500")}>
                        {session.start_time} - {session.end_time}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-14 border-t border-gray-100 flex flex-col items-center gap-10">
            {!myRegistration && !activity.isClosed && (
              <div className="flex items-center gap-4 group cursor-pointer" onClick={() => setAgreed(!agreed)}>
                <div className={cn(
                  "w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all",
                  agreed ? "bg-indigo-600 border-indigo-600 text-white scale-110" : "border-gray-200 group-hover:border-indigo-400"
                )}>
                  {agreed && <CheckCircle2 className="w-5 h-5" />}
                </div>
                <p className="text-sm font-black text-gray-500 uppercase tracking-widest">内容を確認し、参加を希望します</p>
              </div>
            )}

            <div className="w-full max-w-md">
              {!session ? (
                <Link
                  to="/login"
                  state={{ from: `/activities/${id}` }}
                  className="w-full py-6 bg-gray-900 text-white rounded-[2rem] text-[15px] font-black uppercase tracking-[0.3em] flex items-center justify-center shadow-2xl hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Login to Apply
                </Link>
              ) : myRegistration ? (
                <div className="space-y-6 flex flex-col items-center">
                  <div className="px-10 py-4 bg-emerald-50 text-emerald-600 rounded-full text-[13px] font-black uppercase tracking-[0.2em] border border-emerald-100 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5" /> 申し込みが完了しています
                  </div>
                  <button
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending || (activity.cancellation_deadline && isPast(new Date(activity.cancellation_deadline)))}
                    className={cn(
                      "w-full py-6 rounded-[2rem] text-[13px] font-black uppercase tracking-[0.2em] flex items-center justify-center transition-all border group",
                      (activity.cancellation_deadline && isPast(new Date(activity.cancellation_deadline)))
                        ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                        : "bg-white border-gray-200 text-rose-500 hover:bg-rose-500 hover:text-white hover:border-rose-500 shadow-sm"
                    )}
                  >
                    {cancelMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : '申し込みをキャンセルする'}
                  </button>
                  {activity.cancellation_deadline && isPast(new Date(activity.cancellation_deadline)) && (
                    <p className="text-[11px] text-rose-500/70 font-black uppercase tracking-widest italic animate-pulse">
                      ※ 取消期限を過ぎているため、キャンセルできません
                    </p>
                  )}
                </div>
              ) : activity.isClosed ? (
                <div className="w-full py-6 bg-gray-100 text-gray-400 rounded-[2rem] text-[15px] font-black uppercase tracking-[0.3em] flex items-center justify-center cursor-not-allowed">
                  Registration Closed
                </div>
              ) : (
                <button
                  onClick={() => registerMutation.mutate()}
                  disabled={registerMutation.isPending || !agreed || (activity.sessions?.length > 0 && selectedSessions.length === 0)}
                  className={cn(
                    "w-full py-6 rounded-[2rem] text-[15px] font-black uppercase tracking-[0.3em] flex items-center justify-center transition-all shadow-2xl",
                    agreed && (!activity.sessions?.length || selectedSessions.length > 0)
                      ? "bg-gradient-to-r from-[#D62976] to-[#4F5BD5] text-white hover:scale-[1.02] active:scale-95 shadow-indigo-500/20"
                      : "bg-gray-100 text-gray-300 cursor-not-allowed"
                  )}
                >
                  {registerMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Apply Now <ChevronRight className="w-5 h-5 ml-2" /></>}
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
