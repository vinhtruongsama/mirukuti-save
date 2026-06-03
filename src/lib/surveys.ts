import type { ClubMembership } from '../types';
import type { Survey, SurveyQuestion } from '../types/survey';

export const SURVEY_ROLE_OPTIONS = [
  { value: 'president', label: '部長' },
  { value: 'vice_president', label: '副部長' },
  { value: 'treasurer', label: '会計' },
  { value: 'executive', label: '幹部' },
  { value: 'member', label: '部員' },
  { value: 'alumni', label: '卒業生' },
];

export const SURVEY_YEAR_OPTIONS = [
  { value: 1, label: '1年生' },
  { value: 2, label: '2年生' },
  { value: 3, label: '3年生' },
  { value: 4, label: '4年生' },
  { value: 0, label: '卒業生' },
];

export const SURVEY_QUESTION_TYPES: Array<{ value: SurveyQuestion['type']; label: string }> = [
  { value: 'short_text', label: '短文' },
  { value: 'number', label: '数' },
  { value: 'single_choice', label: '単一選択' },
  { value: 'multiple_choice', label: '複数選択' },
];

export const RESPONSE_MODE_LABELS: Record<Survey['response_mode'], string> = {
  single_editable: '1回・編集可',
  single_locked: '1回・ロック',
  multiple: '複数回答可',
};

export const STATUS_LABELS: Record<Survey['status'], string> = {
  draft: '下書き',
  open: '受付中',
  closed: '終了',
};

export const isChoiceQuestion = (type: SurveyQuestion['type']) =>
  type === 'single_choice' || type === 'multiple_choice';

export const isSurveyEligibleForMembership = (
  survey: Pick<Survey, 'target_config' | 'activity_id'>,
  membership?: ClubMembership | null,
  isRegisteredForActivity = false,
  userUniversityYear?: number | null,
) => {
  const target = survey.target_config || {};
  if (target.require_activity_registration && survey.activity_id && !isRegisteredForActivity) {
    return false;
  }

  const roles = target.roles || [];
  if (roles.length > 0 && !membership) return false;
  if (roles.length > 0 && !roles.includes(membership?.role || '')) return false;

  const years = (target.years || []).map((year) => Number(year));
  const memberYear = membership?.university_year ?? userUniversityYear ?? -1;
  if (years.length > 0 && !years.includes(Number(memberYear))) return false;

  return true;
};

export const formatAnswerValue = (value: unknown) => {
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export const hashSurveyPassword = async (value: string) => {
  const normalized = value.trim();
  if (!normalized) return '';

  const encoded = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};
