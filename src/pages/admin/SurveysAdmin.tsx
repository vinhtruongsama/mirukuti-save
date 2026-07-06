import { useEffect, useMemo, useState } from 'react';
import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Clock3,
  Download,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import XLSX from 'xlsx-js-style';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../../store/useAuthStore';
import { cn } from '../../lib/utils';
import ExcelExportModal, { type ExcelExportFieldOption } from '../../components/ui/ExcelExportModal';
import {
  STATUS_LABELS,
  SURVEY_QUESTION_TYPES,
  SURVEY_YEAR_OPTIONS,
  formatAnswerValue,
  hashSurveyPassword,
  isChoiceQuestion,
} from '../../lib/surveys';
import type { Survey, SurveyQuestion, SurveyResponse } from '../../types/survey';

type SurveyEligibleMember = {
  user_id: string;
  role: string;
  users: {
    id: string;
    full_name: string;
    full_name_kana?: string | null;
    mssv?: string | null;
    university_email?: string | null;
    university_year?: number | null;
  } | null;
};

type SurveyEligibleMemberRow = {
  user_id: string;
  role: string;
  users:
    | {
        id: string;
        full_name: string;
        full_name_kana?: string | null;
        mssv?: string | null;
        university_email?: string | null;
        university_year?: number | null;
      }
    | Array<{
        id: string;
        full_name: string;
        full_name_kana?: string | null;
        mssv?: string | null;
        university_email?: string | null;
        university_year?: number | null;
      }>
    | null;
};

type SurveyDraft = {
  id?: string;
  title: string;
  description: string;
  activity_id: string;
  status: Survey['status'];
  response_mode: Survey['response_mode'];
  target_config: {
    require_activity_registration: boolean;
    roles: string[];
    years: number[];
    password?: string | null;
    password_hash?: string | null;
  };
  password: string;
  questions: Array<{
    id?: string;
    type: SurveyQuestion['type'];
    label: string;
    description: string;
    required: boolean;
    choicesText: string;
    choiceLimitsText: string;
  }>;
};

const emptyQuestion = (): SurveyDraft['questions'][number] => ({
  type: 'multiple_choice',
  label: '',
  description: '',
  required: true,
  choicesText: '\n',
  choiceLimitsText: '\n',
});

const autoResizeTextarea = (element: HTMLTextAreaElement) => {
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
};

const serializeDraft = (value: SurveyDraft) => JSON.stringify(value);

const emptyDraft = (): SurveyDraft => ({
  title: '',
  description: '',
  activity_id: '',
  status: 'draft',
  response_mode: 'single_editable',
  target_config: {
    require_activity_registration: false,
    roles: [],
    years: [],
    password: null,
    password_hash: null,
  },
  password: '',
  questions: [emptyQuestion()],
});

const normalizeSurvey = (survey: Survey, questions: SurveyQuestion[]): SurveyDraft => ({
  id: survey.id,
  title: survey.title,
  description: survey.description || '',
  activity_id: survey.activity_id || '',
  status: survey.status,
  response_mode: survey.response_mode,
  target_config: {
    require_activity_registration: !!survey.target_config?.require_activity_registration,
    roles: survey.target_config?.roles || [],
    years: survey.target_config?.years || [],
    password: survey.target_config?.password || null,
    password_hash: survey.target_config?.password_hash || null,
  },
  password: survey.target_config?.password || '',
  questions: questions
    .sort((a, b) => a.position - b.position)
    .map((q) => {
      const choices = q.options?.choices || [''];
      const limits = q.options?.choice_limits || [];
      return {
      id: q.id,
      type: q.type,
      label: q.label,
      description: q.description || '',
      required: q.required,
      choicesText: choices.join('\n'),
      choiceLimitsText: choices.map((_, i) => (typeof limits[i] === 'number' && Number.isFinite(limits[i] as number) ? String(limits[i]) : '')).join('\n'),
      };
    }),
});

