import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Accordion from '@radix-ui/react-accordion';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronDown, ArrowLeft, Download, Loader2, Search, CheckCircle2, UserX, Clock, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useDebounce } from '../../hooks/useDebounce';

// Helper Map for Status
const STATUS_JA = {
  'pending': '未出席',
  'present': '出席',
  'excused_absence': '公欠',
  'unexcused_absence': '欠席'
};

const STATUS_COLOR = {
  'pending': 'bg-brand-stone-800 text-brand-stone-400 border-brand-stone-700',
  'present': 'bg-brand-emerald-500/10 text-brand-emerald-400 border-brand-emerald-500/20',
  'excused_absence': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'unexcused_absence': 'bg-rose-500/10 text-rose-400 border-rose-500/20'
};

// -------------------------------------------------------------
// CHILD COMPONENT: Accordion Item (to manage local debounce state)
// -------------------------------------------------------------
function RegistrationItem({ reg, activityId }: { reg: any, activityId: string }) {
  const queryClient = useQueryClient();
  
  // Local note state for debouncing
  const [note, setNote] = useState(reg.admin_note || '');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const debouncedNote = useDebounce(note, 800);
  const isFirstRender = useRef(true);

  // 1. Note Mutation (Debounced Auto-save)
  const updateNoteMutation = useMutation({
    mutationFn: async (newNote: string) => {
      const { error } = await supabase
        .from('registrations')
        .update({ admin_note: newNote })
        .eq('id', reg.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(reg.users.full_name + 'さんのメモを保存しました', { id: `note-${reg.id}` });
      setIsSavingNote(false);
      queryClient.invalidateQueries({ queryKey: ['admin-registrations', activityId] });
    },
    onError: (err: any) => {
      toast.error('メモの保存に失敗しました: ' + err.message, { id: `note-${reg.id}` });
      setIsSavingNote(false);
    }
  });

  // Watch for debounced note change
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Only fire if the note actually differs from DB to prevent unnecessary calls
    if (debouncedNote !== (reg.admin_note || '')) {
      setIsSavingNote(true);
      toast.loading('メモを保存中...', { id: `note-${reg.id}` });
      updateNoteMutation.mutate(debouncedNote);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedNote]);

  // 2. Status Mutation (Optimistic Update)
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from('registrations')
        .update({ attendance_status: newStatus })
        .eq('id', reg.id);
      if (error) throw error;
    },
    onMutate: async (newStatus) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['admin-registrations', activityId] });
      // Snapshot previous value
      const previousRegs = queryClient.getQueryData(['admin-registrations', activityId]);
      // Optimistically update to the new value
      queryClient.setQueryData(['admin-registrations', activityId], (old: any) => {
        if (!old) return old;
        return old.map((r: any) => r.id === reg.id ? { ...r, attendance_status: newStatus } : r);
      });
      // Return context object with snapshotted value
      return { previousRegs };
    },
    onError: (err: any, _newStatus, context) => {
      // Rollback on error
      queryClient.setQueryData(['admin-registrations', activityId], context?.previousRegs);
      toast.error('出欠更新エラー: ' + err.message);
    },
    onSettled: () => {
      // Always refetch after error or success to sync fully
      queryClient.invalidateQueries({ queryKey: ['admin-registrations', activityId] });
    }
  });

  return (
    <Accordion.Item value={reg.id} className="bg-brand-stone-900 border border-brand-stone-800 rounded-2xl mb-4 overflow-hidden shadow-sm hover:border-brand-stone-700 transition-all">
      <Accordion.Header className="flex">
        <Accordion.Trigger className="w-full flex items-center justify-between p-6 hover:bg-brand-stone-800/50 transition-colors group">
          <div className="flex items-center gap-5 text-left">
            <div className="w-12 h-12 rounded-xl bg-brand-stone-800 flex items-center justify-center font-serif text-brand-stone-300 font-bold shrink-0 shadow-inner group-hover:bg-brand-stone-700 transition-colors">
              {reg.users.full_name.charAt(0)}
            </div>
            <div>
              <p className="text-lg font-serif text-brand-stone-100 flex items-center gap-3">
                {reg.users.full_name} 
                {reg.users.mssv && <span className="text-xs text-brand-stone-500 font-normal tracking-wider bg-brand-stone-950 px-2 py-0.5 rounded border border-brand-stone-800">{reg.users.mssv}</span>}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`text-[10px] uppercase font-bold tracking-[0.2em] px-3 py-1 rounded-full border shadow-sm ${STATUS_COLOR[reg.attendance_status as keyof typeof STATUS_COLOR]}`}>
                  {STATUS_JA[reg.attendance_status as keyof typeof STATUS_JA]}
                </span>
                {reg.admin_note && <span className="text-xs text-brand-stone-500 italic flex items-center gap-1 bg-brand-stone-950/50 px-2 py-1 rounded border border-brand-stone-800/50"><FileWarning className="w-3 h-3" /> メモあり</span>}
              </div>
            </div>
          </div>
          <ChevronDown className="w-5 h-5 text-brand-stone-500 group-data-[state=open]:rotate-180 transition-transform duration-500" />
        </Accordion.Trigger>
      </Accordion.Header>
      
      <Accordion.Content className="overflow-hidden data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown">
        <div className="p-6 border-t border-brand-stone-800 bg-brand-stone-950/20 flex flex-col lg:flex-row gap-8">
          
          {/* Status Selection */}
          <div className="flex-1 space-y-4">
            <h4 className="text-[10px] uppercase tracking-[0.2em] text-brand-stone-500 font-bold">出欠ステータスを更新</h4>
            <div className="grid grid-cols-2 gap-3">
              <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all active:scale-[0.98] ${reg.attendance_status === 'present' ? 'bg-brand-emerald-500/10 border-brand-emerald-500/50 text-brand-emerald-400 shadow-lg shadow-brand-emerald-950/20' : 'bg-brand-stone-900 border-brand-stone-800 text-brand-stone-400 hover:bg-brand-stone-800 hover:border-brand-stone-700'}`}>
                <input type="radio" className="hidden" name={`status-${reg.id}`} checked={reg.attendance_status === 'present'} onChange={() => updateStatusMutation.mutate('present')} />
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span className="font-bold text-sm text-inherit">出席</span>
              </label>
              
              <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all active:scale-[0.98] ${reg.attendance_status === 'excused_absence' ? 'bg-amber-500/10 border-amber-500/50 text-amber-400 shadow-lg shadow-amber-950/20' : 'bg-brand-stone-900 border-brand-stone-800 text-brand-stone-400 hover:bg-brand-stone-800 hover:border-brand-stone-700'}`}>
                <input type="radio" className="hidden" name={`status-${reg.id}`} checked={reg.attendance_status === 'excused_absence'} onChange={() => updateStatusMutation.mutate('excused_absence')} />
                <FileWarning className="w-5 h-5 shrink-0" />
                <span className="font-bold text-sm text-inherit">公欠</span>
              </label>

              <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all active:scale-[0.98] ${reg.attendance_status === 'unexcused_absence' ? 'bg-rose-500/10 border-rose-500/50 text-rose-400 shadow-lg shadow-rose-950/20' : 'bg-brand-stone-900 border-brand-stone-800 text-brand-stone-400 hover:bg-brand-stone-800 hover:border-brand-stone-700'}`}>
                <input type="radio" className="hidden" name={`status-${reg.id}`} checked={reg.attendance_status === 'unexcused_absence'} onChange={() => updateStatusMutation.mutate('unexcused_absence')} />
                <UserX className="w-5 h-5 shrink-0" />
                <span className="font-bold text-sm text-inherit">欠席</span>
              </label>

              <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all active:scale-[0.98] ${reg.attendance_status === 'pending' ? 'bg-brand-stone-800 border-brand-stone-600 text-brand-stone-300 shadow-lg shadow-black/20' : 'bg-brand-stone-900 border-brand-stone-800 text-brand-stone-400 hover:bg-brand-stone-800 hover:border-brand-stone-700'}`}>
                <input type="radio" className="hidden" name={`status-${reg.id}`} checked={reg.attendance_status === 'pending'} onChange={() => updateStatusMutation.mutate('pending')} />
                <Clock className="w-5 h-5 shrink-0" />
                <span className="font-bold text-sm text-inherit">未出席</span>
              </label>
            </div>
          </div>

          {/* Admin Note Textarea */}
          <div className="flex-1 space-y-4">
             <div className="flex items-center justify-between">
                <h4 className="text-[10px] uppercase tracking-[0.2em] text-brand-stone-500 font-bold">管理者用メモ</h4>
                {isSavingNote && (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin text-brand-emerald-500" />
                    <span className="text-[10px] text-brand-emerald-500 font-bold uppercase tracking-widest">Saving...</span>
                  </div>
                )}
             </div>
             <textarea 
               value={note}
               onChange={(e) => setNote(e.target.value)}
               placeholder="例：遅刻15分、早退予定など..."
               className="w-full h-28 bg-brand-stone-950 border border-brand-stone-800 rounded-xl p-4 text-sm text-brand-stone-200 focus:ring-1 focus:ring-brand-emerald-500 outline-none resize-none transition-all placeholder:text-brand-stone-700 shadow-inner"
             />
             <p className="text-[10px] text-brand-stone-600 italic">入力後、1秒で自動的に保存されます。</p>
          </div>

        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}

