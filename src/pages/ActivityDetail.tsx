import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isPast } from 'date-fns';
import { ja as jaLocale } from 'date-fns/locale';
import { MapPin, Calendar, Clock, Users, ArrowLeft, Info, CalendarDays, AlertCircle, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function ActivityDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { currentUser, session } = useAuthStore();

  const { data: activity, isLoading: isActivityLoading } = useQuery({
    queryKey: ['activity', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('*, registrations(count)')
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

      // 1. Verify capacity immediately before inserting to prevent slight race condition
      const { count } = await supabase
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('activity_id', id);

      if (activity.capacity && (count || 0) >= activity.capacity) {
        throw new Error('定員に達したため、申し込みを締め切りました。');
      }

      const { error } = await supabase
        .from('registrations')
        .insert({
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
    onError: (err: any) => {
      toast.error(err.message || '申し込みに失敗しました。もう一度お試しください。');
    }
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('registrations')
        .delete()
        .eq('activity_id', id)
        .eq('user_id', currentUser!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('申し込みをキャンセルしました。');
      queryClient.invalidateQueries({ queryKey: ['activity', id] });
      queryClient.invalidateQueries({ queryKey: ['registration', id] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
    onError: () => {
      toast.error('キャンセルの処理に失敗しました。');
    }
  });

  if (isActivityLoading || isRegLoading) {
    return (
      <div className="flex justify-center flex-col items-center min-h-[calc(100vh-4rem)] bg-brand-stone-900">
         <div className="w-8 h-8 border-2 border-brand-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h2 className="text-2xl font-serif text-brand-stone-50">活動が見つかりませんでした</h2>
        <p className="text-brand-stone-400 mt-2">この活動は削除されたか、存在しない可能性があります。</p>
        <Link to="/activities" className="mt-8 inline-block text-brand-emerald-400 hover:text-brand-emerald-300">一覧に戻る</Link>
      </div>
    );
  }

  const progress = activity.capacity 
    ? Math.min((activity.registeredCount / activity.capacity) * 100, 100) 
    : 0;

  return (
    <div className="bg-brand-stone-900 pb-20">
      {/* Cover Image Header */}
      <div className="w-full h-[40vh] md:h-[50vh] relative border-b border-brand-stone-800">
        {activity.cover_image_url ? (
          <img 
            src={activity.cover_image_url} 
            alt={activity.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-brand-stone-800/50 flex items-center justify-center">
             <span className="font-serif italic text-4xl text-brand-stone-700">Milktea</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-brand-stone-900 via-brand-stone-900/60 to-transparent" />
        
        <div className="absolute inset-0 flex items-end">
          <div className="max-w-4xl mx-auto w-full px-6 pb-12">
            <Link to="/activities" className="inline-flex items-center gap-2 text-brand-stone-400 hover:text-white transition-colors text-sm mb-6">
              <ArrowLeft className="w-4 h-4" /> 一覧に戻る
            </Link>
            
            <div className="flex flex-wrap gap-3 mb-4">
              {activity.isClosed ? (
                <span className="px-3 py-1 bg-rose-500/20 text-rose-400 text-xs font-bold uppercase tracking-widest rounded-sm border border-rose-500/30">募集終了</span>
              ) : (
                <span className="px-3 py-1 bg-brand-emerald-500/20 text-brand-emerald-400 text-xs font-bold uppercase tracking-widest rounded-sm border border-brand-emerald-500/30">募集中</span>
              )}
              {activity.capacity && progress >= 100 && (
                <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-widest rounded-sm border border-amber-500/30">満員</span>
              )}
            </div>
            
            <h1 className="text-4xl md:text-6xl font-serif text-brand-stone-50 leading-tight">
              {activity.title}
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-3 gap-12">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-8">
          <div className="prose prose-invert prose-stone max-w-none mb-12">
            <h3 className="text-xl font-serif text-brand-stone-50 mb-6 flex items-center gap-3">
              <Info className="w-6 h-6 text-brand-emerald-500" />
              活動内容
            </h3>
            <p className="text-lg text-brand-stone-300 leading-relaxed whitespace-pre-wrap">
              {activity.description || '詳細情報はありません。'}
            </p>
          </div>

          {/* Schedule Section */}
          {activity.sessions && Array.isArray(activity.sessions) && activity.sessions.length > 0 && (
            <div className="mt-12 pt-12 border-t border-brand-stone-800">
              <h3 className="text-2xl font-serif text-brand-stone-50 mb-8 flex items-center gap-4">
                <CalendarDays className="w-7 h-7 text-brand-emerald-500" />
                スケジュール
              </h3>
              <div className="space-y-4">
                {activity.sessions
                  .map((s: any, i: number) => ({ ...s, originalIdx: i }))
                  .filter((s: any) => !myRegistration || activeSessions.includes(s.originalIdx))
                  .map((session: any) => (
                  <motion.div 
                    key={session.originalIdx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "group bg-brand-stone-900/50 border border-brand-stone-800/50 hover:border-brand-emerald-500/30 p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all duration-300",
                      activeSessions.includes(session.originalIdx) && myRegistration && "border-brand-emerald-500/30 bg-brand-emerald-500/5"
                    )}
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-xl bg-brand-stone-800/50 flex flex-col items-center justify-center border border-brand-stone-700/50 group-hover:bg-brand-emerald-500/10 group-hover:border-brand-emerald-500/20 transition-colors">
                        <span className="text-[10px] font-black text-brand-stone-500 uppercase leading-none mb-1">Vol.</span>
                        <span className="text-lg font-serif text-brand-stone-100 leading-none">{session.originalIdx + 1}</span>
                      </div>
                      <div>
                        <p className="text-brand-stone-100 font-black text-xs uppercase tracking-[0.2em] mb-1">
                          {format(new Date(session.date), "yyyy.MM.dd (EEE)", { locale: jaLocale })}
                        </p>
                        <p className="text-lg font-serif text-brand-stone-400 group-hover:text-brand-stone-100 transition-colors">
                          Session Event
                        </p>
                      </div>
                    </div>
                    <div className="w-full sm:w-auto p-4 sm:p-0 bg-brand-stone-800/30 sm:bg-transparent rounded-xl flex items-center justify-between sm:justify-end gap-6">
                      <div className="text-right">
                        <p className="text-[10px] font-black text-brand-stone-500 uppercase tracking-widest mb-1">Duration</p>
                        <p className="text-xl font-serif text-brand-stone-50">{session.start_time} - {session.end_time}</p>
                      </div>
                      <div className="pl-6 border-l border-brand-stone-800 flex items-center gap-4">
                        <div className="flex flex-col items-end gap-1">
                          <p className="text-sm font-serif text-brand-stone-400">{activeSessions.includes(session.originalIdx) ? '参加予定' : '未選択'}</p>
                        </div>
                        <button
                          onClick={() => !myRegistration && toggleSession(session.originalIdx)}
                          disabled={!!myRegistration}
                          className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 active:scale-90",
                            activeSessions.includes(session.originalIdx) 
                              ? "bg-brand-emerald-500 text-white shadow-lg shadow-brand-emerald-500/20" 
                              : "bg-brand-stone-800 border border-brand-stone-700 text-brand-stone-500 hover:border-brand-stone-500",
                            myRegistration && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {activeSessions.includes(session.originalIdx) ? <CheckCircle2 className="w-6 h-6" /> : <div className="w-4 h-4 rounded-full border-2 border-current opacity-20" />}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Agreement Section */}
          {!myRegistration && activity.sessions?.length > 0 && (
            <div className="mt-8 p-6 bg-brand-stone-900/30 border border-brand-stone-800 rounded-2xl flex items-center gap-4">
              <button 
                onClick={() => setAgreed(!agreed)}
                className={cn(
                  "w-6 h-6 rounded-md flex items-center justify-center transition-all",
                  agreed ? "bg-brand-emerald-500 text-white" : "bg-brand-stone-800 border border-brand-stone-700"
                )}
              >
                {agreed && <CheckCircle2 className="w-4 h-4" />}
              </button>
              <p className="text-sm text-brand-stone-400">
                活動内容およびスケジュールをすべて読み、理解した上で参加を申し込みます。
              </p>
            </div>
          )}
        </div>

        {/* Sidebar Info & Action */}
        <div className="space-y-6">
          <div className="bg-brand-stone-800/30 border border-brand-stone-700/50 p-6 rounded-sm">
            <h3 className="text-lg font-serif text-brand-stone-50 mb-6">基本情報</h3>
            
            <div className="space-y-4 text-sm text-brand-stone-300">
              <div className="flex gap-3">
                <Calendar className="w-5 h-5 text-brand-emerald-500 shrink-0" />
                <div>
                  <p className="font-medium text-brand-stone-200">開催日時</p>
                  <p className="mt-0.5">{format(new Date(activity.date), "yyyy年MM月dd日(EEE) HH:mm", { locale: jaLocale })}</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Clock className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <p className="font-medium text-brand-stone-200">申込締切</p>
                  <p className="mt-0.5">{format(new Date(activity.registration_deadline), "yyyy年MM月dd日 HH:mm", { locale: jaLocale })}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <MapPin className="w-5 h-5 text-brand-emerald-500 shrink-0" />
                <div>
                  <p className="font-medium text-brand-stone-200">開催場所</p>
                  <p className="mt-0.5">{activity.location}</p>
                </div>
              </div>
              
              <div className="pt-4 mt-4 border-t border-brand-stone-700/50">
                <div className="flex justify-between items-end mb-2">
                  <span className="font-medium text-brand-stone-200 flex items-center gap-2">
                    <Users className="w-4 h-4" /> 参加状況
                  </span>
                  <span className="text-brand-stone-400">
                    {activity.registeredCount} / {activity.capacity || '制限なし'}
                  </span>
                </div>
                {activity.capacity && (
                  <div className="h-2 w-full bg-brand-stone-800 overflow-hidden rounded-full">
                    <div 
                      className={`h-full transition-all duration-500 ${progress >= 100 ? 'bg-rose-500' : 'bg-brand-emerald-500'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Registration Actions */}
          <div className="pt-2">
            {!session ? (
              <Link 
                to={`/login`}
                state={{ from: `/activities/${id}` }}
                className="w-full block text-center bg-brand-stone-800 hover:bg-brand-stone-700 text-brand-stone-50 font-medium py-3.5 rounded-sm transition-colors"
              >
                ログインして申し込む
              </Link>
            ) : myRegistration ? (
              <div className="space-y-3">
                <div className="p-4 bg-brand-emerald-500/10 border border-brand-emerald-500/20 rounded-sm mb-4">
                  <p className="text-xs font-black text-brand-emerald-500 uppercase tracking-widest mb-1">申込完了</p>
                  <p className="text-xs text-brand-stone-400">この活動への申し込みは完了しています。</p>
                </div>
                <button 
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="w-full bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/30 font-medium py-3.5 rounded-sm transition-colors flex justify-center items-center"
                >
                  {cancelMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : '申し込みをキャンセルする'}
                </button>
              </div>
            ) : activity.isClosed ? (
              <button 
                disabled
                className="w-full bg-brand-stone-800 text-brand-stone-500 font-medium py-3.5 rounded-sm cursor-not-allowed border border-brand-stone-800"
              >
                募集終了 / 定員到達
              </button>
            ) : (
              <button 
                onClick={() => registerMutation.mutate()}
                disabled={registerMutation.isPending || !agreed || (activity.sessions?.length > 0 && selectedSessions.length === 0)}
                className={cn(
                  "w-full py-4 rounded-sm font-black text-[12px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3",
                  agreed && (!activity.sessions?.length || selectedSessions.length > 0)
                    ? "bg-brand-stone-800 text-brand-stone-50 hover:bg-brand-stone-700 shadow-xl"
                    : "bg-brand-stone-800/50 text-brand-stone-500 cursor-not-allowed"
                )}
              >
                {registerMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>参加を申し込む <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
