import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../../store/useAuthStore';
import { X, Mail, Copy, ExternalLink, Loader2, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface SendMailModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ActivityItem {
  id: string;
  title: string;
}

const DEFAULT_CONDITIONS = [
  { minInternal: 1, minExternal: 4 },
  { minInternal: 2, minExternal: 3 },
  { minInternal: 3, minExternal: 2 },
  { minInternal: 4, minExternal: 1 },
  { minInternal: 0, minExternal: 5 },
];

export default function SendMailModal({ isOpen, onClose }: SendMailModalProps) {
  const { selectedYear } = useAppStore();
  const { currentUser } = useAuthStore();

  // Loading States
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [loadingCommittee, setLoadingCommittee] = useState(false);
  const [loadingQualified, setLoadingQualified] = useState(false);
  const [loadingAllMembers, setLoadingAllMembers] = useState(false);
  const [loadingActivitiesList, setLoadingActivitiesList] = useState(false);

  // Activities Data
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [showActivityDropdown, setShowActivityDropdown] = useState(false);
  const activityDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside listener for Activity Dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        activityDropdownRef.current &&
        !activityDropdownRef.current.contains(event.target as Node)
      ) {
        setShowActivityDropdown(false);
      }
    };

    if (showActivityDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showActivityDropdown]);

  // Form Fields
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Selected Recipient Targets
  const [manualEmails, setManualEmails] = useState('');
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);
  const [includeCommittee, setIncludeCommittee] = useState(false);
  const [includeQualified, setIncludeQualified] = useState(false);
  const [includeAllMembers, setIncludeAllMembers] = useState(false);

  // Resolved Email Lists
  const [activityEmails, setActivityEmails] = useState<string[]>([]);
  const [committeeEmails, setCommitteeEmails] = useState<string[]>([]);
  const [qualifiedEmails, setQualifiedEmails] = useState<string[]>([]);
  const [allMembersEmails, setAllMembersEmails] = useState<string[]>([]);
  const [emailCorrectionMap, setEmailCorrectionMap] = useState<Map<string, string>>(new Map());

  // Fetch all users email mapping for dynamic correction
  useEffect(() => {
    if (isOpen) {
      const loadEmailCorrections = async () => {
        try {
          const { data, error } = await supabase
            .from('users')
            .select('university_email, email')
            .is('deleted_at', null);
          if (!error && data) {
            const map = new Map<string, string>();
            data.forEach((u: any) => {
              if (u.university_email) {
                const cleanEmail = u.university_email.replace(/\s+/g, '_').trim();
                map.set(cleanEmail.toLowerCase(), cleanEmail);
              }
              if (u.email) {
                const cleanEmail = u.email.replace(/\s+/g, '_').trim();
                map.set(cleanEmail.toLowerCase(), cleanEmail);
              }
            });
            setEmailCorrectionMap(map);
          }
        } catch (e) {
          console.error('Failed to load email correction mappings:', e);
        }
      };
      loadEmailCorrections();
    }
  }, [isOpen]);

  const cleanAndCorrectEmail = (email: string) => {
    if (!email) return '';
    
    // 1. Remove spaces or replace spaces with underscores (common university email typo)
    let cleaned = email.replace(/\s+/g, '_').trim();
    
    // 2. Auto-correct common university domain typos
    // If the email domain contains 'umds' but is not exactly '@red.umds.ac.jp', auto-correct it.
    const parts = cleaned.split('@');
    if (parts.length === 2) {
      const localPart = parts[0];
      const domain = parts[1].toLowerCase();
      if (domain.includes('umds') && domain !== 'red.umds.ac.jp') {
        cleaned = `${localPart}@red.umds.ac.jp`;
      }
    }
    
    // 3. Match case-insensitively with the correction map if it exists, otherwise return the cleaned string
    const lower = cleaned.toLowerCase();
    return emailCorrectionMap.get(lower) || cleaned;
  };

  // Fetch Activities list when component mounts or year changes
  useEffect(() => {
    if (isOpen && selectedYear?.id) {
      fetchActivitiesList();
    }
  }, [isOpen, selectedYear?.id]);

  const fetchActivitiesList = async () => {
    try {
      setLoadingActivitiesList(true);
      const { data, error } = await supabase
        .from('activities')
        .select('id, title')
        .eq('academic_year_id', selectedYear?.id)
        .order('date', { ascending: false });

      if (error) throw error;
      setActivities(data || []);
    } catch (err: any) {
      console.error('Error fetching activities:', err);
      toast.error('活動一覧の取得に失敗しました');
    } finally {
      setLoadingActivitiesList(false);
    }
  };

  // Fetch emails for Selected Activity
  useEffect(() => {
    if (selectedActivity) {
      fetchActivityEmails(selectedActivity.id);
    } else {
      setActivityEmails([]);
    }
  }, [selectedActivity]);

  const fetchActivityEmails = async (activityId: string) => {
    try {
      setLoadingActivity(true);
      // Fetch registrations join users
      const { data, error } = await supabase
        .from('registrations')
        .select(`
          user_id,
          users:user_id (university_email)
        `)
        .eq('activity_id', activityId)
        .not('user_id', 'is', null);

      if (error) throw error;

      const emails = (data || [])
        .map((reg: any) => reg.users?.university_email)
        .filter(Boolean)
        .map(email => cleanAndCorrectEmail(email));

      // Unique emails
      const uniqueEmails = Array.from(new Set(emails));
      setActivityEmails(uniqueEmails);
    } catch (err: any) {
      console.error('Error fetching activity emails:', err);
      toast.error('活動参加者のメール取得に失敗しました');
    } finally {
      setLoadingActivity(false);
    }
  };

  // Fetch emails for Committee
  useEffect(() => {
    if (includeCommittee && selectedYear?.id) {
      fetchCommitteeEmails();
    } else {
      setCommitteeEmails([]);
    }
  }, [includeCommittee, selectedYear?.id]);

  const fetchCommitteeEmails = async () => {
    try {
      setLoadingCommittee(true);
      const { data, error } = await supabase
        .from('club_memberships')
        .select(`
          role,
          user:users(university_email)
        `)
        .eq('academic_year_id', selectedYear!.id)
        .is('deleted_at', null)
        .in('role', ['president', 'vice_president', 'executive']);

      if (error) throw error;

      const emails = (data || [])
        .map((m: any) => m.user?.university_email)
        .filter(Boolean)
        .map(email => cleanAndCorrectEmail(email));

      setCommitteeEmails(Array.from(new Set(emails)));
    } catch (err: any) {
      console.error('Error fetching committee emails:', err);
      toast.error('役員メールの取得に失敗しました');
    } finally {
      setLoadingCommittee(false);
    }
  };

  // Fetch emails for Qualified Members (Awards)
  useEffect(() => {
    if (includeQualified && selectedYear?.id) {
      fetchQualifiedEmails();
    } else {
      setQualifiedEmails([]);
    }
  }, [includeQualified, selectedYear?.id]);

  const fetchQualifiedEmails = async () => {
    try {
      setLoadingQualified(true);
      // 1. Fetch academic memberships
      const { data: membershipData, error: mError } = await supabase
        .from('club_memberships')
        .select('user:users(id, university_email)')
        .eq('academic_year_id', selectedYear!.id)
        .is('deleted_at', null);
      if (mError) throw mError;

      // 2. Fetch all 'present' attendance
      const { data: attData, error: aError } = await supabase
        .from('attendance_records')
        .select(`
          status,
          registration:registrations (
            user_id,
            activity:activities!inner (
              id,
              location_type,
              academic_year_id
            )
          )
        `)
        .eq('status', 'present')
        .eq('registration.activity.academic_year_id', selectedYear!.id);
      if (aError) throw aError;

      const statusMap = new Map<string, { email: string; internal_count: number; external_count: number; activities: Set<string> }>();
      (membershipData as any[] || []).forEach(m => {
        if (!m.user) return;
        statusMap.set(m.user.id, {
          email: m.user.university_email || '',
          internal_count: 0,
          external_count: 0,
          activities: new Set()
        });
      });

      (attData as any[] || []).forEach(record => {
        const reg = record.registration;
        if (!reg || !reg.activity) return;
        const mem = statusMap.get(reg.user_id);
        if (mem) {
          const activityId = reg.activity.id;
          if (!mem.activities.has(activityId)) {
            mem.activities.add(activityId);
            const type = reg.activity.location_type || 'internal';
            if (type === 'internal') mem.internal_count++;
            else mem.external_count++;
          }
        }
      });

      let conditions = DEFAULT_CONDITIONS;
      const saved = localStorage.getItem('award_criteria');
      if (saved) {
        try {
          conditions = JSON.parse(saved);
        } catch (e) {
          conditions = DEFAULT_CONDITIONS;
        }
      }

      const emails = Array.from(statusMap.values())
        .filter(m => conditions.some(c => m.internal_count >= c.minInternal && m.external_count >= c.minExternal))
        .map(m => m.email)
        .filter(Boolean)
        .map(email => cleanAndCorrectEmail(email));

      setQualifiedEmails(Array.from(new Set(emails)));
    } catch (err: any) {
      console.error('Error fetching qualified emails:', err);
      toast.error('表彰対象メンバーのメール取得に失敗しました');
    } finally {
      setLoadingQualified(false);
    }
  };

  // Fetch emails for All Members
  useEffect(() => {
    if (includeAllMembers && selectedYear?.id) {
      fetchAllMembersEmails();
    } else {
      setAllMembersEmails([]);
    }
  }, [includeAllMembers, selectedYear?.id]);

  const fetchAllMembersEmails = async () => {
    try {
      setLoadingAllMembers(true);
      const { data, error } = await supabase
        .from('club_memberships')
        .select(`
          user:users(university_email)
        `)
        .eq('academic_year_id', selectedYear!.id)
        .is('deleted_at', null);

      if (error) throw error;

      const emails = (data || [])
        .map((m: any) => m.user?.university_email)
        .filter(Boolean)
        .map(email => cleanAndCorrectEmail(email));

      setAllMembersEmails(Array.from(new Set(emails)));
    } catch (err: any) {
      console.error('Error fetching all members emails:', err);
      toast.error('全部員のメール取得に失敗しました');
    } finally {
      setLoadingAllMembers(false);
    }
  };

  // Mutually exclusive selections
  const handleToggleAllMembers = (val: boolean) => {
    setIncludeAllMembers(val);
    if (val) {
      setIncludeCommittee(false);
      setIncludeQualified(false);
      setSelectedActivity(null);
    }
  };

  const handleToggleCommittee = (val: boolean) => {
    setIncludeCommittee(val);
    if (val) {
      setIncludeAllMembers(false);
    }
  };

  const handleToggleQualified = (val: boolean) => {
    setIncludeQualified(val);
    if (val) {
      setIncludeAllMembers(false);
    }
  };

  const handleSelectActivity = (activity: ActivityItem | null) => {
    setSelectedActivity(activity);
    if (activity) {
      setIncludeAllMembers(false);
    }
  };

  // Extract Manual Emails
  const parsedManualEmails = useMemo(() => {
    return manualEmails
      .split(',')
      .map(email => email.trim())
      .filter(email => {
        // Basic Email validation
        return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      })
      .map(email => cleanAndCorrectEmail(email));
  }, [manualEmails, emailCorrectionMap]);

  // Combine and Deduplicate all Emails
  const allRecipients = useMemo(() => {
    const combined = [
      ...parsedManualEmails,
      ...allMembersEmails,
      ...activityEmails,
      ...committeeEmails,
      ...qualifiedEmails
    ];
    return Array.from(new Set(combined));
  }, [parsedManualEmails, allMembersEmails, activityEmails, committeeEmails, qualifiedEmails]);

  // Copy to clipboard
  const handleCopyEmails = () => {
    if (allRecipients.length === 0) {
      toast.error('コピーするメールアドレスがありません');
      return;
    }
    navigator.clipboard.writeText(allRecipients.join(', '));
    toast.success(`${allRecipients.length}件のメールアドレスをクリップボードにコピーしました！`);
  };

  // Open Gmail Web draft
  const handleOpenGmail = () => {
    if (allRecipients.length === 0) {
      toast.error('宛先メールアドレスが設定されていません');
      return;
    }

    const senderEmail = currentUser?.university_email || currentUser?.email || '';
    const bccEmails = allRecipients.filter(email => email.toLowerCase() !== senderEmail.toLowerCase());
    const bcc = bccEmails.join(',');
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(senderEmail)}&bcc=${encodeURIComponent(bcc)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.open(url, '_blank');
    toast.success('Web版 Gmail を起動します');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 backdrop-blur-md bg-stone-900/60 transition-colors"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-2xl bg-white rounded-2xl overflow-hidden border border-stone-200 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] flex flex-col max-h-[90vh] z-10"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-[#D62976] to-[#4F5BD5] flex items-center justify-center text-white">
                <Mail size={18} />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-stone-900 leading-none">メール作成・一括送信</h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 hover:text-stone-950 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
            
            {/* Recipient Selection (4 Forms) */}
            <div className="space-y-3">
              <h3 className="text-[13px] font-black text-stone-800 uppercase tracking-wider">1. 宛先の選択</h3>
              
              {/* Sent To Visual Box / Tags */}
              <div className="bg-stone-50 border border-stone-300 rounded-xl p-3 min-h-[60px] flex flex-wrap gap-2 items-center">
                {(!includeAllMembers && !includeCommittee && !selectedActivity && !includeQualified && parsedManualEmails.length === 0) && (
                  <span className="text-stone-400 text-sm font-bold pl-1">宛先が選択されていません。下のボタンから追加してください。</span>
                )}
                
                {/* All Members Tag */}
                {includeAllMembers && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-black text-indigo-600 shadow-sm">
                    <span>全部員へ</span>
                    {loadingAllMembers ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <button onClick={() => setIncludeAllMembers(false)} className="hover:text-rose-500"><X size={14} /></button>
                    )}
                  </div>
                )}

                {/* Committee Tag */}
                {includeCommittee && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-black text-[#4F5BD5] shadow-sm">
                    <span>管理者（幹部、会計者、部長、副部長）へ</span>
                    {loadingCommittee ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <button onClick={() => setIncludeCommittee(false)} className="hover:text-rose-500"><X size={14} /></button>
                    )}
                  </div>
                )}

                {/* Activity Tag */}
                {selectedActivity && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-50 border border-pink-100 rounded-xl text-xs font-black text-[#D62976] shadow-sm">
                    <span>{selectedActivity.title}活動を参加するメンバーへ</span>
                    {loadingActivity ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <button onClick={() => setSelectedActivity(null)} className="hover:text-rose-500"><X size={14} /></button>
                    )}
                  </div>
                )}

                {/* Qualified Tag */}
                {includeQualified && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-xs font-black text-emerald-600 shadow-sm">
                    <span>表彰対象メンバーへ</span>
                    {loadingQualified ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <button onClick={() => setIncludeQualified(false)} className="hover:text-rose-500"><X size={14} /></button>
                    )}
                  </div>
                )}

                {/* Manual Tag */}
                {parsedManualEmails.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-xl text-xs font-black text-amber-600 shadow-sm">
                    <span>手動入力: {parsedManualEmails.length}件</span>
                    <button onClick={() => setManualEmails('')} className="hover:text-rose-500"><X size={14} /></button>
                  </div>
                )}
              </div>

              {/* Total Recipients Count */}
              {allRecipients.length > 0 && (
                <div className="text-xs font-black pl-1 text-[#4F5BD5]">
                  {allRecipients.length} 人のメンバーへ送信されます (重複は自動除外)
                </div>
              )}

              {/* Action Buttons to Select Groups */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                
                {/* 1. All Members */}
                <button
                  type="button"
                  onClick={() => handleToggleAllMembers(!includeAllMembers)}
                  className={`h-10 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    includeAllMembers 
                      ? 'bg-indigo-50 border-[#4F5BD5] text-[#4F5BD5]' 
                      : 'bg-white border-stone-300 text-stone-700 hover:border-indigo-400'
                  }`}
                >
                  <Check size={14} className={includeAllMembers ? 'opacity-100' : 'opacity-0'} />
                  <span>全メンバー</span>
                </button>

                {/* 2. Activity Dropdown Selector */}
                <div className="relative" ref={activityDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowActivityDropdown(!showActivityDropdown)}
                    className={`w-full h-10 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                      selectedActivity 
                        ? 'bg-pink-50 border-[#D62976] text-[#D62976]' 
                        : 'bg-white border-stone-300 text-stone-700 hover:border-pink-400'
                    }`}
                  >
                    <span className="truncate">{selectedActivity ? selectedActivity.title : '活動から選ぶ'}</span>
                    <ChevronDown size={14} className={`transition-transform duration-300 shrink-0 ${showActivityDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {showActivityDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        className="absolute left-0 right-0 mt-1.5 bg-white border border-stone-300 rounded-xl shadow-xl z-[210] max-h-56 overflow-y-auto p-1.5"
                      >
                        {loadingActivitiesList ? (
                          <div className="py-3 text-center text-xs font-bold text-stone-500">読み込み中...</div>
                        ) : activities.length === 0 ? (
                          <div className="py-3 text-center text-xs font-bold text-stone-500">活動がありません</div>
                        ) : (
                          activities.map(act => (
                            <button
                              key={act.id}
                              type="button"
                              onClick={() => {
                                handleSelectActivity(act);
                                setShowActivityDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-bold text-stone-800 hover:bg-pink-50 hover:text-[#D62976] rounded-lg transition-all truncate"
                            >
                              {act.title}
                            </button>
                          ))
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 3. Committee */}
                <button
                  type="button"
                  onClick={() => handleToggleCommittee(!includeCommittee)}
                  className={`h-10 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    includeCommittee 
                      ? 'bg-indigo-50 border-[#4F5BD5] text-[#4F5BD5]' 
                      : 'bg-white border-stone-300 text-stone-700 hover:border-indigo-400'
                  }`}
                >
                  <Check size={14} className={includeCommittee ? 'opacity-100' : 'opacity-0'} />
                  <span>管理者</span>
                </button>

                {/* 4. Qualified (Awards) */}
                <button
                  type="button"
                  onClick={() => handleToggleQualified(!includeQualified)}
                  className={`h-10 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    includeQualified 
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-600' 
                      : 'bg-white border-stone-300 text-stone-700 hover:border-emerald-400'
                  }`}
                >
                  <Check size={14} className={includeQualified ? 'opacity-100' : 'opacity-0'} />
                  <span>表彰対象</span>
                </button>

              </div>

              {/* 5. Manual Text Input */}
              <div className="space-y-1">
                <label className="text-[11px] font-black text-stone-700 uppercase tracking-wider pl-1">
                  手動で追加 (カンマ区切り)
                </label>
                <input
                  type="text"
                  placeholder="abc_123456@red.umds.ac.jp"
                  value={manualEmails}
                  onChange={(e) => setManualEmails(e.target.value)}
                  className="w-full h-10 px-3 bg-stone-50 border border-stone-300 focus:border-stone-500 focus:bg-white rounded-xl text-xs font-bold text-stone-900 transition-all outline-none"
                />
              </div>

            </div>

            {/* Email Composer Fields */}
            <div className="space-y-3.5">
              <h3 className="text-[13px] font-black text-stone-800 uppercase tracking-wider">2. メールの作成</h3>
              
              {/* Subject */}
              <div className="space-y-1">
                <label className="text-[11px] font-black text-stone-700 uppercase tracking-wider pl-1">
                  件名
                </label>
                <input
                  type="text"
                  placeholder="ボランティア活動のご案内..."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full h-11 px-4 bg-stone-50 border border-stone-300 focus:border-[#4F5BD5] focus:bg-white rounded-xl text-xs font-bold text-stone-900 transition-all outline-none shadow-sm"
                />
              </div>

              {/* Body */}
              <div className="space-y-1">
                <label className="text-[11px] font-black text-stone-700 uppercase tracking-wider pl-1">
                  本文
                </label>
                <textarea
                  placeholder="メンバーの皆さんへ&#10;&#10;活動にご参加いただきありがとうございました..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 focus:border-[#4F5BD5] focus:bg-white rounded-xl p-4 text-xs font-bold text-stone-900 transition-all outline-none shadow-sm h-40 resize-none custom-scrollbar"
                />
              </div>
            </div>

          </div>

          {/* Footer / Actions */}
          <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex flex-col gap-3 shrink-0">
            <div className="flex flex-wrap items-center justify-between">
              <span className="text-[11px] font-bold text-stone-700">
                ※ Web版のGmailが新しくタブで開きます。コピーしたアドレスはBCC欄等に貼り付けてご利用ください。
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 w-full">
              {/* Copy Button */}
              <button
                onClick={handleCopyEmails}
                disabled={allRecipients.length === 0}
                className="w-full sm:w-auto h-11 px-4 bg-white border border-stone-300 text-stone-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-stone-100 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
              >
                <Copy size={15} />
                <span>アドレスをコピー ({allRecipients.length}件)</span>
              </button>

              {/* Gmail Web Button */}
              <button
                onClick={handleOpenGmail}
                disabled={allRecipients.length === 0}
                className="w-full sm:w-auto h-11 px-5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-rose-100/50 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
              >
                <ExternalLink size={15} className="text-white" />
                <span>Gmail (Web) で開く</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
