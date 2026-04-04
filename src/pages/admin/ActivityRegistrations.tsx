import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ArrowLeft, Download, Loader2, Search, CheckCircle2, UserX, FileWarning, Calendar, User, Sparkles, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useDebounce } from '../../hooks/useDebounce';

// Helper Map for Status
const STATUS_JA = {
  'pending': '確認待ち',
  'present': '出席',
  'unexcused_absence': '欠席'
};

const STATUS_COLOR_THEME = {
  'pending': { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', active: 'bg-amber-500 text-white border-amber-500' },
  'present': { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', active: 'bg-emerald-500 text-white border-emerald-500' },
  'unexcused_absence': { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200', active: 'bg-rose-500 text-white border-rose-500' }
};

// -------------------------------------------------------------
// CHILD COMPONENT: Simple Registration Item
// -------------------------------------------------------------
function RegistrationItem({ reg, activityId }: { reg: any, activityId: string }) {
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

  // Status Mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from('registrations')
        .update({ attendance_status: newStatus })
        .eq('id', reg.id);
      if (error) throw error;
    },
    onMutate: async (newStatus) => {
      await queryClient.cancelQueries({ queryKey: ['admin-registrations', activityId] });
      const previousRegs = queryClient.getQueryData(['admin-registrations', activityId]);
      queryClient.setQueryData(['admin-registrations', activityId], (old: any) => {
        if (!old) return old;
        return old.map((r: any) => r.id === reg.id ? { ...r, attendance_status: newStatus } : r);
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
    <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-[0_4px_20px_rgba(0,0,0,0.01)] hover:shadow-[0_10px_40px_rgba(0,0,0,0.04)] hover:border-gray-200 transition-all group">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

        {/* User Info Section */}
        <div className="flex items-center gap-4 flex-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-lg font-black text-[#0f172a] tracking-tight truncate uppercase">
                {reg.users.full_name}
              </p>
              {reg.users.mssv && (
                <span className="text-[10px] font-black tracking-widest text-[#4F5BD5] bg-[#4F5BD5]/5 px-2 py-0.5 rounded-lg border border-[#4F5BD5]/10">
                  {reg.users.mssv}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">
                Applied: {format(new Date(reg.registered_at), 'MM/dd')}
              </span>
              <button
                onClick={() => setShowNote(!showNote)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${reg.admin_note ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'text-gray-400 hover:text-gray-900'
                  }`}
              >
                <MessageSquare className="w-3 h-3" />
                {reg.admin_note ? 'Read Note' : 'Add Note'}
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons Section */}
        <div className="flex flex-row items-center gap-1.5 w-full lg:w-auto">
          {[
            { id: 'present', label: '出席', color: 'present', icon: CheckCircle2 },
            { id: 'unexcused_absence', label: '欠席', color: 'unexcused_absence', icon: UserX },
            { id: 'pending', label: '確認待ち', color: 'pending', icon: Sparkles },
          ].map((item) => {
            const theme = STATUS_COLOR_THEME[item.color as keyof typeof STATUS_COLOR_THEME];
            const isActive = reg.attendance_status === item.id;
            return (
              <button
                key={item.id}
                onClick={() => updateStatusMutation.mutate(item.id)}
                className={`flex-1 lg:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-1 sm:px-3 py-3 rounded-xl border-2 text-[10px] sm:text-[12px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                  isActive ? theme.active : `bg-white border-gray-100 text-gray-400 hover:border-gray-200 hover:text-gray-700 shadow-sm`
                }`}
              >
                <item.icon className="w-3.5 h-3.5 sm:w-4 h-4" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
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
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Admin Notes</span>
                {isSavingNote && <Loader2 className="w-3 h-3 animate-spin text-[#4F5BD5]" />}
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Write observations here..."
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
  const debouncedSearch = useDebounce(searchTerm, 400);

  const { data: activity, isLoading: actLoading } = useQuery({
    queryKey: ['admin-activity-detail', activityId],
    queryFn: async () => {
      const { data, error } = await supabase.from('activities').select('*').eq('id', activityId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!activityId
  });

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

  const filteredRegs = useMemo(() => {
    if (!registrations) return [];
    if (!debouncedSearch.trim()) return registrations;
    const lower = debouncedSearch.toLowerCase();
    return registrations.filter((r: any) =>
      r.users.full_name.toLowerCase().includes(lower) ||
      (r.users.mssv && r.users.mssv.toLowerCase().includes(lower))
    );
  }, [registrations, debouncedSearch]);

  const exportToExcel = () => {
    if (!registrations || !activity) return;
    try {
      const ws = XLSX.utils.aoa_to_sheet([]);
      
      // Meta Information & Headers
      const headers = [
        ['ACTIVITY ATTENDANCE REPORT'],
        [`Event: ${activity.title}`],
        [`Exported At: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`],
        [''],
        ['NO', 'STUDENT ID', 'FULL NAME', 'ATTENDANCE STATUS', 'ADMIN NOTE']
      ];

      XLSX.utils.sheet_add_aoa(ws, headers, { origin: 'A1' });

      // Member Data
      const rowData = registrations.map((r: any, idx) => [
        idx + 1,
        r.users.mssv || 'N/A',
        r.users.full_name || 'N/A',
        STATUS_JA[r.attendance_status as keyof typeof STATUS_JA] || 'Unknown',
        r.admin_note || ''
      ]);

      XLSX.utils.sheet_add_aoa(ws, rowData, { origin: 'A6' });

      // Column Widths for better readability
      ws['!cols'] = [
        { wch: 6 },  // NO
        { wch: 15 }, // STUDENT ID
        { wch: 30 }, // FULL NAME
        { wch: 20 }, // ATTENDANCE STATUS
        { wch: 40 }  // ADMIN NOTE
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance List');

      // Filename construction
      const safeTitle = activity.title.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 30);
      const timestamp = format(new Date(), 'yyyyMMdd_HHmm');
      XLSX.writeFile(wb, `${safeTitle}_Attendance_${timestamp}.xlsx`);

      toast.success('Excel Report Exported Successfully');
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error('Failed to export Excel report: ' + err.message);
    }
  };

  if (actLoading || regLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 text-[#4F5BD5] animate-spin" />
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.3em]">Syncing Records...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Navigation Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <Link
          to="/admin/activities"
          className="w-full sm:w-auto group inline-flex items-center justify-center gap-3 px-8 py-3.5 bg-gradient-to-r from-[#4F5BD5] to-[#7c3aed] text-white rounded-2xl text-[13px] font-black uppercase tracking-[0.2em] transition-all shadow-[0_10px_30px_rgba(79,91,213,0.3)] hover:shadow-[0_15px_40px_rgba(79,91,213,0.5)] active:scale-95"
        >
          <ArrowLeft className="w-5 h-5 text-white group-hover:-translate-x-1 transition-transform" />
          <span>一覧に戻る</span>
        </Link>

        <button 
          onClick={exportToExcel}
          className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-3.5 bg-gray-900 hover:bg-[#4F5BD5] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl active:scale-95"
        >
          <Download className="w-4 h-4" /> Export Excel
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

      {/* Registration List */}
      <div className="space-y-4">
        {filteredRegs.length === 0 ? (
          <div className="text-center py-20 bg-white border border-gray-100 rounded-3xl">
            <UserX className="w-8 h-8 text-gray-100 mx-auto mb-4" />
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">No members found</p>
          </div>
        ) : (
          filteredRegs.map((reg) => (
            <RegistrationItem key={reg.id} reg={reg} activityId={activityId!} />
          ))
        )}
      </div>

      <div className="pt-8 text-center pb-10">
        <p className="text-[9px] font-black text-gray-200 uppercase tracking-[0.8em]">End of Records</p>
      </div>
    </div>
  );
}
