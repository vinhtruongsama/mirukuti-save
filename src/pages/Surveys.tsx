import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Clock3, Loader2, Search, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isSurveyEligibleForMembership, STATUS_LABELS } from '../lib/surveys';
import { useAppStore } from '../store/useAppStore';
import { useAuthStore } from '../store/useAuthStore';
import type { Survey, SurveyResponse as SurveySubmission } from '../types/survey';

const getSurveyCoverClass = (idx: number) => {
  const variants = [
    'bg-gradient-to-br from-[#ffe7cf] via-[#ffd6b5] to-[#ffcfa8]',
    'bg-gradient-to-br from-[#caeef4] via-[#b7e5ef] to-[#a5dce8]',
    'bg-gradient-to-br from-[#efe1ff] via-[#e8d5ff] to-[#dfc8ff]',
    'bg-gradient-to-br from-[#e4f7df] via-[#d6f0cc] to-[#c7e8ba]',
  ];
  return variants[idx % variants.length];
};

const statusBadgeClass = 'bg-[#e9fbf4] text-[#00856f] border border-[#c9f0e3]';

export default function Surveys() {
  const { currentUser, memberships } = useAuthStore();
  const { selectedYear } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');

  const { data: userRegMap = {} as Record<string, any[]> } = useQuery({
    queryKey: ['user-registrations', currentUser?.id, selectedYear?.id],
    queryFn: async () => {
      if (!currentUser || !selectedYear) return {};
      const { data, error } = await supabase
        .from('registrations')
        .select('activity_id, selected_sessions')
        .eq('user_id', currentUser.id);

      if (error) throw error;
      return (data || []).reduce((acc, row) => ({ ...acc, [row.activity_id]: row.selected_sessions }), {});
    },
    enabled: !!currentUser && !!selectedYear,
  });

  const userRegistrations = Object.keys(userRegMap);
  const currentMembership = useMemo(
    () => memberships.find((membership) => membership.academic_year_id === selectedYear?.id) || null,
    [memberships, selectedYear?.id]
  );

  const { data: openSurveys = [], isLoading } = useQuery({
    queryKey: ['surveys-page-open', selectedYear?.id, userRegistrations.join(',')],
    queryFn: async () => {
      if (!selectedYear) return [];
      const { data, error } = await supabase
        .from('surveys')
        .select('id, title, description, activity_id, status, response_mode, target_config, academic_year_id, created_at, updated_at, activities(id, title, date, location)')
        .eq('academic_year_id', selectedYear.id)
        .eq('status', 'open')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return ((data || []) as any[]).map((survey) => ({
        ...survey,
        activities: Array.isArray(survey.activities) ? survey.activities[0] ?? null : survey.activities,
      })) as Survey[];
    },
    enabled: !!selectedYear,
  });

  const eligibleSurveys = useMemo(() => {
    return openSurveys.filter((survey) =>
      isSurveyEligibleForMembership(
        survey,
        currentMembership,
        !!(survey.activity_id && userRegistrations.includes(survey.activity_id)),
        currentUser?.university_year
      )
    );
  }, [currentMembership, currentUser?.university_year, openSurveys, userRegistrations]);

  const { data: surveyResponses = [] as SurveySubmission[] } = useQuery({
    queryKey: ['surveys-page-responses', currentUser?.id, eligibleSurveys.map((survey) => survey.id).join(',')],
    queryFn: async () => {
      if (!currentUser || eligibleSurveys.length === 0) return [];
      const { data, error } = await supabase
        .from('survey_responses')
        .select('id, survey_id, user_id, submitted_at, updated_at')
        .eq('user_id', currentUser.id)
        .in('survey_id', eligibleSurveys.map((survey) => survey.id))
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return (data || []) as SurveySubmission[];
    },
    enabled: !!currentUser && eligibleSurveys.length > 0,
  });

  const responseMap = useMemo(() => {
    const map = new Map<string, SurveySubmission>();
    surveyResponses.forEach((response) => {
      if (!map.has(response.survey_id)) map.set(response.survey_id, response);
    });
    return map;
  }, [surveyResponses]);

  const surveyItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return eligibleSurveys
      .map((survey) => {
        const response = responseMap.get(survey.id);
        const hasAnswered = !!response;
        const actionLabel = !hasAnswered
          ? '回答が必要'
          : survey.response_mode === 'single_locked'
            ? '回答済み'
            : survey.response_mode === 'single_editable'
              ? '回答を更新できます'
              : '追加回答できます';

        return { survey, hasAnswered, actionLabel };
      })
      .filter(({ survey }) => {
        if (!query) return true;
        return [survey.title, survey.description || '', survey.activities?.title || '']
          .some((value) => value.toLowerCase().includes(query));
      })
      .sort((a, b) => {
        if (a.hasAnswered !== b.hasAnswered) return a.hasAnswered ? 1 : -1;
        return new Date(b.survey.updated_at).getTime() - new Date(a.survey.updated_at).getTime();
      });
  }, [eligibleSurveys, responseMap, searchTerm]);

  return (
    <div className="min-h-screen bg-[#fafafb] relative overflow-hidden selection:bg-pink-100 selection:text-pink-900">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[55%] h-[55%] bg-[#D62976]/[0.035] blur-[150px] rounded-full" />
        <div className="absolute bottom-[-12%] right-[-10%] w-[60%] h-[60%] bg-[#4F5BD5]/[0.035] blur-[150px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-28 relative z-10">
        <div className="mb-10">
          <div className="relative flex items-center min-h-[56px] pl-7">
            <div className="absolute left-[10px] sm:left-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-gradient-to-b from-[#4F5BD5] to-[#D62976] rounded-full" />
            <h1 className="text-3xl md:text-3xl px-4 font-black text-brand-stone-900 tracking-tighter leading-none">アンケートフォーム</h1>
          </div>
        </div>

        <AnimatePresence mode="popLayout">
          <section className="rounded-[2rem] border border-stone-200 bg-white shadow-lg shadow-stone-200/30 overflow-hidden">
            <div className="border-b border-stone-200 px-4 py-3 md:px-6 md:py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-1 overflow-x-auto">
                  <button className="h-10 px-4 rounded-t-xl border-b-2 border-[#0f8b8d] text-stone-900 font-black text-[13px] whitespace-nowrap">
                    すべて
                  </button>
                </div>
                <div className="relative flex-1 max-w-[280px] ml-auto">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="キーワードで絞り込み"
                    className="h-11 w-full rounded-xl border border-stone-200 bg-white pl-10 pr-4 text-[14px] font-medium text-stone-800 outline-none transition focus:border-[#0f8b8d]"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 md:p-6">
              {isLoading ? (
                <div className="py-24 flex justify-center">
                  <Loader2 className="w-7 h-7 animate-spin text-[#0f8b8d]" />
                </div>
              ) : surveyItems.length > 0 ? (
                <motion.div layout className="grid gap-4 grid-cols-2 lg:grid-cols-5">
                  {surveyItems.map((item, index) => (
                    <motion.div
                      key={item.survey.id}
                      layout
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -18 }}
                      transition={{ duration: 0.25, delay: index * 0.04 }}
                      className="group overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className={`relative overflow-hidden h-[110px] sm:h-[120px] lg:h-[130px] ${getSurveyCoverClass(index)}`}>
                        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.45)_1px,transparent_1px)] [background-size:18px_18px]" />
                        <div className="absolute left-4 top-4">
                          <span className={`inline-flex items-center justify-center rounded-full px-4 h-9 text-[14px] font-black leading-none ${statusBadgeClass}`}>
                            {STATUS_LABELS[item.survey.status]}
                          </span>
                        </div>
                      </div>

                      <div className="flex min-h-[200px] flex-col p-3 sm:min-h-[200px] sm:p-4 md:p-5">
                        <p
                          className="overflow-hidden text-[14px] sm:text-[16px] font-black text-stone-900"
                          style={{
                            lineHeight: '1.1em',
                            height: '2.0em',
                            minHeight: '2.0em',
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.survey.title}
                        </p>
                        <p className={`mt-2 sm:mt-3 text-[12px] sm:text-[13px] font-black ${item.hasAnswered ? 'text-emerald-700' : 'text-[#00856f]'}`}>
                          {item.actionLabel}
                        </p>
                        <div className="mt-1 min-h-[18px]">
                          {item.survey.activities?.title && (
                          <div className="flex items-center gap-2 text-[11px] sm:text-[12px] font-medium text-stone-500">
                            <Clock3 className="w-3.5 h-3.5" />
                            <span>{item.survey.activities.title}</span>
                          </div>
                          )}
                        </div>
                        <p
                          className={`mt-2 min-h-[2.8em] text-[11px] sm:text-[12px] font-medium text-stone-400 line-clamp-2 ${item.survey.description ? '' : 'invisible'}`}
                        >
                          {item.survey.description || 'placeholder'}
                        </p>
                        <div className="mt-auto pt-3">
                          <Link
                            to={`/surveys/${item.survey.id}`}
                            className="h-9 w-full rounded-xl bg-gradient-to-r from-[#D62976] to-[#6C5CE7] px-3 sm:px-4 text-[12px] sm:text-[13px] font-black text-white shadow-[0_10px_24px_-12px_rgba(108,92,231,0.7)] inline-flex items-center justify-center gap-2"
                          >
                            <Sparkles className="w-4 h-4" />
                            回答する
                            <ArrowRight className="w-4 h-4" />
                          </Link>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[1.75rem] border border-dashed border-stone-200 bg-stone-50/60 py-20 text-center">
                  <p className="text-stone-300 font-black tracking-widest text-[12px]">まだアンケートがありません</p>
                </motion.div>
              )}
            </div>
          </section>
        </AnimatePresence>
      </div>
    </div>
  );
}