// -------------------------------------------------------------
// MAIN COMPONENT
// -------------------------------------------------------------

export default function ActivityRegistrations() {
  const { id: activityId } = useParams();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);

  // 1. Fetch Activity Info
  const { data: activity, isLoading: actLoading } = useQuery({
    queryKey: ['admin-activity-detail', activityId],
    queryFn: async () => {
      const { data, error } = await supabase.from('activities').select('*').eq('id', activityId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!activityId
  });

  // 2. Fetch Registrations
  const { data: registrations, isLoading: regLoading } = useQuery({
    queryKey: ['admin-registrations', activityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('registrations')
        .select(`
          id, attendance_status, admin_note, registered_at,
          users (id, mssv, full_name, email, phone, line_id, hometown)
        `)
        .eq('activity_id', activityId)
        .order('registered_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!activityId
  });

  // 3. Search Filter
  const filteredRegs = useMemo(() => {
    if (!registrations) return [];
    if (!debouncedSearch.trim()) return registrations;
    const lower = debouncedSearch.toLowerCase();
    return registrations.filter((r: any) => 
      r.users.full_name.toLowerCase().includes(lower) || 
      (r.users.mssv && r.users.mssv.toLowerCase().includes(lower))
    );
  }, [registrations, debouncedSearch]);

  // 4. Excel Export
  const exportToExcel = () => {
    if (!registrations || !activity) return;

    try {
      const ws = XLSX.utils.aoa_to_sheet([]);
      
      const titleStr = `出欠リスト - ${activity.title.toUpperCase()}`;
      const dateStr = `出力日時: ${format(new Date(), 'yyyy/MM/dd HH:mm', { locale: ja })}`;
      
      XLSX.utils.sheet_add_aoa(ws, [
        [titleStr],
        [dateStr],
        ['No', '学籍番号', '氏名', 'メール', '電話番号', '連絡先ID', '出身', 'ステータス', 'メモ']
      ], { origin: 'A1' });

      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }
      ];

      const colWidths = [5, 15, 25, 30, 15, 15, 20, 20, 30];
      
      const rowData = registrations.map((r: any, idx) => {
        const row = [
          idx + 1,
          r.users.mssv || '',
          r.users.full_name || '',
          r.users.email || '',
          r.users.phone || '',
          r.users.line_id || '',
          r.users.hometown || '',
          STATUS_JA[r.attendance_status as keyof typeof STATUS_JA] || r.attendance_status,
          r.admin_note || ''
        ];
        
        row.forEach((val, i) => {
          const len = String(val).length * 1.5 + 2;
          if (len > colWidths[i]) {
            colWidths[i] = len; 
          }
        });
        
        colWidths.forEach((w, i) => { if(w > 50) colWidths[i] = 50; });

        return row;
      });

      XLSX.utils.sheet_add_aoa(ws, rowData, { origin: 'A4' });
      ws['!cols'] = colWidths.map(w => ({ wch: w }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'AttendanceList');
      
      const safeTitleName = activity.title.substring(0, 20).replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');
      const timestamp = format(new Date(), 'yyyyMMdd');
      XLSX.writeFile(wb, `Attendance_${safeTitleName}_${timestamp}.xlsx`);
      
      toast.success('Excelファイルを書き出しました');
    } catch (err: any) {
      toast.error('書き出しエラー: ' + err.message);
    }
  };

  if (actLoading || regLoading) {
    return <div className="flex justify-center py-32"><Loader2 className="w-10 h-10 text-brand-emerald-500 animate-spin" /></div>;
  }

  return (
    <div className="space-y-10 max-w-5xl mx-auto px-4 sm:px-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-4">
          <Link to="/admin/activities" className="group inline-flex items-center gap-2 text-sm text-brand-stone-500 hover:text-brand-emerald-400 transition-all font-bold uppercase tracking-widest">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 戻る
          </Link>
          <h1 className="text-3xl sm:text-4xl font-serif text-brand-stone-50 tracking-tight leading-tight">{activity?.title}</h1>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 text-sm text-brand-stone-400 font-medium">
              <Clock className="w-4 h-4 text-brand-emerald-500" />
              {format(new Date(activity?.date), 'yyyy年MM月dd日 HH:mm', { locale: ja })}
            </span>
            <span className="w-1 h-1 rounded-full bg-brand-stone-700"></span>
            <p className="text-sm font-bold text-brand-stone-300">
              合計 {registrations?.length || 0} 名の申込
            </p>
          </div>
        </div>
        
        <button 
          onClick={exportToExcel}
          disabled={!registrations || registrations.length === 0}
          className="flex items-center gap-2 px-6 py-3 bg-brand-stone-800 hover:bg-brand-stone-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all border border-brand-stone-700 shadow-lg active:scale-[0.98]"
        >
          <Download className="w-4 h-4 text-brand-emerald-400" /> Excel書き出し
        </button>
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-brand-stone-800 to-transparent"></div>

      {/* Search Bar */}
      <div className="bg-brand-stone-800/10 p-6 rounded-3xl border border-brand-stone-800 backdrop-blur-sm">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-stone-500" />
          <input 
            type="text"
            placeholder="氏名や学籍番号で検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-6 py-4 bg-brand-stone-950 border border-brand-stone-800 text-brand-stone-100 rounded-2xl text-sm focus:ring-1 focus:ring-brand-emerald-500 outline-none transition-all placeholder:text-brand-stone-600 shadow-inner"
          />
        </div>
      </div>

      {/* Accordions */}
      {filteredRegs.length === 0 ? (
        <div className="text-center py-32 bg-brand-stone-800/10 border border-brand-stone-800 rounded-3xl animate-in fade-in zoom-in duration-500">
          <UserX className="w-12 h-12 text-brand-stone-700 mx-auto mb-4" />
          <p className="text-brand-stone-500 font-medium">該当するメンバーが見つかりませんでした。</p>
        </div>
      ) : (
        <Accordion.Root type="single" collapsible className="w-full space-y-4">
          {filteredRegs.map(reg => (
            <RegistrationItem key={reg.id} reg={reg} activityId={activityId!} />
          ))}
        </Accordion.Root>
      )}

    </div>
  );
}