export default function SurveysAdmin() {
  const queryClient = useQueryClient();
  const { selectedYear } = useAppStore();
  const { currentUser } = useAuthStore();
  const [draft, setDraft] = useState<SurveyDraft>(emptyDraft());
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeSurveyId, setActiveSurveyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'builder' | 'responses'>('builder');
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [editorStep, setEditorStep] = useState<'setup' | 'build'>('setup');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Survey['status']>('all');
  const [galleryView, setGalleryView] = useState<'grid' | 'list'>('grid');
  const [mobileResponseView, setMobileResponseView] = useState<'answered' | 'unanswered'>('unanswered');
  const [confirmDeleteQuestionIndex, setConfirmDeleteQuestionIndex] = useState<number | null>(null);
  const [showSurveyPassword, setShowSurveyPassword] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const questionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pendingScrollIndexRef = useRef<number | null>(null);
  const initialDraftSnapshotRef = useRef(serializeDraft(emptyDraft()));

  const { data: activities = [] } = useQuery({
    queryKey: ['survey-admin-activities', selectedYear?.id],
    queryFn: async () => {
      if (!selectedYear) return [];
      const { data, error } = await supabase
        .from('activities')
        .select('id, title, date, location')
        .eq('academic_year_id', selectedYear.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedYear,
  });

  const { data: surveys = [], isLoading } = useQuery({
    queryKey: ['admin-surveys', selectedYear?.id],
    queryFn: async () => {
      if (!selectedYear) return [];
      const { data, error } = await supabase
        .from('surveys')
        .select('*, activities(id, title, date, location)')
        .eq('academic_year_id', selectedYear.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Survey[];
    },
    enabled: !!selectedYear,
  });

  const { data: responseCountBySurveyData = new Map<string, number>() } = useQuery({
    queryKey: ['admin-survey-response-counts', selectedYear?.id, surveys.map((survey) => survey.id).join(',')],
    queryFn: async () => {
      const surveyIds = surveys.map((survey) => survey.id);
      if (surveyIds.length === 0) return new Map<string, number>();
      const { data, error } = await supabase
        .from('survey_responses')
        .select('survey_id')
        .in('survey_id', surveyIds);
      if (error) throw error;

      const counts = new Map<string, number>();
      (data || []).forEach((row: { survey_id: string }) => {
        counts.set(row.survey_id, (counts.get(row.survey_id) || 0) + 1);
      });
      return counts;
    },
    enabled: surveys.length > 0,
  });

  const { data: activeQuestions = [] } = useQuery({
    queryKey: ['admin-survey-questions', activeSurveyId],
    queryFn: async () => {
      if (!activeSurveyId) return [];
      const { data, error } = await supabase
        .from('survey_questions')
        .select('*')
        .eq('survey_id', activeSurveyId)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data || []) as SurveyQuestion[];
    },
    enabled: !!activeSurveyId,
  });

  const { data: responses = [], isLoading: responsesLoading } = useQuery({
    queryKey: ['admin-survey-responses', activeSurveyId],
    queryFn: async () => {
      if (!activeSurveyId) return [];
      const { data, error } = await supabase
        .from('survey_responses')
        .select('*, users(full_name, full_name_kana, mssv, university_email), survey_answers(*)')
        .eq('survey_id', activeSurveyId)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return (data || []) as SurveyResponse[];
    },
    enabled: !!activeSurveyId && activeTab === 'responses',
  });

  const { data: eligibleMembers = [] as SurveyEligibleMember[], isLoading: eligibleMembersLoading } = useQuery({
    queryKey: ['admin-survey-eligible-members', activeSurveyId, surveys.map((survey) => `${survey.id}:${survey.updated_at}`).join(',')],
    queryFn: async () => {
      if (!activeSurveyId) return [];

      const survey = surveys.find((item) => item.id === activeSurveyId);
      if (!survey) return [];

      const targetRoles = survey.target_config?.roles || [];
      const targetYears = survey.target_config?.years || [];

      let membershipQuery = supabase
        .from('club_memberships')
        .select('user_id, role, is_active, users!inner(id, full_name, full_name_kana, mssv, university_email, university_year)')
        .eq('academic_year_id', survey.academic_year_id)
        .eq('is_active', true)
        .is('deleted_at', null);

      if (targetRoles.length > 0) {
        membershipQuery = membershipQuery.in('role', targetRoles);
      }

      const { data: membershipRows, error: membershipError } = await membershipQuery;
      if (membershipError) throw membershipError;

      let eligible = ((membershipRows || []) as SurveyEligibleMemberRow[]).map((row) => ({
        user_id: row.user_id,
        role: row.role,
        users: Array.isArray(row.users) ? row.users[0] || null : row.users || null,
      }));

      if (targetYears.length > 0) {
        eligible = eligible.filter((member) => {
          const year = member.users?.university_year;
          return year !== undefined && year !== null && targetYears.includes(year);
        });
      }

      if (survey.target_config?.require_activity_registration && survey.activity_id) {
        const { data: registrationRows, error: registrationError } = await supabase
          .from('registrations')
          .select('user_id')
          .eq('activity_id', survey.activity_id);

        if (registrationError) throw registrationError;

        const registeredUserIds = new Set((registrationRows || []).map((row: { user_id: string }) => row.user_id));
        eligible = eligible.filter((member) => registeredUserIds.has(member.user_id));
      }

      return eligible.sort((a, b) => {
        const aName = a.users?.full_name_kana || a.users?.full_name || '';
        const bName = b.users?.full_name_kana || b.users?.full_name || '';
        return aName.localeCompare(bName, 'ja');
      });
    },
    enabled: !!activeSurveyId && activeTab === 'responses',
  });

  const activeSurvey = surveys.find((s) => s.id === activeSurveyId) || null;

  const surveyExportFields = useMemo<ExcelExportFieldOption[]>(() => {
    const fields: ExcelExportFieldOption[] = [
      { key: 'no', label: 'No', description: 'So thu tu cau tra loi.' },
      { key: 'full_name', label: '氏名', description: 'Ho va ten nguoi tra loi.' },
      { key: 'full_name_kana', label: 'フリガナ', description: 'Ten kana.' },
      { key: 'mssv', label: '学籍番号', description: 'Ma sinh vien.' },
      { key: 'university_email', label: '大学メール', description: 'Email truong.' },
      { key: 'submitted_at', label: '送信日時', description: 'Thoi gian gui phan hoi.' },
    ];

    activeQuestions.forEach((question, index) => {
      fields.push({
        key: `question_${question.id}`,
        label: question.label || `Question ${index + 1}`,
        description: 'Cau tra loi cua cau hoi nay.',
      });
    });

    return fields;
  }, [activeQuestions]);

  const surveyDefaultExportKeys = useMemo(
    () => surveyExportFields.map((field) => field.key),
    [surveyExportFields]
  );

  const openEditor = async (survey?: Survey) => {
    if (!survey) {
      const nextDraft = emptyDraft();
      setDraft(nextDraft);
      initialDraftSnapshotRef.current = serializeDraft(nextDraft);
      setShowSurveyPassword(false);
      setActiveQuestionIndex(0);
      setEditorStep('setup');
      setEditorOpen(true);
      setActiveTab('builder');
      return;
    }

    const { data, error } = await supabase
      .from('survey_questions')
      .select('*')
      .eq('survey_id', survey.id)
      .order('position', { ascending: true });

    if (error) {
      toast.error(error.message);
      return;
    }

    const nextDraft = normalizeSurvey(survey, (data || []) as SurveyQuestion[]);
    setDraft(nextDraft);
    initialDraftSnapshotRef.current = serializeDraft(nextDraft);
    setShowSurveyPassword(false);
    setActiveQuestionIndex(0);
    setEditorStep('setup');
    setActiveSurveyId(survey.id);
    setEditorOpen(true);
    setActiveTab('builder');
  };

  const closeEditorSafely = () => {
    const hasUnsavedChanges = serializeDraft(draft) !== initialDraftSnapshotRef.current;
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('保存していない変更があります。閉じると入力内容は失われます。閉じてもよろしいですか？');
      if (!confirmed) return;
    }
    setEditorOpen(false);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedYear) throw new Error('Academic year is missing');
      const cleanQuestions = draft.questions.filter((q) => q.label.trim());
      const invalidChoiceQuestion = cleanQuestions.find((q) => isChoiceQuestion(q.type) && q.choicesText.split('\n').map((c) => c.trim()).filter(Boolean).length < 2);
      const invalidChoiceLimit = cleanQuestions.find((q) => {
        if (!isChoiceQuestion(q.type)) return false;
        const choices = q.choicesText.split('\n').map((c) => c.trim()).filter(Boolean);
        const limits = getChoiceLimits(q, choices);
        return limits.some((limit) => limit !== null && limit <= 0);
      });
      if (!draft.title.trim()) throw new Error('タイトルを入力してください');
      if (cleanQuestions.length === 0) throw new Error('質問を1つ以上作成してください');
      if (invalidChoiceQuestion) throw new Error('選択式の質問には選択肢を2つ以上入力してください');
      if (invalidChoiceLimit) throw new Error('選択肢の上限は1以上の数値で入力してください（空欄は無制限）');

      const cleanPassword = draft.password.trim();
      const passwordHash = cleanPassword ? await hashSurveyPassword(cleanPassword) : null;

      const surveyPayload = {
        academic_year_id: selectedYear.id,
        activity_id: draft.activity_id || null,
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        status: draft.status,
        response_mode: draft.response_mode,
        target_config: {
          require_activity_registration: draft.target_config.require_activity_registration,
          roles: draft.target_config.roles,
          years: draft.target_config.years,
          password: cleanPassword || null,
          password_hash: passwordHash,
        },
        created_by: currentUser?.id || null,
        updated_at: new Date().toISOString(),
      };

      let surveyId = draft.id;
      if (surveyId) {
        const { error } = await supabase.from('surveys').update(surveyPayload).eq('id', surveyId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('surveys').insert(surveyPayload).select('id').single();
        if (error) throw error;
        surveyId = data.id;
      }

      const existingIds = cleanQuestions.map((q) => q.id).filter(Boolean);
      if (surveyId && draft.id) {
        const staleIds = activeQuestions.map((q) => q.id).filter((id) => !existingIds.includes(id));
        if (staleIds.length > 0) {
          const { error } = await supabase.from('survey_questions').delete().in('id', staleIds);
          if (error) throw error;
        }
      }

      for (const [position, q] of cleanQuestions.entries()) {
        const questionPayload = {
          survey_id: surveyId,
          position,
          type: q.type,
          label: q.label.trim(),
          description: q.description.trim() || null,
          required: q.required,
          options: isChoiceQuestion(q.type)
            ? (() => {
              const choices = q.choicesText.split('\n').map((c) => c.trim()).filter(Boolean);
              const choice_limits = getChoiceLimits(q, choices);
              return { choices, choice_limits };
            })()
            : {},
        };

        if (q.id) {
          const { error } = await supabase.from('survey_questions').update(questionPayload).eq('id', q.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('survey_questions').insert(questionPayload);
          if (error) throw error;
        }
      }

      return { surveyId, cleanPassword, passwordHash };
    },
    onSuccess: ({ surveyId, cleanPassword, passwordHash }) => {
      toast.success('アンケートを保存しました');
      initialDraftSnapshotRef.current = serializeDraft({
        ...draft,
        password: cleanPassword,
        target_config: {
          ...draft.target_config,
          password: cleanPassword || null,
          password_hash: passwordHash,
        },
      });
      setDraft((prev) => ({
        ...prev,
        password: cleanPassword,
        target_config: {
          ...prev.target_config,
          password: cleanPassword || null,
          password_hash: passwordHash,
        },
      }));
      setEditorOpen(false);
      setActiveSurveyId(surveyId || null);
      queryClient.invalidateQueries({ queryKey: ['admin-surveys'] });
      queryClient.invalidateQueries({ queryKey: ['admin-survey-questions'] });
      queryClient.invalidateQueries({ queryKey: ['activity-surveys'] });
      queryClient.invalidateQueries({ queryKey: ['activity-detail-surveys'] });
      queryClient.invalidateQueries({ queryKey: ['surveys-page-open'] });
      queryClient.invalidateQueries({ queryKey: ['surveys-page-responses'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (surveyId: string) => {
      const { error } = await supabase.from('surveys').delete().eq('id', surveyId);
      if (error) throw error;
    },
    onSuccess: (_, deletedSurveyId) => {
      toast.success('アンケートを削除しました');
      const nextSurvey = surveys.find((item) => item.id !== deletedSurveyId) || null;
      setActiveSurveyId(nextSurvey?.id || null);
      setActiveTab('builder');
      queryClient.invalidateQueries({ queryKey: ['admin-surveys'] });
      queryClient.invalidateQueries({ queryKey: ['admin-survey-questions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-survey-responses'] });
      queryClient.invalidateQueries({ queryKey: ['activity-surveys'] });
      queryClient.invalidateQueries({ queryKey: ['activity-detail-surveys'] });
      queryClient.invalidateQueries({ queryKey: ['surveys-page-open'] });
      queryClient.invalidateQueries({ queryKey: ['surveys-page-responses'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDeleteSurvey = (survey: Survey) => {
    if (deleteMutation.isPending) return;
    const confirmed = window.confirm(`「${survey.title}」を削除しますか？\nこの操作は元に戻せません。`);
    if (!confirmed) return;
    deleteMutation.mutate(survey.id);
  };

  const exportConfiguredResponses = (selectedKeys: string[]) => {
    if (!activeSurvey) return;

    const selectedFields = surveyExportFields.filter((field) => selectedKeys.includes(field.key));
    if (selectedFields.length === 0) {
      toast.error('少なくとも1つの項目を選択してください');
      return;
    }

    const answerByResponse = new Map<string, Record<string, unknown>>();
    responses.forEach((response) => {
      const values: Record<string, unknown> = {};
      response.survey_answers?.forEach((answer) => {
        values[`question_${answer.question_id}`] = answer.value;
      });
      answerByResponse.set(response.id, values);
    });

    const rows = responses.map((response, idx) => {
      const answers = answerByResponse.get(response.id) || {};
      const valueMap: Record<string, string | number> = {
        no: idx + 1,
        full_name: response.users?.full_name || '',
        full_name_kana: response.users?.full_name_kana || '',
        mssv: response.users?.mssv || '',
        university_email: response.users?.university_email || '',
        submitted_at: format(new Date(response.submitted_at), 'yyyy-MM-dd HH:mm'),
      };

      activeQuestions.forEach((question) => {
        valueMap[`question_${question.id}`] = formatAnswerValue(answers[`question_${question.id}`]);
      });

      return selectedFields.map((field) => valueMap[field.key] ?? '');
    });

    const ws = XLSX.utils.aoa_to_sheet([
      [`アンケート：${activeSurvey.title}`],
      [`エクスポート日時：${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`],
      [`項目数：${selectedFields.length}`],
      selectedFields.map((field) => field.label),
      ...rows,
    ]);
    ws['!cols'] = selectedFields.map((field) => ({
      wch: field.key.startsWith('question_') ? 28 : 24
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Survey Responses');
    const safeTitle = activeSurvey.title.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 50);
    XLSX.writeFile(wb, `${safeTitle}_responses_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    toast.success('Excelをエクスポートしました');
    setIsExportModalOpen(false);
  };

  const exportResponses = () => {
    if (!activeSurvey) return;
    const answerByResponse = new Map<string, Record<string, unknown>>();
    responses.forEach((response) => {
      const values: Record<string, unknown> = {};
      response.survey_answers?.forEach((answer) => {
        values[answer.question_id] = answer.value;
      });
      answerByResponse.set(response.id, values);
    });

    const headers = ['No', '氏名', 'フリガナ', '学籍番号', '大学メール', '送信日時', ...activeQuestions.map((q) => q.label)];
    const rows = responses.map((response, idx) => {
      const answers = answerByResponse.get(response.id) || {};
      return [
        idx + 1,
        response.users?.full_name || '',
        response.users?.full_name_kana || '',
        response.users?.mssv || '',
        response.users?.university_email || '',
        format(new Date(response.submitted_at), 'yyyy-MM-dd HH:mm'),
        ...activeQuestions.map((q) => formatAnswerValue(answers[q.id])),
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([
      [`アンケート：${activeSurvey.title}`],
      [`エクスポート日時：${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`],
      [''],
      headers,
      ...rows,
    ]);
    ws['!cols'] = headers.map(() => ({ wch: 24 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Survey Responses');
    const safeTitle = activeSurvey.title.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 50);
    XLSX.writeFile(wb, `${safeTitle}_responses_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    toast.success('Excelをエクスポートしました');
  };
  void exportResponses;

  const updateQuestion = (idx: number, patch: Partial<SurveyDraft['questions'][number]>) => {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
    }));
  };

  const responseCountBySurvey = responseCountBySurveyData;

  const filteredSurveys = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return surveys.filter((survey) => {
      const matchesStatus = statusFilter === 'all' || survey.status === statusFilter;
      const haystack = [survey.title, survey.description, survey.activities?.title].filter(Boolean).join(' ').toLowerCase();
      const matchesKeyword = !keyword || haystack.includes(keyword);
      return matchesStatus && matchesKeyword;
    });
  }, [searchTerm, statusFilter, surveys]);

  const activeSurveyResponseCount = activeSurvey ? responseCountBySurvey.get(activeSurvey.id) || responses.length : 0;
  const respondedUserIds = useMemo(() => new Set(responses.map((response) => response.user_id)), [responses]);
  const unansweredMembers = useMemo(
    () => eligibleMembers.filter((member) => !respondedUserIds.has(member.user_id)),
    [eligibleMembers, respondedUserIds]
  );

  const getQuestionTypeLabel = (type: SurveyQuestion['type']) => {
    return SURVEY_QUESTION_TYPES.find((item) => item.value === type)?.label || type;
  };

  const getChoiceLimits = (question: SurveyDraft['questions'][number], choices: string[]) => {
    const source = question.choiceLimitsText.split('\n');
    return choices.map((_, idx) => {
      const raw = (source[idx] || '').trim();
      if (!raw) return null;
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) return null;
      return Math.floor(value);
    });
  };

  const setChoiceAt = (questionIndex: number, choiceIndex: number, value: string) => {
    const source = draft.questions[questionIndex].choicesText.split('\n');
    source[choiceIndex] = value.replace(/\r?\n+/g, ' ').replace(/\s{2,}/g, ' ').trimStart();
    updateQuestion(questionIndex, { choicesText: source.join('\n') });
  };

  const setChoiceLimitAt = (questionIndex: number, choiceIndex: number, value: string) => {
    const source = draft.questions[questionIndex].choiceLimitsText.split('\n');
    source[choiceIndex] = value;
    updateQuestion(questionIndex, { choiceLimitsText: source.join('\n') });
  };

  const addChoice = (questionIndex: number) => {
    const choiceSource = draft.questions[questionIndex].choicesText.split('\n');
    const limitSource = draft.questions[questionIndex].choiceLimitsText.split('\n');
    choiceSource.push('');
    limitSource.push('');
    updateQuestion(questionIndex, { choicesText: choiceSource.join('\n'), choiceLimitsText: limitSource.join('\n') });
  };

  const removeChoice = (questionIndex: number, choiceIndex: number) => {
    const choiceSource = draft.questions[questionIndex].choicesText.split('\n');
    const limitSource = draft.questions[questionIndex].choiceLimitsText.split('\n');
    updateQuestion(questionIndex, {
      choicesText: choiceSource.filter((_, idx) => idx !== choiceIndex).join('\n'),
      choiceLimitsText: limitSource.filter((_, idx) => idx !== choiceIndex).join('\n'),
    });
  };

  const setActivityTarget = (activityId: string) => {
    setDraft((prev) => ({
      ...prev,
      activity_id: activityId,
      target_config: {
        ...prev.target_config,
        require_activity_registration: activityId ? prev.target_config.require_activity_registration : false,
      },
    }));
  };

  const setAudienceMode = (mode: 'all' | 'activity') => {
    if (mode === 'all') {
      setDraft((prev) => ({
        ...prev,
        activity_id: '',
        target_config: {
          ...prev.target_config,
          require_activity_registration: false,
          roles: [],
        },
      }));
      return;
    }

    setDraft((prev) => ({
      ...prev,
      activity_id: prev.activity_id || activities[0]?.id || '',
      target_config: {
        ...prev.target_config,
        require_activity_registration: true,
        roles: [],
      },
    }));
  };

  const setYearFilter = (value: 'all' | number) => {
    setDraft((prev) => ({
      ...prev,
      target_config: {
        ...prev.target_config,
        years: value === 'all' ? [] : [value],
        roles: [],
      },
    }));
  };

  const goToEditorStep = (step: 'setup' | 'build') => {
    setEditorStep(step);
  };

  const addQuestionAt = (idx?: number) => {
    setDraft((prev) => {
      const questions = [...prev.questions];
      const insertAt = typeof idx === 'number' ? Math.min(idx + 1, questions.length) : questions.length;
      questions.splice(insertAt, 0, emptyQuestion());
      pendingScrollIndexRef.current = insertAt;
      setActiveQuestionIndex(insertAt);
      return { ...prev, questions };
    });
  };

  const removeQuestionAt = (idx: number) => {
    setDraft((prev) => {
      if (prev.questions.length === 1) return prev;
      const questions = prev.questions.filter((_, i) => i !== idx);
      setActiveQuestionIndex(Math.max(0, Math.min(idx, questions.length - 1)));
      return { ...prev, questions };
    });
    setConfirmDeleteQuestionIndex(null);
  };

  const requestRemoveQuestionAt = (idx: number) => {
    if (confirmDeleteQuestionIndex === idx) {
      removeQuestionAt(idx);
      return;
    }
    setConfirmDeleteQuestionIndex(idx);
  };

  const moveQuestion = (idx: number, direction: -1 | 1) => {
    setDraft((prev) => {
      const target = idx + direction;
      if (target < 0 || target >= prev.questions.length) return prev;
      const questions = [...prev.questions];
      const [current] = questions.splice(idx, 1);
      questions.splice(target, 0, current);
      setActiveQuestionIndex(target);
      return { ...prev, questions };
    });
  };

  const audienceSummary = useMemo(() => {
    const parts: string[] = [];
    const activity = activities.find((item: any) => item.id === draft.activity_id);
    parts.push(activity ? `活動ごと: ${activity.title}` : '対象者: 全て');
    if (draft.target_config.years.length) {
      const label = SURVEY_YEAR_OPTIONS.find((year) => year.value === draft.target_config.years[0])?.label || `${draft.target_config.years[0]}年生`;
      parts.push(`学年: ${label}`);
    } else {
      parts.push('学年: 全て');
    }
    parts.push(`パスワード: ${draft.password.trim() || draft.target_config.password_hash ? '必要' : 'なし'}`);
    return parts.join(' / ');
  }, [activities, draft.activity_id, draft.password, draft.target_config.password_hash, draft.target_config.years]);

  useEffect(() => {
    if (!editorOpen) return;
    if (activeQuestionIndex <= draft.questions.length - 1) return;
    setActiveQuestionIndex(Math.max(0, draft.questions.length - 1));
  }, [activeQuestionIndex, draft.questions.length, editorOpen]);

  useEffect(() => {
    if (confirmDeleteQuestionIndex === null) return;
    const timer = window.setTimeout(() => setConfirmDeleteQuestionIndex(null), 2500);
    return () => window.clearTimeout(timer);
  }, [confirmDeleteQuestionIndex]);

  useEffect(() => {
    if (!editorOpen || editorStep !== 'build') return;
    const targetIndex = pendingScrollIndexRef.current;
    if (targetIndex === null) return;

    const timer = window.setTimeout(() => {
      const target = questionRefs.current[targetIndex];
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pendingScrollIndexRef.current = null;
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [draft.questions.length, editorOpen, editorStep]);

  useEffect(() => {
    if (!editorOpen || editorStep !== 'build') return;
    document
      .querySelectorAll<HTMLTextAreaElement>('textarea[data-autosize="true"]')
      .forEach((element) => autoResizeTextarea(element));
  }, [draft.questions, editorOpen, editorStep]);

  useEffect(() => {
    if (activeTab === 'responses') {
      setMobileResponseView(responses.length > 0 ? 'answered' : 'unanswered');
    }
  }, [activeTab, activeSurveyId, responses.length]);

  const getSurveyCoverClass = (survey: Survey, index: number) => {
    const variants = [
      'bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.35),_transparent_35%),linear-gradient(135deg,_#ff8a00,_#ff5a1f)]',
      'bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.4),_transparent_28%),linear-gradient(135deg,_#fff4e8,_#ffd6b8)]',
      'bg-[linear-gradient(135deg,_#0f8b8d,_#127681)]',
      'bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.45),_transparent_26%),linear-gradient(135deg,_#dff6f2,_#b4dfe3)]',
    ];
    const seed = (survey.title.length + index) % variants.length;
    return variants[seed];
  };

  const statusFilters: Array<{ key: 'all' | Survey['status']; label: string }> = [
    { key: 'all', label: 'すべて' },
    { key: 'draft', label: '下書き' },
    { key: 'open', label: '公開中' },
    { key: 'closed', label: '終了' },
  ];

  const getStatusBadgeClass = (status: Survey['status']) => {
    if (status === 'open') return 'bg-emerald-50/95 text-emerald-700 border border-emerald-100';
    if (status === 'closed') return 'bg-rose-50/95 text-rose-600 border border-rose-100';
    return 'bg-amber-50/95 text-amber-700 border border-amber-100';
  };

  const getStatusTextClass = (status: Survey['status']) => {
    if (status === 'open') return 'text-emerald-700';
    if (status === 'closed') return 'text-rose-600';
    return 'text-amber-700';
  };

  const getStatusSelectClass = (status: Survey['status']) => {
    if (status === 'open') return 'border-emerald-200 bg-emerald-50/70 text-emerald-800 focus:border-emerald-500';
    if (status === 'closed') return 'border-rose-200 bg-rose-50/70 text-rose-700 focus:border-rose-500';
    return 'border-amber-200 bg-amber-50/70 text-amber-800 focus:border-amber-500';
  };

  return (
    <div className="min-h-full space-y-6 md:space-y-8 pb-10 md:pb-16">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 md:gap-6">
        <div className="flex items-center gap-4">
          <div className="w-1.5 h-12 rounded-full bg-gradient-to-b from-[#4F5BD5] to-[#D62976]" />
          <div>
            <h1 className="text-[30px] sm:text-[34px] lg:text-[48px] font-black text-stone-900 tracking-tighter leading-none">アンケート</h1>
            <p className="text-[12px] font-black uppercase tracking-[0.3em] text-stone-400 mt-2">フォーム管理</p>
          </div>
        </div>
        <button
          onClick={() => openEditor()}
          className="h-12 sm:h-14 px-6 sm:px-8 bg-[#4F5BD5] hover:bg-[#434fc6] text-white rounded-2xl font-black text-[13px] tracking-widest shadow-lg shadow-indigo-200/70 flex items-center justify-center gap-3 active:scale-95 transition-all w-full sm:w-auto"
        >
          <Plus className="w-5 h-5" />
          新規作成
        </button>
      </header>

      <section className="rounded-[2rem] border border-stone-200 bg-white shadow-lg shadow-stone-200/30 overflow-hidden">
        <div className="border-b border-stone-200 px-4 py-3 md:px-6 md:py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-1 overflow-x-auto">
              {statusFilters.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setStatusFilter(filter.key)}
                  className={cn(
                    "h-10 px-4 rounded-t-xl border-b-2 font-black text-[13px] whitespace-nowrap transition-colors",
                    statusFilter === filter.key
                      ? "border-[#0f8b8d] text-stone-900"
                      : "border-transparent text-stone-500 hover:text-stone-800"
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 lg:w-[280px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="キーワードで絞り込み"
                  className="h-11 w-full rounded-xl border border-stone-200 bg-white pl-10 pr-4 text-[14px] font-medium text-stone-800 outline-none transition focus:border-[#0f8b8d]"
                />
              </div>
              <div className="hidden sm:flex items-center gap-1 rounded-xl border border-stone-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setGalleryView('list')}
                  className={cn("h-9 w-9 rounded-lg flex items-center justify-center", galleryView === 'list' ? "bg-stone-100 text-stone-900" : "text-stone-400")}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setGalleryView('grid')}
                  className={cn("h-9 w-9 rounded-lg flex items-center justify-center", galleryView === 'grid' ? "bg-[#e7f6f2] text-[#0f8b8d]" : "text-stone-400")}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-6">
            {isLoading ? (
              <div className="py-24 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-[#0f8b8d]" /></div>
            ) : filteredSurveys.length === 0 ? (
              <div className="rounded-[1.75rem] border border-dashed border-stone-200 bg-stone-50/60 py-20 text-center">
                <p className="text-stone-300 font-black tracking-widest text-[12px]">まだアンケートがありません</p>
              </div>
            ) : (
              <div className={cn(
                "grid gap-4",
                galleryView === 'grid'
                  ? "grid-cols-2 lg:grid-cols-5"
                  : "grid-cols-1"
              )}>
                {filteredSurveys.map((survey, idx) => (
                  <div
                    key={survey.id}
                    className={cn(
                      "group overflow-hidden rounded-[1.5rem] border bg-white text-left shadow-sm transition-all",
                      galleryView === 'list' ? "sm:grid sm:grid-cols-[220px_1fr]" : "",
                      "border-stone-200 hover:-translate-y-0.5 hover:shadow-md"
                    )}
                  >
                    <div className={cn("relative overflow-hidden", getSurveyCoverClass(survey, idx), galleryView === 'list' ? "min-h-[130px]" : "h-[110px] sm:h-[120px] lg:h-[130px]")}>
                      <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.45)_1px,transparent_1px)] [background-size:18px_18px]" />
                      <div className="absolute left-4 top-4">
                        <span className={cn(
                          "inline-flex items-center justify-center rounded-full px-4 h-9 text-[14px] font-black leading-none",
                          getStatusBadgeClass(survey.status)
                        )}>
                          {STATUS_LABELS[survey.status]}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 sm:p-4 md:p-5">
                      <p
                        className="overflow-hidden text-[14px] sm:text-[16px] font-black text-stone-900"
                        style={{
                          lineHeight: '1.25em',
                          height: '2.5em',
                          minHeight: '2.5em',
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {survey.title}
                      </p>
                      <p className={cn("mt-2 sm:mt-3 text-[12px] sm:text-[13px] font-black", getStatusTextClass(survey.status))}>
                        {survey.status === 'draft' ? '下書きフォーム' : survey.status === 'open' ? '公開フォーム' : '終了フォーム'}
                      </p>
                      {survey.activities?.title && (
                        <div className="mt-1 flex items-center gap-2 text-[11px] sm:text-[12px] font-medium text-stone-500">
                          <Clock3 className="w-3.5 h-3.5" />
                          <span>{survey.activities.title}</span>
                        </div>
                      )}
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                        <div className="grid w-full grid-cols-[1.6fr_1fr] gap-1.5 sm:flex sm:items-center sm:justify-between">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEditor(survey); }}
                            className="h-9 w-full rounded-xl bg-gradient-to-r from-[#D62976] to-[#6C5CE7] px-3 sm:min-w-[88px] sm:px-4 text-[13px] sm:text-[15px] font-black text-white shadow-[0_10px_24px_-12px_rgba(108,92,231,0.7)]"
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            onClick={() => { setActiveSurveyId(survey.id); setActiveTab('responses'); }}
                            className="h-9 w-full rounded-xl bg-[#e7f6f2] px-1.5 sm:min-w-[76px] sm:px-3 text-[10px] sm:text-[12px] font-black text-[#0f8b8d] whitespace-nowrap"
                          >
                            {`回答 (${responseCountBySurvey.get(survey.id) || 0})`}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </section>

      <AnimatePresence>
        {activeSurvey && activeTab === 'responses' && (
          <div className="fixed inset-0 z-[190] flex items-center justify-center p-3 md:p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="relative w-full max-w-[860px] max-h-[92vh] overflow-y-auto rounded-[1.75rem] md:rounded-2xl border border-stone-200 bg-white p-3 md:p-6 shadow-2xl"
            >
              <div className="sticky top-0 z-10 -mx-3 md:-mx-6 -mt-3 md:-mt-6 px-3 md:px-6 pt-3 md:pt-6 pb-3 md:pb-4 bg-white/95 backdrop-blur-sm border-b border-stone-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                  <p className="text-[11px] font-black tracking-[0.24em] text-stone-400">{STATUS_LABELS[activeSurvey.status]}</p>
                    <h2 className="mt-1 text-[32px] md:text-2xl font-black text-stone-900 leading-none truncate">{activeSurvey.title}</h2>
                    <p className="mt-2 text-sm font-bold text-stone-500">{`回答 ${activeSurveyResponseCount} / 未回答 ${unansweredMembers.length}`}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('builder')}
                    className="w-11 h-11 rounded-2xl bg-stone-100 text-stone-500 flex items-center justify-center shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 sm:flex gap-2">
                  <button
                    onClick={() => setIsExportModalOpen(true)}
                    disabled={responses.length === 0}
                    className="h-10 rounded-xl bg-gradient-to-r from-[#0f8b8d] to-[#4F5BD5] px-3 text-white font-black text-[12px] flex items-center justify-center gap-2 shadow-[0_10px_24px_-12px_rgba(79,91,213,0.55)] disabled:opacity-40"
                  >
                    <Download className="w-4 h-4" /> エクスポート
                  </button>
                  <button
                    onClick={() => openEditor(activeSurvey)}
                    className="h-10 rounded-xl bg-gradient-to-r from-[#D62976] to-[#6C5CE7] px-3 text-white font-black text-[15px] flex items-center justify-center gap-2 shadow-[0_10px_24px_-12px_rgba(108,92,231,0.7)]"
                  >
                    <Settings2 className="w-4 h-4" /> 編集
                  </button>
                  <button
                    onClick={() => handleDeleteSurvey(activeSurvey)}
                    disabled={deleteMutation.isPending}
                    className="h-10 rounded-xl bg-rose-50 px-3 text-rose-600 font-black text-[12px] flex items-center justify-center gap-2 disabled:opacity-40 col-span-2 sm:col-span-1"
                  >
                    {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} 削除
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 md:hidden">
                  <button
                    type="button"
                    onClick={() => setMobileResponseView('answered')}
                    className={cn(
                      "h-10 rounded-xl font-black text-[12px] transition-colors",
                      mobileResponseView === 'answered' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-stone-50 text-stone-500 border border-stone-200"
                    )}
                  >
                    {`回答済み ${responses.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileResponseView('unanswered')}
                    className={cn(
                      "h-10 rounded-xl font-black text-[12px] transition-colors",
                      mobileResponseView === 'unanswered' ? "bg-rose-50 text-rose-600 border border-rose-100" : "bg-stone-50 text-stone-500 border border-stone-200"
                    )}
                  >
                    {`未回答 ${unansweredMembers.length}`}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:gap-4 lg:grid-cols-2">
                <div className={cn(
                  "rounded-[1.5rem] border border-stone-200 bg-stone-50/50 p-3 md:p-4",
                  mobileResponseView !== 'answered' && "hidden md:block"
                )}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-black text-stone-900 tracking-[0.18em] uppercase">回答済み</h3>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">{responses.length}名</span>
                  </div>
                  {responsesLoading ? (
                    <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#0f8b8d]" /></div>
                  ) : responses.length === 0 ? (
                    <div className="py-12 text-center text-stone-300 font-black tracking-widest text-[12px]">回答はまだありません</div>
                  ) : (
                    <div className="space-y-2.5">
                      {responses.map((response, idx) => (
                        <div key={response.id} className="rounded-2xl border border-stone-100 bg-white px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-black text-[14px] md:text-[15px] text-stone-900 leading-snug break-words">
                                {idx + 1}. {response.users?.full_name || '不明'}
                              </p>
                              <p className="mt-1 text-[12px] font-medium text-stone-400">{response.users?.mssv || '学籍番号なし'}</p>
                            </div>
                            <span className="shrink-0 text-[11px] font-bold text-stone-400 text-right">
                              {format(new Date(response.submitted_at), 'MM/dd HH:mm')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className={cn(
                  "rounded-[1.5rem] border border-stone-200 bg-stone-50/50 p-3 md:p-4",
                  mobileResponseView !== 'unanswered' && "hidden md:block"
                )}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-black text-stone-900 tracking-[0.18em] uppercase">未回答</h3>
                    <span className="rounded-full bg-rose-50 px-3 py-1 text-[11px] font-black text-rose-600">{unansweredMembers.length}名</span>
                  </div>
                  {eligibleMembersLoading ? (
                    <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#0f8b8d]" /></div>
                  ) : unansweredMembers.length === 0 ? (
                    <div className="py-12 text-center text-stone-300 font-black tracking-widest text-[12px]">未回答者はいません</div>
                  ) : (
                    <div className="space-y-2.5">
                      {unansweredMembers.map((member, idx) => (
                        <div key={member.user_id} className="rounded-2xl border border-stone-100 bg-white px-3 py-3">
                          <p className="font-black text-[14px] md:text-[15px] text-stone-900 leading-snug break-words">
                            {idx + 1}. {member.users?.full_name || '不明'}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-stone-400">
                            <span>{member.users?.mssv || '学籍番号なし'}</span>
                            <span className="truncate max-w-full">{member.users?.university_email || '大学メールなし'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {editorOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 md:p-2">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="relative bg-[#ede7f6] w-full max-w-[1100px] max-h-[98vh] md:max-h-[95vh] overflow-y-auto rounded-none md:rounded-2xl shadow-2xl p-3 md:p-6 custom-scrollbar border border-[#d6d1e9]"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-black tracking-[0.24em] text-rose-500">
                    {editorStep === 'setup' ? 'STEP 1' : 'STEP 2'}
                  </span>
                </div>
                <button onClick={closeEditorSafely} className="w-10 h-10 rounded-xl bg-white text-stone-500 border border-stone-200 flex items-center justify-center">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {editorStep === 'setup' ? (
                  <div className="space-y-5">
                    <div className="px-2 py-1 md:py-2">
                      <h3 className="text-center text-[24px] md:text-[30px] font-medium tracking-tight text-[#2563eb]">フォーム設定</h3>
                    </div>

                    <div className="rounded-[1.5rem] border border-stone-200 bg-white p-4 md:p-5 shadow-sm">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-x-6 lg:gap-y-5">
                      <section>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f8b8d] text-[11px] font-black text-white">1</span>
                          <h4 className="text-[16px] font-black text-stone-800">ステータス</h4>
                        </div>
                        <select
                          value={draft.status}
                          onChange={(e) => setDraft({ ...draft, status: e.target.value as Survey['status'] })}
                          className={cn(
                            "w-full h-11 rounded-xl px-4 text-[16px] font-black outline-none transition-colors",
                            getStatusSelectClass(draft.status)
                          )}
                        >
                          <option value="draft">下書き</option>
                          <option value="open">受付中</option>
                          <option value="closed">終了</option>
                        </select>
                      </section>

                      <section>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f8b8d] text-[11px] font-black text-white">2</span>
                          <h4 className="text-[16px] font-black text-stone-800">回答モード</h4>
                        </div>
                        <select
                          value={draft.response_mode}
                          onChange={(e) => setDraft({ ...draft, response_mode: e.target.value as Survey['response_mode'] })}
                          className="w-full h-11 rounded-xl border border-stone-200 bg-stone-50 px-4 text-[16px] font-black text-stone-900 outline-none focus:border-[#0f8b8d]"
                        >
                          <option value="single_editable">1回・編集可</option>
                          <option value="single_locked">1回・ロック</option>
                          <option value="multiple">複数回答可</option>
                        </select>
                      </section>

                      <section>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f8b8d] text-[11px] font-black text-white">3</span>
                          <h4 className="text-[16px] font-black text-stone-800">回答対象</h4>
                        </div>
                        <select
                          value={draft.activity_id ? 'activity' : 'all'}
                          onChange={(e) => setAudienceMode(e.target.value as 'all' | 'activity')}
                          className="w-full h-11 rounded-xl border border-stone-200 bg-stone-50 px-4 text-[16px] font-black text-stone-900 outline-none focus:border-[#0f8b8d]"
                        >
                          <option value="all">全て</option>
                          <option value="activity">活動ごと</option>
                        </select>

                        {draft.activity_id && (
                          <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3">
                            <label className="mb-2 block text-[14px] font-black text-stone-500">対象活動</label>
                            <select value={draft.activity_id} onChange={(e) => setActivityTarget(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-stone-200 bg-stone-50 text-[15px] font-bold text-stone-900 outline-none focus:border-[#0f8b8d]">
                              {activities.map((activity: any) => <option key={activity.id} value={activity.id}>{activity.title}</option>)}
                            </select>
                          </div>
                        )}
                      </section>

                      <section>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f8b8d] text-[11px] font-black text-white">4</span>
                          <h4 className="text-[16px] font-black text-stone-800">学年</h4>
                        </div>
                        <select
                          value={draft.target_config.years[0] ?? 'all'}
                          onChange={(e) => setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                          className="w-full h-11 rounded-xl border border-stone-200 bg-stone-50 px-4 text-[16px] font-black text-stone-900 outline-none focus:border-[#0f8b8d]"
                        >
                          <option value="all">全て</option>
                          {SURVEY_YEAR_OPTIONS.map((year) => (
                            <option key={year.value} value={year.value}>{year.label}</option>
                          ))}
                        </select>

                        <div className="mb-2 mt-6 flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f8b8d] text-[11px] font-black text-white">5</span>
                          <h4 className="text-[16px] font-black text-stone-800">パスワード</h4>
                        </div>
                        <div className="relative">
                            <input
                              type={showSurveyPassword ? 'text' : 'password'}
                              value={draft.password}
                              onChange={(e) => setDraft((prev) => ({ ...prev, password: e.target.value }))}
                              placeholder={draft.target_config.password_hash && !draft.password ? '設定済み（空欄で保存すると解除）' : '未入力ならパスワードなし'}
                              className="w-full h-11 rounded-xl border border-stone-200 bg-white px-4 pr-12 text-[15px] font-bold text-stone-900 outline-none focus:border-[#0f8b8d]"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSurveyPassword((prev) => !prev)}
                              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                              aria-label={showSurveyPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                            >
                              {showSurveyPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                      </section>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 px-4 py-2 md:flex-row md:items-center md:justify-between md:px-1">
                      <div>
                        <p className="text-[14px] font-black tracking-[0.18em] text-stone-700">設定の確認</p>
                        <p className="mt-1 text-[17px] font-black text-stone-900">{audienceSummary}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => goToEditorStep('build')}
                        className="h-10 min-w-[120px] rounded-xl bg-[#5f45d8] px-5 text-[13px] text-white font-black tracking-widest shadow-md shadow-indigo-200"
                      >
                        次へ
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5 md:space-y-6">
                    <div className="space-y-4 md:space-y-5">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => goToEditorStep('setup')}
                          className="h-11 rounded-xl border border-stone-200 bg-white px-4 text-stone-700 inline-flex items-center justify-center gap-2 font-black text-[13px] tracking-[0.08em] whitespace-nowrap"
                          aria-label="ステップ1に戻る"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          <span>ステップ1へ戻す</span>
                        </button>
                        <p className="text-[12px] font-black tracking-[0.2em] text-stone-400">フォーム本文</p>
                      </div>

                      <div className="p-2 rounded-xl bg-white border border-[#d1d5db] space-y-1 shadow-sm border-t-[8px] border-t-[#5f45d8]">
                        <input
                          value={draft.title}
                          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                          placeholder="タイトル"
                          data-formattable="true"
                          className="w-full p-1 pt-2 pb-[4px] bg-transparent border-0 border-b border-stone-300 rounded-none font-black text-[21px] leading-[1] text-stone-900 outline-none focus:border-[#5f45d8]"
                        />
                        <textarea
                          value={draft.description}
                          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                          placeholder="説明"
                          data-formattable="true"
                          rows={1}
                          className="w-full py-1 p-1 pt-2 pb-[5px] bg-transparent border-0 border-b border-stone-300 rounded-none font-normal text-[16px] leading-[1] text-stone-700 outline-none focus:border-[#5f45d8] resize-none"
                        />
                      </div>

                      {draft.questions.map((question, idx) => (
                        <div key={idx} className="space-y-2">
                        <div
                          ref={(element) => {
                            questionRefs.current[idx] = element;
                          }}
                          onClick={() => setActiveQuestionIndex(idx)}
                          className={cn(
                            "rounded-xl bg-white border shadow-sm space-y-3 border-t-4 transition-all duration-200 cursor-pointer p-3 md:p-4",
                            activeQuestionIndex === idx
                              ? "border-[#8ab4f8] border-t-[#0f8b8d] shadow-[0_0_0_2px_rgba(26,115,232,0.12)]"
                              : "border-[#d1d5db] border-t-[#0f8b8d]"
                          )}
                        >
                          <div className="space-y-2 sm:space-y-0">
                            <div className="sm:hidden min-w-0 flex items-center gap-2 text-[18px] font-black tracking-[0.18em] text-[#2563eb]">
                              <span>{`問${idx + 1}`}</span>
                              <span className="text-[#2563eb]">・</span>
                              <span className="truncate">{getQuestionTypeLabel(question.type)}</span>
                              {question.required && <span className="text-[#d93025]">*</span>}
                            </div>
                            <div className="sm:hidden flex items-center gap-2">
                              <label className="inline-flex items-center gap-2 text-[14px] font-black text-stone-600 whitespace-nowrap shrink-0">
                                <button
                                  type="button"
                                  onClick={() => updateQuestion(idx, { required: !question.required })}
                                  className={cn(
                                    "relative w-10 h-6 rounded-full transition-colors",
                                    question.required ? "bg-[#1a73e8]" : "bg-stone-300"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all",
                                      question.required ? "left-[18px]" : "left-0.5"
                                    )}
                                  />
                                </button>
                                必須
                              </label>
                              <div className="flex items-center justify-center gap-1 shrink-0">
                                <button type="button" onClick={() => moveQuestion(idx, -1)} disabled={idx === 0} className="w-8 h-8 rounded-full border border-blue-200 bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm disabled:opacity-30">
                                  <ArrowUp className="w-4 h-4" />
                                </button>
                                <button type="button" onClick={() => moveQuestion(idx, 1)} disabled={idx === draft.questions.length - 1} className="w-8 h-8 rounded-full border border-rose-200 bg-rose-50 text-rose-600 flex items-center justify-center shadow-sm disabled:opacity-30">
                                  <ArrowDown className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="flex-1 min-w-0">
                                <select
                                  value={question.type}
                                  onChange={(e) => {
                                    const nextType = e.target.value as SurveyQuestion['type'];
                                    updateQuestion(idx, {
                                      type: nextType,
                                      ...(isChoiceQuestion(nextType) && !isChoiceQuestion(question.type)
                                        ? { choicesText: '\n', choiceLimitsText: '\n' }
                                        : {}),
                                    });
                                  }}
                                  className="w-full h-11 px-3 bg-white border border-stone-200 rounded-lg font-medium text-[16px] text-stone-800 outline-none focus:border-[#5f45d8]"
                                >
                                  {SURVEY_QUESTION_TYPES.map((type) => (
                                    <option key={type.value} value={type.value}>{type.label}</option>
                                  ))}
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={() => requestRemoveQuestionAt(idx)}
                                disabled={draft.questions.length === 1}
                                className={cn(
                                  "h-8 rounded-lg flex items-center justify-center disabled:opacity-30 shrink-0 transition-all",
                                  confirmDeleteQuestionIndex === idx
                                    ? "px-2 bg-rose-500 text-white gap-1"
                                    : "w-8 bg-rose-50 text-rose-500"
                                )}
                              >
                                <Trash2 className="w-4 h-4" />
                                {confirmDeleteQuestionIndex === idx && <span className="text-[12px] font-black">確認</span>}
                              </button>
                            </div>
                            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3">
                              <div className="min-w-0 flex items-center gap-3 text-[18px] font-black tracking-[0.18em] text-[#2563eb]">
                                <span>{`問${idx + 1}`}</span>
                                <span className="text-[#2563eb]">・</span>
                                <span className="truncate">{getQuestionTypeLabel(question.type)}</span>
                                {question.required && <span className="text-[#d93025]">*</span>}
                                <label className="inline-flex items-center gap-3 text-[16px] font-black text-stone-600 whitespace-nowrap ml-2">
                                  <button
                                    type="button"
                                    onClick={() => updateQuestion(idx, { required: !question.required })}
                                    className={cn(
                                      "relative w-10 h-6 rounded-full transition-colors",
                                      question.required ? "bg-[#1a73e8]" : "bg-stone-300"
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all",
                                        question.required ? "left-[18px]" : "left-0.5"
                                      )}
                                    />
                                  </button>
                                  必須
                                </label>
                              </div>
                              <div className="flex items-center justify-center gap-2 mx-auto">
                                <button type="button" onClick={() => moveQuestion(idx, -1)} disabled={idx === 0} className="w-8 h-8 rounded-full border border-blue-200 bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm disabled:opacity-30">
                                  <ArrowUp className="w-4 h-4" />
                                </button>
                                <button type="button" onClick={() => moveQuestion(idx, 1)} disabled={idx === draft.questions.length - 1} className="w-8 h-8 rounded-full border border-rose-200 bg-rose-50 text-rose-600 flex items-center justify-center shadow-sm disabled:opacity-30">
                                  <ArrowDown className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-[132px] lg:w-[180px]">
                                  <select
                                    value={question.type}
                                    onChange={(e) => {
                                      const nextType = e.target.value as SurveyQuestion['type'];
                                      updateQuestion(idx, {
                                        type: nextType,
                                        ...(isChoiceQuestion(nextType) && !isChoiceQuestion(question.type)
                                          ? { choicesText: '\n', choiceLimitsText: '\n' }
                                          : {}),
                                      });
                                    }}
                                    className="w-full h-11 px-3 bg-white border border-stone-200 rounded-lg font-medium text-[16px] text-stone-800 outline-none focus:border-[#5f45d8]"
                                  >
                                    {SURVEY_QUESTION_TYPES.map((type) => (
                                      <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => requestRemoveQuestionAt(idx)}
                                  disabled={draft.questions.length === 1}
                                  className={cn(
                                    "h-8 rounded-lg flex items-center justify-center disabled:opacity-30 shrink-0 transition-all",
                                    confirmDeleteQuestionIndex === idx
                                      ? "px-2 bg-rose-500 text-white gap-1"
                                      : "w-8 bg-rose-50 text-rose-500"
                                  )}
                                >
                                  <Trash2 className="w-4 h-4" />
                                  {confirmDeleteQuestionIndex === idx && <span className="text-[12px] font-black">確認</span>}
                                </button>
                              </div>
                            </div>
                          </div>
                          <textarea
                            value={question.label}
                            onChange={(e) => updateQuestion(idx, { label: e.target.value })}
                            onInput={(e) => autoResizeTextarea(e.currentTarget)}
                            placeholder="質問"
                            data-formattable="true"
                            data-autosize="true"
                            rows={2}
                            className="w-full min-h-[56px] overflow-hidden px-3 py-2 bg-white border border-stone-200 rounded-lg font-semibold text-[16px] leading-6 text-stone-900 placeholder:text-[16px] placeholder:text-stone-400 outline-none focus:border-[#5f45d8] resize-none"
                          />
                          <textarea
                            value={question.description}
                            onChange={(e) => updateQuestion(idx, { description: e.target.value })}
                            onInput={(e) => autoResizeTextarea(e.currentTarget)}
                            placeholder="質問説明"
                            data-formattable="true"
                            data-autosize="true"
                            rows={1}
                            className="w-full min-h-[40px] overflow-hidden px-0 pb-3 bg-transparent border-0 border-b border-stone-200 rounded-none font-medium text-[16px] leading-6 text-stone-700 placeholder:text-[16px] placeholder:text-stone-400 outline-none resize-none"
                          />
                          {isChoiceQuestion(question.type) && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[16px] font-black text-stone-500">選択肢</p>
                                <button type="button" onClick={() => addChoice(idx)} className="px-2.5 py-1.5 rounded-lg bg-[#4F5BD5]/10 text-[#4F5BD5] text-[14px] font-black flex items-center gap-1">
                                  <Plus className="w-3 h-3" /> 追加
                                </button>
                              </div>
                              {question.choicesText.split('\n').map((choice, choiceIdx) => (
                                <div key={choiceIdx} className="rounded-xl border border-stone-100 bg-stone-50/50 p-0 sm:p-0 sm:border-0 sm:bg-transparent">
                                  <div className="flex items-start gap-1.5 min-w-0">
                                    <span className={cn("w-4 h-4 border-2 border-stone-300 shrink-0", question.type === 'multiple_choice' ? "rounded" : "rounded-full")} />
                                    <textarea
                                      value={choice}
                                      onChange={(e) => setChoiceAt(idx, choiceIdx, e.target.value)}
                                      onInput={(e) => autoResizeTextarea(e.currentTarget)}
                                      placeholder={`選択${choiceIdx + 1}`}
                                      data-autosize="true"
                                      rows={1}
                                      className="flex-1 min-w-0 min-h-[34px] overflow-hidden px-0 bg-transparent border-0 border-b border-stone-300 rounded-none font-medium text-[16px] leading-6 text-stone-900 placeholder:text-[16px] placeholder:text-stone-400 outline-none focus:border-[#5f45d8] resize-none"
                                    />
                                    <div className="hidden sm:flex items-center gap-2 shrink-0 mt-[2px]">
                                      <label className="h-10 w-[82px] px-2 rounded-lg bg-white border border-stone-200 flex items-center gap-1.5 shrink-0">
                                        <span className="text-[11px] font-black tracking-[0.08em] text-stone-400 whitespace-nowrap">上限</span>
                                        <input
                                          value={question.choiceLimitsText.split('\n')[choiceIdx] || ''}
                                          onChange={(e) => setChoiceLimitAt(idx, choiceIdx, e.target.value.replace(/[^\d]/g, ''))}
                                          placeholder="∞"
                                          className="w-full min-w-0 bg-transparent border-0 p-0 text-right text-[15px] font-black text-stone-700 placeholder:text-stone-300 outline-none"
                                        />
                                      </label>
                                      <button type="button" onClick={() => removeChoice(idx, choiceIdx)} disabled={question.choicesText.split('\n').length <= 1} className="w-10 h-10 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center disabled:opacity-30 shrink-0">
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="mt-0 ml-0 flex sm:hidden items-center justify-end gap-1.5">
                                    <label className="h-8 w-[74px] px-2 rounded-lg bg-white border border-stone-200 flex items-center gap-1.5 shrink-0">
                                      <span className="text-[11px] font-black tracking-[0.08em] text-stone-400 whitespace-nowrap">上限</span>
                                      <input
                                        value={question.choiceLimitsText.split('\n')[choiceIdx] || ''}
                                        onChange={(e) => setChoiceLimitAt(idx, choiceIdx, e.target.value.replace(/[^\d]/g, ''))}
                                        placeholder="∞"
                                        className="w-full min-w-0 bg-transparent border-0 p-0 text-right text-[15px] font-black text-stone-700 placeholder:text-stone-300 outline-none"
                                      />
                                    </label>
                                    <button type="button" onClick={() => removeChoice(idx, choiceIdx)} disabled={question.choicesText.split('\n').length <= 1} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center disabled:opacity-30 shrink-0">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                              <p className="ml-0 text-[13px] font-bold text-stone-400">上限を空欄のままにすると無制限です。</p>
                            </div>
                          )}
                        </div>
                        </div>
                      ))}

                      <div className="hidden md:flex justify-center">
                        <button
                          onClick={() => addQuestionAt()}
                          className="inline-flex h-11 px-5 rounded-xl border border-dashed border-orange-300 bg-orange-50 text-orange-600 font-black items-center justify-center gap-2"
                        >
                          <Plus className="w-5 h-5" /> 質問を追加
                        </button>
                      </div>

                      <div className="hidden md:flex justify-end">
                        <button
                          onClick={() => saveMutation.mutate()}
                          disabled={saveMutation.isPending}
                          className="inline-flex h-12 md:h-14 px-6 rounded-2xl bg-[#4F5BD5] hover:bg-[#434fc6] text-white font-black tracking-widest items-center justify-center gap-3 shadow-lg shadow-indigo-200 disabled:opacity-50"
                        >
                          {saveMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                          保存
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              {editorStep === 'build' && (
                <>
                  <div className="md:hidden sticky bottom-0 mt-4 pt-3 safe-area-pb">
                    <div className="mx-auto grid grid-cols-[auto_1fr_auto] gap-2 rounded-2xl border border-stone-200 bg-white/95 backdrop-blur px-3 py-2 shadow-lg">
                      <button
                        type="button"
                        onClick={() => goToEditorStep('setup')}
                        className="h-11 rounded-xl bg-stone-50 px-3 text-stone-700 inline-flex items-center justify-center gap-2 font-black text-[12px] whitespace-nowrap"
                        aria-label="ステップ1に戻る"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>ステップ1へ戻す</span>
                      </button>
                      <button type="button" onClick={() => addQuestionAt(activeQuestionIndex)} className="h-11 rounded-xl bg-orange-50 text-orange-600 font-black text-[12px] flex items-center justify-center gap-2 border border-orange-200">
                        <Plus className="w-4 h-4" /> 質問を追加
                      </button>
                      <button
                        type="button"
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending}
                        className="h-11 min-w-[96px] rounded-xl bg-[#4F5BD5] text-white font-black text-[12px] flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 disabled:opacity-50 px-3"
                      >
                        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        保存
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ExcelExportModal
        isOpen={isExportModalOpen}
        title="Survey Export"
        description="Chon cac truong thong tin nguoi tra loi va cac cau hoi can dua vao file Excel."
        fields={surveyExportFields}
        defaultSelectedKeys={surveyDefaultExportKeys}
        onClose={() => setIsExportModalOpen(false)}
        onConfirm={exportConfiguredResponses}
        confirmLabel="Export phan hoi"
      />
    </div>
  );
}
