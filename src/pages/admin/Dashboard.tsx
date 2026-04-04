import { motion } from 'framer-motion';
import { 
  Users, 
  CalendarDays, 
  BarChart3, 
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export default function Dashboard() {
  // 1. Fetch Stats
  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [members, activities] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('activities').select('*', { count: 'exact', head: true })
      ]);
      return {
        members: members.count || 0,
        activities: activities.count || 0
      };
    }
  });

  // 2. Fetch Audit Logs
  const { data: activityFeed, isLoading: isActivityLoading } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_audit_logs')
        .select(`
          *,
          users:user_id (full_name, avatar_url, email)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return (data || []).map((log: any) => {
        const user = Array.isArray(log.users) ? log.users[0] : log.users;

        const logMap: Record<string, { label: string; icon: any; color: string; type: string }> = {
          'profile_update': { label: 'が個人情報を更新しました', icon: Users, color: 'text-[#4F5BD5]', type: 'profile' },
          'registration_new': { label: 'が新しく活動に登録しました', icon: CalendarDays, color: 'text-emerald-500', type: 'registration' },
          'registration_update': { label: 'が活動申込を更新しました', icon: CheckCircle2, color: 'text-amber-500', type: 'update' },
          'registration_delete': { label: 'が活動をキャンセルしました', icon: XCircle, color: 'text-rose-500', type: 'cancellation' }
        };

        const config = logMap[log.action_type] || { label: 'が行われました', icon: AlertCircle, color: 'text-brand-stone-400', type: 'system' };

        let changeSummary = '';
        if (log.action_type === 'registration_update' && log.details?.old && log.details?.new) {
          const oldSessions = JSON.stringify(log.details.old.selected_sessions);
          const newSessions = JSON.stringify(log.details.new.selected_sessions);
          if (oldSessions !== newSessions) {
            changeSummary = ` (Sessions: ${oldSessions} → ${newSessions})`;
          }
        }

        return {
          id: log.id,
          user: user?.full_name || 'Unknown User',
          email: user?.email,
          avatar: user?.avatar_url,
          action: config.label,
          summary: changeSummary,
          target: log.content_name || 'System',
          timestamp: new Date(log.created_at),
          icon: config.icon,
          color: config.color,
          type: config.type
        };
      });
    },
    refetchInterval: 10000
  });

  return (
    <div className="space-y-12 pb-20">
      {/* 1. Header with Consolidated Stats */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 pt-4">
        <div className="relative">
          <div className="absolute -left-5 top-0 w-1.5 h-full bg-gradient-to-b from-[#4F5BD5] to-[#D62976] rounded-full" />
          <h1 className="text-4xl font-black text-brand-stone-900 tracking-tighter">アクティビティ履歴</h1>
          <p className="text-brand-stone-400 text-sm font-bold mt-2 uppercase tracking-widest italic opacity-60">System Audit Core</p>
        </div>

        <div className="flex items-center gap-4">
          {isStatsLoading ? (
            <div className="flex items-center gap-4 bg-white px-8 py-4 rounded-[2rem] border border-brand-stone-100 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-brand-stone-50" />
              <div className="w-20 h-4 bg-brand-stone-50 rounded" />
            </div>
          ) : (
            <>
              <div className="group bg-white hover:bg-brand-stone-900 px-8 py-4 rounded-[2rem] border border-brand-stone-100 shadow-sm transition-all duration-500 flex items-center gap-5 hover:scale-[1.05] hover:shadow-xl hover:shadow-brand-stone-200/50">
                <div className="w-10 h-10 rounded-xl bg-[#4F5BD5]/5 group-hover:bg-white/10 flex items-center justify-center transition-colors">
                  <Users className="w-5 h-5 text-[#4F5BD5] group-hover:text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-black group-hover:text-white/50 text-brand-stone-300 uppercase tracking-widest mb-0.5">Total Members</p>
                  <p className="text-2xl font-black text-brand-stone-900 group-hover:text-white leading-none">{stats?.members}</p>
                </div>
              </div>

              <div className="group bg-white hover:bg-brand-stone-900 px-8 py-4 rounded-[2rem] border border-brand-stone-100 shadow-sm transition-all duration-500 flex items-center gap-5 hover:scale-[1.05] hover:shadow-xl hover:shadow-brand-stone-200/50">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 group-hover:bg-white/10 flex items-center justify-center transition-colors">
                  <CalendarDays className="w-5 h-5 text-emerald-500 group-hover:text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-black group-hover:text-white/50 text-brand-stone-300 uppercase tracking-widest mb-0.5">Total Activities</p>
                  <p className="text-2xl font-black text-brand-stone-900 group-hover:text-white leading-none">{stats?.activities}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2. Management Activity Feed Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="w-full bg-white border border-brand-stone-100 rounded-[2.5rem] p-8 md:p-12 shadow-xl shadow-brand-stone-200/10"
      >
        {isActivityLoading ? (
          <div className="w-full flex flex-col items-center justify-center gap-4 py-20">
            <Loader2 className="w-10 h-10 text-[#4F5BD5] animate-spin opacity-20" />
          </div>
        ) : !activityFeed || activityFeed.length === 0 ? (
          <div className="w-full flex flex-col items-center justify-center gap-4 py-20 opacity-30">
            <BarChart3 className="w-12 h-12 text-brand-stone-200" />
          </div>
        ) : (
          <div className="space-y-12">
            {(() => {
              const groups: Record<string, any[]> = {};
              activityFeed.forEach(item => {
                if (!item.timestamp) return;
                const dateKey = item.timestamp.toLocaleDateString('ja-JP', { 
                  year: 'numeric', month: 'long', day: 'numeric' 
                });
                if (!groups[dateKey]) groups[dateKey] = [];
                groups[dateKey].push(item);
              });

              return Object.entries(groups).map(([date, items]) => (
                <div key={date} className="relative space-y-4">
                  <div className="sticky top-0 z-20 py-4 bg-white/95 backdrop-blur-sm -mx-4 px-4 flex items-center gap-4">
                    <h2 className="text-lg font-black text-brand-stone-900 tracking-tighter">{date}</h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-brand-stone-100 to-transparent" />
                  </div>

                  <div className="space-y-1">
                    {items.map((item) => (
                      <div key={item.id} className="relative group flex items-start gap-8 p-4 rounded-2xl hover:bg-brand-stone-50/50 transition-colors">
                        <div className="w-20 pt-1 text-right shrink-0">
                          <span className="text-[11px] font-black text-brand-stone-300 tracking-widest tabular-nums uppercase">
                            {item.timestamp.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div className="relative pt-1 flex-1 flex items-start gap-4">
                          <div className={`w-8 h-8 rounded-xl bg-white border border-brand-stone-100 shadow-sm flex items-center justify-center shrink-0 ${item.color}`}>
                            <item.icon className="w-4 h-4" />
                          </div>

                          <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-0 sm:gap-2">
                            <span className="text-[14px] font-black text-[#4F5BD5]">{item.user}</span>
                            <span className="text-[13px] font-medium text-brand-stone-600 block sm:inline">
                              {item.action.replace('が', '')} <span className="text-brand-stone-400 mx-1">→</span> <span className="font-bold">{item.target}</span>
                              {item.summary && <span className="text-[#D62976] font-black ml-1.5">{item.summary}</span>}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
      </motion.div>
    </div>
  );
}
