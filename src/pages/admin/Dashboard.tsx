import {
  Users,
  CalendarDays,
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  UserPlus,
  Shield,
  Trash2,
  Calendar,
  Search
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

export default function Dashboard() {
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearType, setClearType] = useState<'all' | '30days' | '7days'>('30days');
  const queryClient = useQueryClient();

  const [displayLimit, setDisplayLimit] = useState(30);
  const [logSearch, setLogSearch] = useState('');

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
    queryKey: ['admin-audit-logs', displayLimit, logSearch],
    queryFn: async () => {
      let query = supabase
        .from('admin_audit_logs')
        .select(`
          *,
          users:user_id (full_name, full_name_kana, email),
          actor:actor_id (
            full_name,
            full_name_kana,
            club_memberships (role)
          )
        `);

      // 🔍 Better Search Logic
      if (logSearch.trim()) {
        const term = logSearch.trim();
        
        // 1. Try to parse Vietnamese Date Format (d/m/yyyy)
        const dateMatch = term.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
        if (dateMatch) {
          const [_, d, m, y] = dateMatch;
          const start = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00Z`);
          const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
          query = query.gte('created_at', start.toISOString()).lt('created_at', end.toISOString());
        } else {
          // 2. Fallback to text search on content_name
          query = query.ilike('content_name', `%${term}%`);
        }
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(displayLimit);

      if (error) throw error;

      return (data || []).map((log: any) => {
        const user = Array.isArray(log.users) ? log.users[0] : log.users;

        const logMap: Record<string, { label: string; icon: any; color: string; type: string }> = {
          'profile_update': { label: 'が個人情報を更新しました', icon: Users, color: 'text-[#4F5BD5]', type: 'profile' },
          'registration_new': { label: 'が新しく活動に登録しました', icon: CalendarDays, color: 'text-emerald-500', type: 'registration' },
          'registration_update': { label: 'が活動申込を更新しました', icon: CheckCircle2, color: 'text-amber-500', type: 'update' },
          'registration_delete': { label: 'が活動をキャンセルしました', icon: XCircle, color: 'text-rose-500', type: 'cancellation' },
          'member_archive': { label: 'をアーカイブしました', icon: XCircle, color: 'text-rose-600', type: 'archive' },
          'member_unarchive': { label: 'を復元しました', icon: CheckCircle2, color: 'text-emerald-600', type: 'unarchive' },
          'role_update': { label: 'の役職を更新しました', icon: BarChart3, color: 'text-indigo-600', type: 'role' },
          'member_new': { label: 'が新しく入部しました', icon: UserPlus, color: 'text-[#4F5BD5]', type: 'new_member' },
          'membership_update': { label: 'の会員情報を更新しました', icon: Shield, color: 'text-stone-500', type: 'membership' }
        };

        const config = logMap[log.action_type] || { label: 'が行われました', icon: AlertCircle, color: 'text-brand-stone-400', type: 'system' };

        let changeSummary = '';
        if (log.action_type === 'registration_update' && log.details?.old && log.details?.new) {
          const oldSessions = JSON.stringify(log.details.old.selected_sessions);
          const newSessions = JSON.stringify(log.details.new.selected_sessions);
          if (oldSessions !== newSessions) {
            changeSummary = ` (Sessions: ${oldSessions} → ${newSessions})`;
          }
        } else if (log.action_type === 'role_update' && log.details?.old && log.details?.new) {
          const roleMap: Record<string, string> = {
            'president': '部長',
            'vice_president': '副部長',
            'treasurer': '会計',
            'executive': '幹部',
            'member': '部員',
            'alumni': '卒業生'
          };
          const oldRole = roleMap[log.details.old.role] || log.details.old.role;
          const newRole = roleMap[log.details.new.role] || log.details.new.role;
          changeSummary = ` (${oldRole} → ${newRole})`;
        }

        const actor = Array.isArray(log.actor) ? log.actor[0] : log.actor;
        const actorRole = actor?.club_memberships?.[0]?.role;

        const roleMap: Record<string, string> = {
          'president': '部長',
          'vice_president': '副部長',
          'treasurer': '会計',
          'executive': '幹部',
          'member': '部員',
          'alumni': '卒業生'
        };
        const roleLabel = actorRole ? (roleMap[actorRole] || actorRole) : '';

        const actorDisplayName = actor?.full_name_kana || actor?.full_name || 'System';
        const actorFullName = !roleLabel ? actorDisplayName : `${roleLabel} ${actorDisplayName}`;

        return {
          id: log.id,
          user: user?.full_name_kana || user?.full_name || '削除されたメンバー',
          actor: actorFullName,
          email: user?.email,
          action: config.label,
          summary: changeSummary,
          target: log.content_name || 'システム',
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
        </div>

        <div className="flex items-center gap-1">
          {isStatsLoading ? (
            <div className="flex items-center gap-4 bg-white px-8 py-4 rounded-[2rem] border border-brand-stone-100 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-brand-stone-50" />
              <div className="w-20 h-4 bg-brand-stone-50 rounded" />
            </div>
          ) : (
            <>
              <div className="group bg-white hover:bg-brand-stone-900  py-4 px-6 rounded-[2rem] border border-brand-stone-100 shadow-sm transition-all duration-500 flex items-center gap-5 hover:scale-[1.05] hover:shadow-xl hover:shadow-brand-stone-200/50">
                <div className="w-10 h-10 rounded-xl bg-[#4F5BD5]/5 group-hover:bg-white/10 flex items-center justify-center transition-colors">
                  <Users className="w-5 h-5 text-[#4F5BD5] group-hover:text-white" />
                </div>
                <div>
                  <p className="text-[14px] font-black group-hover:text-white/50 text-brand-stone-700 uppercase tracking-widest mb-0.5">部員総数</p>
                  <p className="text-2xl font-black text-brand-stone-900 group-hover:text-white leading-none">{stats?.members}</p>
                </div>
              </div>

              <div className="group bg-white hover:bg-brand-stone-900 px-8 py-4 rounded-[2rem] border border-brand-stone-100 shadow-sm transition-all duration-500 flex items-center gap-5 hover:scale-[1.05] hover:shadow-xl hover:shadow-brand-stone-200/50">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 group-hover:bg-white/10 flex items-center justify-center transition-colors">
                  <CalendarDays className="w-5 h-5 text-emerald-500 group-hover:text-white" />
                </div>
                <div>
                  <p className="text-[14px] font-black group-hover:text-white/50 text-brand-stone-700 uppercase tracking-widest mb-0.5">活動総数</p>
                  <p className="text-2xl font-black text-brand-stone-900 group-hover:text-white leading-none">{stats?.activities}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2. Management Activity Feed Content */}
      <div className="w-full bg-white border border-brand-stone-100 rounded-[2.5rem] p-8 md:p-12 shadow-xl shadow-brand-stone-200/10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
            <h2 className="text-3xl font-black text-stone-900 tracking-tighter shrink-0">活動の履歴</h2>
            
            {/* 🔍 Search Input */}
            <div className="relative flex-1 max-w-md group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300 group-focus-within:text-[#4F5BD5] transition-colors" />
              <input 
                type="text"
                placeholder="日付 (例: 12/3/2026) hay keyword..."
                value={logSearch}
                onChange={(e) => {
                  setLogSearch(e.target.value);
                  setDisplayLimit(30); // Reset limit when searching
                }}
                className="w-full pl-12 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-[#4F5BD5]/20 focus:outline-none transition-all placeholder:text-stone-300"
              />
            </div>
          </div>

          <button
            onClick={() => setShowClearModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-rose-50 text-rose-600 rounded-2xl font-black text-sm hover:bg-rose-100 transition-all active:scale-95 shrink-0"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">履歴 hoặc xóa</span><span className="sm:hidden">Xóa</span>
          </button>
        </div>

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
                  {/* Normal Date Header (No longer sticky to avoid overlapping) */}
                  <div className="py-4 px-2 mb-4 border-b border-stone-100">
                    <h3 className="text-[20px] font-black text-stone-900 font-serif tracking-tighter">
                      {date}
                    </h3>
                  </div>

                  <div className="relative space-y-0">
                    <div className="absolute left-[22px] top-4 bottom-4 w-px bg-stone-100 hidden sm:block" />

                    {items.map((item, idx) => (
                      <div key={item.id} className="relative group flex items-start gap-4 sm:gap-8 p-4 sm:p-5 rounded-[1.5rem] hover:bg-stone-50/50 transition-all duration-300">
                        {/* Desktop: Time Column */}
                        <div className="hidden sm:block w-20 pt-1.5 text-right shrink-0">
                          <span className="text-[11px] font-black text-stone-400 tracking-widest tabular-nums uppercase">
                            {item.timestamp.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Activity Content Container */}
                        <div className="relative flex-1 flex items-start gap-4">
                          {/* Status Icon */}
                          <div className="relative z-10 shrink-0">
                            <div className={`w-11 h-11 rounded-[0.9rem] bg-white border border-stone-100 shadow-sm flex items-center justify-center transition-transform group-hover:scale-110 ${item.color}`}>
                              <item.icon className="w-5 h-5" />
                            </div>
                            {idx !== items.length - 1 && (
                              <div className="absolute top-12 left-1/2 -translate-x-1/2 w-px h-8 bg-stone-100 sm:hidden" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[14px] font-black text-[#4F5BD5] truncate">
                                  {item.user}
                                </span>
                                <span className="sm:hidden text-[10px] font-bold text-stone-400 tabular-nums">
                                  {item.timestamp.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-stone-500 leading-snug">
                                <span>{item.action}</span>
                                <span className="text-stone-300">/</span>
                                <span className="text-stone-900 bg-stone-100 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-tight">
                                  by {item.actor}
                                </span>
                                {item.summary && (
                                  <>
                                    <span className="text-stone-300">/</span>
                                    <span className="text-indigo-600 font-black">{item.summary}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}

            {activityFeed.length >= displayLimit && (
              <div className="pt-10 flex justify-center">
                <button
                  onClick={() => setDisplayLimit(prev => prev + 30)}
                  className="px-10 py-4 bg-stone-900 text-white rounded-2xl font-black text-sm hover:bg-stone-800 transition-all active:scale-95 shadow-xl shadow-stone-200"
                >
                  さらに読み込む (Load More)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Clear Logs Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-stone-900/60 backdrop-blur-md"
            onClick={() => setShowClearModal(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-10 overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 p-6">
              <button
                onClick={() => setShowClearModal(false)}
                className="w-10 h-10 flex items-center justify-center bg-stone-50 rounded-full hover:bg-stone-100 transition-all"
              >
                <XCircle className="w-5 h-5 text-stone-400" />
              </button>
            </div>

            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center">
                <Trash2 className="w-10 h-10 text-rose-500" />
              </div>

              <div>
                <h3 className="text-2xl font-black text-stone-900 tracking-tight">履歴をクリア</h3>
                <p className="text-stone-500 mt-2">どの履歴を削除しますか？<br />この操作は取り消せません。</p>
              </div>

              <div className="w-full grid grid-cols-1 gap-3">
                {[
                  { id: '7days', title: '7日以上前の全ログ', desc: '最近の操作のみ残します' },
                  { id: '30days', title: '30日以上前の全ログ', desc: '過去1ヶ月分を残します' },
                  { id: 'all', title: 'すべてのログを削除', desc: 'すべての履歴が消去されます' }
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setClearType(option.id as any)}
                    className={`flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all ${clearType === option.id
                      ? 'border-indigo-600 bg-indigo-50/30'
                      : 'border-stone-100 hover:border-stone-200'
                      }`}
                  >
                    <div className={`p-3 rounded-xl ${clearType === option.id ? 'bg-indigo-600' : 'bg-stone-100'}`}>
                      <Calendar className={`w-5 h-5 ${clearType === option.id ? 'text-white' : 'text-stone-400'}`} />
                    </div>
                    <div>
                      <h4 className={`font-black text-[15px] ${clearType === option.id ? 'text-indigo-900' : 'text-stone-900'}`}>{option.title}</h4>
                      <p className="text-xs text-stone-400 font-medium">{option.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="w-full flex items-center gap-3 pt-4">
                <button
                  onClick={() => setShowClearModal(false)}
                  className="flex-1 py-4 bg-stone-100 text-stone-900 rounded-2xl font-black text-sm hover:bg-stone-200 transition-all"
                >
                  キャンセル
                </button>
                <button
                  disabled={isClearing}
                  onClick={async () => {
                    setIsClearing(true);
                    try {
                      const cutoff = new Date();
                      if (clearType === '7days') cutoff.setDate(cutoff.getDate() - 7);
                      else if (clearType === '30days') cutoff.setDate(cutoff.getDate() - 30);

                      let query = supabase.from('admin_audit_logs').delete();

                      if (clearType === 'all') {
                        // Blanket delete needs a filter in PostgREST
                        query = query.neq('id', '00000000-0000-0000-0000-000000000000');
                      } else {
                        query = query.lt('created_at', cutoff.toISOString());
                      }

                      const { error } = await query;
                      if (error) {
                        toast.error('ログの削除に失敗しました: ' + error.message);
                      } else {
                        toast.success('履歴をクリアしました');
                        queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] });
                        setShowClearModal(false);
                      }
                    } finally {
                      setIsClearing(false);
                    }
                  }}
                  className="flex-1 py-4 bg-rose-500 text-white rounded-2xl font-black text-sm hover:bg-rose-600 transition-all shadow-lg shadow-rose-200 disabled:opacity-50"
                >
                  {isClearing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : '削除を実行'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
