import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import XLSX from 'xlsx-js-style';
import { format } from 'date-fns';
import { ArrowLeft, Download, Loader2, Search, CheckCircle2, UserX, Sparkles, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useDebounce } from '../../hooks/useDebounce';

// Helper Map for Status
const STATUS_JA = {
  'applied': '確認中',
  'present': '出席',
  'unexcused_absence': '欠席'
};


const STATUS_COLOR_THEME = {
  'applied': { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', active: 'bg-amber-500 text-white border-amber-500' },
  'present': { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', active: 'bg-emerald-500 text-white border-emerald-500' },
  'unexcused_absence': { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200', active: 'bg-rose-500 text-white border-rose-500' }
};

// -------------------------------------------------------------
// CHILD COMPONENT: Simple Registration Item
// -------------------------------------------------------------
function RegistrationItem({ reg, activityId, currentSessionIdx, sessions }: { reg: any, activityId: string, currentSessionIdx: number | null, sessions: any[] }) {
  const queryClient = useQueryClient();
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState(reg.admin_note || '');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const debouncedNote = useDebounce(note, 800);
  const isFirstRender = useRef(true);

  // Note Mutation
  const updateNoteMutation = useMutation({
    mutationFn: async (newNote: string) => {
      const { error } = await supabase
        .from('registrations')
        .update({ admin_note: newNote })
        .eq('id', reg.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setIsSavingNote(false);
      queryClient.invalidateQueries({ queryKey: ['admin-registrations', activityId] });
    },
    onError: (err: any) => {
      toast.error('Error saving note: ' + err.message);
      setIsSavingNote(false);
    }
  });

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (debouncedNote !== (reg.admin_note || '')) {
      setIsSavingNote(true);
      updateNoteMutation.mutate(debouncedNote);
    }
  }, [debouncedNote]);

  // Find existing session status if available
  const sessionStatus = reg.attendance_records?.find((ar: any) => ar.session_index === currentSessionIdx)?.status;
  const displayStatus = currentSessionIdx !== null ? (sessionStatus || 'applied') : reg.attendance_status;

  // Status Mutation (Now specialized for session-level)
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {

      if (currentSessionIdx !== null) {
        // Upsert into attendance_records
        const { error } = await supabase
          .from('attendance_records')
          .upsert({
            registration_id: reg.id,
            session_index: currentSessionIdx,
            status: newStatus
          }, { onConflict: 'registration_id,session_index' });
        if (error) throw error;
      } else {
        // Fallback to legacy behavior for "All Updates" view
        const { error } = await supabase
          .from('registrations')
          .update({ attendance_status: newStatus })
          .eq('id', reg.id);
        if (error) throw error;
      }
    },
    onMutate: async (newStatus) => {
      await queryClient.cancelQueries({ queryKey: ['admin-registrations', activityId] });
      const previousRegs = queryClient.getQueryData(['admin-registrations', activityId]);
      queryClient.setQueryData(['admin-registrations', activityId], (old: any) => {
        if (!old) return old;
        return old.map((r: any) => {
          if (r.id !== reg.id) return r;
          if (currentSessionIdx !== null) {
            const existingRecords = r.attendance_records || [];
            const otherRecords = existingRecords.filter((ar: any) => ar.session_index !== currentSessionIdx);
            return { ...r, attendance_records: [...otherRecords, { session_index: currentSessionIdx, status: newStatus }] };
          }
          return { ...r, attendance_status: newStatus };
        });
      });
      return { previousRegs };
    },
    onError: (err: any, _newStatus, context) => {
      queryClient.setQueryData(['admin-registrations', activityId], context?.previousRegs);
      toast.error('Update error: ' + err.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-registrations', activityId] });
    }
  });

  return (
    <div className="bg-white border border-stone-100 rounded-[2rem] p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_20px_50px_rgba(79,91,213,0.08)] hover:border-indigo-100 transition-all duration-500 group relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-[#4F5BD5] opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

        {/* User Info Section */}
        <div className="flex items-center gap-2 flex-1 min-w-0">

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h3 className="text-base sm:text-lg font-black text-[#0f172a] tracking-tight uppercase leading-none">
                {reg.users ? (reg.users.full_name_kana || reg.users.full_name) : '退会済みユーザー'}
              </h3>

              <div className="flex items-center gap-2">
                {reg.users?.mssv && (
                  <span className="text-[10px] font-bold tracking-wider text-indigo-500 bg-indigo-50/50 px-2.5 py-1 rounded-lg border border-indigo-100">
                    {reg.users.mssv}
                  </span>
                )}
                {reg.users?.line_nickname && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-[#06C755] bg-[#06C755]/5 px-2 py-1 rounded-lg border border-[#06C755]/10 lowercase">
                    @{reg.users.line_nickname}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-gray-400">
              {/* Sessions */}
              {Array.isArray(reg.selected_sessions) && reg.selected_sessions.length > 0 && (
                <div className="flex items-center gap-1.5 bg-indigo-50/30 px-3 py-1.5 rounded-xl border border-[#4F5BD5]/20">
                  <div className="flex items-center gap-1">
                    {/* Deduplicate session times for cleaner display */}
                    {Array.from(new Set(reg.selected_sessions.map((sIdx: number) => {
                      const s = sessions?.[sIdx];
                      if (!s) return 'N/A';
                      return s.end_time ? `${s.start_time}-${s.end_time}` : `${s.start_time} ~`;
                    }))).map((time: any, idx) => (
                      <span key={idx} className="text-[10px] font-black text-[#4F5BD5] uppercase tracking-tighter">
                        {time}{idx < Array.from(new Set(reg.selected_sessions.map((sIdx: number) => {
                          const s = sessions?.[sIdx];
                          if (!s) return 'N/A';
                          return s.end_time ? `${s.start_time}-${s.end_time}` : `${s.start_time} ~`;
                        }))).length - 1 ? ' • ' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Registration Date */}
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-stone-500">
                <span className="w-1 h-1 rounded-full bg-stone-200" />
                <span>申込: {format(new Date(reg.registered_at), 'MM/dd')}</span>
              </div>

              {/* Memo Button */}
              <button
                onClick={() => setShowNote(!showNote)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${reg.admin_note
                  ? 'bg-rose-50/50 text-rose-500 border-rose-100 shadow-sm'
                  : 'bg-stone-50/30 text-stone-500 border-stone-100 hover:text-stone-600 hover:bg-stone-50'
                  }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {reg.admin_note ? 'メモを確認' : 'メモを追加'}
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons Section - Show when a specific session is selected OR when the activity has NO sessions at all */}
        {(currentSessionIdx !== null || !sessions?.length) && (
          <div className="flex flex-row items-center gap-1.5 w-full lg:w-auto">
            {[
              { id: 'present', label: '出席', color: 'present', icon: CheckCircle2 },
              { id: 'unexcused_absence', label: '欠席', color: 'unexcused_absence', icon: UserX },
              { id: 'applied', label: '確認中', color: 'applied', icon: Sparkles },
            ].map((item) => {
              const theme = STATUS_COLOR_THEME[item.color as keyof typeof STATUS_COLOR_THEME];
              const isActive = displayStatus === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => updateStatusMutation.mutate(item.id)}
                  className={`flex-1 lg:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-1 sm:px-3 py-3 rounded-xl border-2 text-[10px] sm:text-[12px] font-black uppercase tracking-widest transition-all active:scale-95 ${isActive ? theme.active : `bg-white border-gray-100 text-gray-400 hover:border-gray-200 hover:text-gray-700 shadow-sm`
                    }`}
                >
                  <item.icon className="w-3.5 h-3.5 sm:w-4 h-4" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Expandable Note Section */}
      <AnimatePresence>
        {showNote && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-gray-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">メモ</span>
                {isSavingNote && <Loader2 className="w-3 h-3 animate-spin text-[#4F5BD5]" />}
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="メモを記入!"
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-4 text-sm font-bold text-[#0f172a] focus:bg-white focus:border-[#4F5BD5]/20 outline-none transition-all placeholder:text-gray-300 resize-none h-20"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// -------------------------------------------------------------
// MAIN COMPONENT
// -------------------------------------------------------------

export default function ActivityRegistrations() {
  const { id: activityId } = useParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSessionIdx, setSelectedSessionIdx] = useState<number | null>(null);

  const debouncedSearch = useDebounce(searchTerm, 400);

  // Activitiy registrations are for admins only, so we always show full info to them.
  const isFullDisclosure = true;

  const { data: activity, isLoading: actLoading } = useQuery({
    queryKey: ['admin-activity-detail', activityId],
    queryFn: async () => {
      const { data, error } = await supabase.from('activities').select('*').eq('id', activityId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!activityId
  });

  useEffect(() => {
    if (activity?.sessions?.length === 1 && selectedSessionIdx === null) {
      setSelectedSessionIdx(0);
    }
  }, [activity, selectedSessionIdx]);

  const { data: registrations, isLoading: regLoading } = useQuery({
    queryKey: ['admin-registrations', activityId],
    queryFn: async () => {

      const { data, error } = await supabase
        .from('registrations')
        .select(`
          id, attendance_status, admin_note, registered_at, selected_sessions,
          users:user_id (id, mssv, full_name, full_name_kana, email, phone, line_nickname, university_email),
          attendance_records (session_index, status)
        `)
        .eq('activity_id', activityId)
        .order('registered_at', { ascending: true })
        .not('user_id', 'is', null);

      if (error) {
        console.error('Supabase fetch error details:', error);
        throw error;
      }


      return data;
    },
    enabled: !!activityId
  });

  // Calculate session counts
  const sessionCounts = useMemo(() => {
    if (!registrations) return {};
    const counts: Record<number, number> = {};
    registrations.forEach(reg => {
      if (Array.isArray(reg.selected_sessions)) {
        reg.selected_sessions.forEach((sIdx: number) => {
          counts[sIdx] = (counts[sIdx] || 0) + 1;
        });
      }
    });
    return counts;
  }, [registrations]);


  const filteredRegs = useMemo(() => {
    if (!registrations) return [];
    let result = registrations;

    if (selectedSessionIdx !== null) {
      result = result.filter((r: any) => {
        // If sessions field is missing, it's effectively registered for everything
        if (!r.selected_sessions) return true;
        // Check if the current session index exists in the member's selected_sessions array
        return Array.isArray(r.selected_sessions) && r.selected_sessions.includes(selectedSessionIdx);
      });
    }

    // Filter by Search (Case insensitive searching of name and student ID)
    if (debouncedSearch.trim()) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter((r: any) =>
        (r.users?.full_name?.toLowerCase().includes(lower)) ||
        (r.users?.full_name_kana?.toLowerCase().includes(lower)) ||
        (r.users?.mssv?.toLowerCase().includes(lower))
      );
    }

    // Final filter: Keep all registrations to preserve historical "results"
    // (We no longer filter out registrations from deleted users)
    return result;
  }, [registrations, debouncedSearch, selectedSessionIdx]);

  const exportToExcel = () => {
    if (!registrations || !activity) return;
    try {
      const ws = XLSX.utils.aoa_to_sheet([]);

      // Meta Information & Headers
      const sessionInfo = selectedSessionIdx !== null
        ? ` (${activity.sessions[selectedSessionIdx].start_time})`
        : ' (全日程一括)';

      const headersRow = ['No', '学籍番号', '氏名', 'フリガナ', 'LINEニックネーム'];

      const sessionHeaderStartIndex = headersRow.length;

      if (selectedSessionIdx !== null && activity.sessions?.[selectedSessionIdx]) {
        const s = activity.sessions[selectedSessionIdx];
        const datePart = format(new Date(s.date), 'M月d日');
        const timePart = s.end_time ? `${s.start_time}-${s.end_time}` : s.start_time;
        headersRow.push(`${datePart} (${timePart})`);
      } else if (activity.sessions?.length === 1) {
        const s = activity.sessions[0];
        const datePart = format(new Date(s.date), 'M月d日');
        const timePart = s.end_time ? `${s.start_time}-${s.end_time}` : s.start_time;
        headersRow.push(`${datePart} (${timePart})`);
      } else if (activity.sessions?.length > 1) {
        activity.sessions.forEach((s: any) => {
          const datePart = format(new Date(s.date), 'M月d日');
          const timePart = s.end_time ? `${s.start_time}-${s.end_time}` : s.start_time;
          headersRow.push(`${datePart} (${timePart})`);
        });
      } else {
        // NO SESSIONS CASE
        try {
          const d = new Date(activity.date);
          const datePart = format(d, 'M月d日');
          const timePart = format(d, 'HH:mm');
          headersRow.push(`${datePart} (${timePart})`);
        } catch {
          headersRow.push('出欠');
        }
      }

      if (isFullDisclosure) {
        headersRow.push('大学メール', '電話番号');
      }
      headersRow.push('備考');

      const headers = [
        [`活動名：${activity.title}${sessionInfo}`],
        [`エクスポート日時：${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`],
        [isFullDisclosure ? '全ての情報を開示' : '制限された情報の開示（氏名・学籍番号のみ）'],
        [''],
        headersRow
      ];

      XLSX.utils.sheet_add_aoa(ws, headers, { origin: 'A1' });

      // Apply styling to the header row (Row 5 - index 4)
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = XLSX.utils.encode_cell({ r: 4, c: C });
        if (!ws[address]) continue;
        ws[address].s = {
          fill: { fgColor: { rgb: "4472C4" } }, // Professional Blue
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } }
          }
        };
      }

      // Member Data
      const rowData = filteredRegs.map((r: any, idx) => {
        const row: any[] = [
          idx + 1,
          r.users?.mssv || 'N/A',
          r.users?.full_name || 'N/A',
          r.users?.full_name_kana || '-',
          r.users?.line_nickname ? `${r.users.line_nickname}` : '未設定'
        ];

        if (selectedSessionIdx !== null) {
          const sStatus = r.attendance_records?.find((ar: any) => ar.session_index === selectedSessionIdx)?.status;
          row.push(STATUS_JA[sStatus as keyof typeof STATUS_JA] || STATUS_JA[r.attendance_status as keyof typeof STATUS_JA] || '確認中');
        } else if (activity.sessions?.length > 0) {
          activity.sessions.forEach((_: any, i: number) => {
            const isSelected = !r.selected_sessions || (Array.isArray(r.selected_sessions) && r.selected_sessions.includes(i));
            if (!isSelected) {
              row.push('-'); // Not registered for this session
            } else {
              const sStatus = r.attendance_records?.find((ar: any) => ar.session_index === i)?.status;
              row.push(STATUS_JA[sStatus as keyof typeof STATUS_JA] || '確認中');
            }
          });
        } else {
          row.push(STATUS_JA[r.attendance_status as keyof typeof STATUS_JA] || '確認中');
        }
        if (isFullDisclosure) {
          row.push(r.users?.university_email || '-');
          row.push(r.users?.phone || '-');
        }
        row.push(r.admin_note || '');
        return row;
      });

      XLSX.utils.sheet_add_aoa(ws, rowData, { origin: 'A6' });

      // Column Widths for better readability
      const colWidths = [
        { wch: 6 },  // No
        { wch: 15 }, // 学籍番号
        { wch: 25 }, // 氏名
        { wch: 25 }, // フリガナ
        { wch: 20 }, // LINE
      ];

      // Add widths for attendance columns
      const sessionCount = activity.sessions?.length || 1;
      for (let i = 0; i < sessionCount; i++) {
        colWidths.push({ wch: 30 });
      }

      colWidths.push({ wch: 35 }); // Email
      colWidths.push({ wch: 15 }); // Phone
      colWidths.push({ wch: 40 }); // 備考

      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance List');

      // Filename construction: [ActivityTitle]の出欠（年月日）
      const safeTitle = activity.title.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 50);
      const datePart = format(new Date(), 'yyyyMMdd');
      const sessionFilePart = selectedSessionIdx !== null ? `_S${selectedSessionIdx + 1}` : '';

      XLSX.writeFile(wb, `${safeTitle}の出欠（${datePart}）${sessionFilePart}.xlsx`);

      if (!isFullDisclosure) {
        toast.info('プライバシー設定により、氏名と学籍番号のみエクスポートされました。');
      } else {
        toast.success('Excel Report Exported Successfully');
      }
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error('Failed to export Excel report: ' + err.message);
    }
  };

  if (actLoading || regLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 text-[#4F5BD5] animate-spin" />
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.3em]">データを同期中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Navigation Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <Link
          to="/admin/activities"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-3 bg-gradient-to-r from-[#4F5BD5] to-[#7B61FF] text-white rounded-full text-[14px] font-black shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-95 no-underline group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span>一覧に戻る</span>
        </Link>

        <button
          onClick={exportToExcel}
          className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-3.5 bg-gray-900 hover:bg-[#4F5BD5] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl active:scale-95"
        >
          <Download className="w-4 h-4" /> Excelエクスポート
        </button>
      </div>

      {/* Standalone Activity Heading */}
      <div className="relative pt-2 pb-2">
        <div className="absolute -left-10 top-0 w-64 h-64 bg-gradient-to-br from-[#D62976]/5 to-[#4F5BD5]/5 blur-3xl rounded-full -z-10" />
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-[#0f172a] tracking-tight transition-all duration-500">
          {activity?.title}
        </h1>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-1 w-12 sm:w-20 bg-gradient-to-r from-[#D62976] to-transparent rounded-full" />
          <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em] sm:tracking-[0.5em]">Activity Management</p>
        </div>
      </div>

      {/* Control Bar with Gradient Border */}
      <div className="space-y-4">
        <div className="p-[1px] bg-gradient-to-r from-[#D62976] to-[#4F5BD5] rounded-3xl shadow-lg shadow-[#4F5BD5]/10">
          <div className="bg-white/95 backdrop-blur-2xl p-2.5 sm:p-3.5 rounded-[1.4rem] sm:rounded-[1.95rem] overflow-hidden">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4F5BD5]" />
              <input
                type="text"
                placeholder="氏名や学籍番号でクイック検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-6 py-3 bg-transparent text-[#0f172a] text-sm font-black uppercase tracking-widest outline-none transition-all placeholder:text-gray-400"
              />
            </div>
          </div>
        </div>

        {/* Navigation Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {activity?.sessions?.length > 1 && (
            <button
              onClick={() => setSelectedSessionIdx(null)}
              className={`px-6 py-2.5 rounded-xl text-[10px] uppercase tracking-widest transition-all whitespace-nowrap border-2 ${selectedSessionIdx === null
                ? 'bg-gray-900 border-gray-900 text-white font-black shadow-lg shadow-gray-200'
                : 'bg-white border-gray-300 text-gray-400 font-bold hover:border-gray-400'
                }`}
            >
              すべて ({registrations?.length || 0}人)
            </button>
          )}

          {activity?.sessions?.length > 0 && (
            <>
              {activity.sessions.length > 1 && <div className="h-8 w-[2px] bg-gray-100 mx-1 shrink-0" />}
              {activity.sessions.map((session: any, idx: number) => (
                <button
                  key={idx}
                  onClick={() => setSelectedSessionIdx(idx)}
                  className={`px-6 py-2.5 rounded-xl text-[10px] uppercase tracking-widest transition-all whitespace-nowrap border-2 ${selectedSessionIdx === idx
                    ? 'bg-rose-500 border-rose-500 text-white font-black shadow-lg shadow-rose-500/20'
                    : session.capacity && (sessionCounts[idx] || 0) >= session.capacity
                      ? 'bg-rose-50 border-rose-200 text-rose-500 font-black'
                      : 'bg-white border-gray-300 text-gray-400 font-bold hover:border-gray-400'
                    }`}
                >
                  {session.start_time}{session.end_time ? ` - ${session.end_time}` : ' ~'} ({sessionCounts[idx] || 0}{session.capacity ? `/${session.capacity}` : ''}人)
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Registration List */}
      <div className="space-y-4">
        {filteredRegs.length === 0 ? (
          <div className="text-center py-20 bg-white border border-gray-100 rounded-3xl">
            <UserX className="w-8 h-8 text-gray-100 mx-auto mb-4" />
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">登録メンバーがいません</p>
          </div>
        ) : (
          filteredRegs.map((reg) => (
            <RegistrationItem
              key={reg.id}
              reg={reg}
              activityId={activityId!}
              currentSessionIdx={selectedSessionIdx}
              sessions={activity?.sessions || []}
            />
          ))
        )}
      </div>

      <div className="pt-8 text-center pb-10">
        <p className="text-[9px] font-black text-gray-200 uppercase tracking-[0.8em]">End of Records</p>
      </div>
    </div>
  );
}
