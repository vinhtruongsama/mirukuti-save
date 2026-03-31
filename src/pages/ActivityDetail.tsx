import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isPast } from 'date-fns';
import { ja as jaLocale } from 'date-fns/locale';
import { MapPin, Calendar, Clock, Users, ArrowLeft, ExternalLink, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';

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

  const registerMutation = useMutation({
    mutationFn: async () => {
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
          attendance_status: 'pending'
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
          <div className="prose prose-invert prose-stone max-w-none">
            <p className="text-lg text-brand-stone-300 leading-relaxed whitespace-pre-wrap">
              {activity.description || '詳細情報はありません。'}
            </p>
          </div>
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
                <button 
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="w-full bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/30 font-medium py-3.5 rounded-sm transition-colors flex justify-center items-center"
                >
                  {cancelMutation.isPending ? '処理中...' : '申し込みをキャンセル'}
                </button>
                {activity.form_link && (
                  <a 
                    href={activity.form_link} 
                    target="_blank" 
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-2 bg-brand-emerald-600 hover:bg-brand-emerald-500 text-white font-medium py-3.5 rounded-sm transition-colors"
                  >
                    必要事項の入力 <ExternalLink className="w-4 h-4" />
                  </a>
                )}
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
                disabled={registerMutation.isPending}
                className="w-full bg-brand-emerald-600 hover:bg-brand-emerald-500 text-white font-medium py-3.5 rounded-sm transition-colors shadow-lg shadow-brand-emerald-900/20 flex justify-center items-center"
              >
                {registerMutation.isPending ? '処理中...' : '今すぐ申し込む'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
