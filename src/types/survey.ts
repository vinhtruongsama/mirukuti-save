export type SurveyStatus = 'draft' | 'open' | 'closed';
export type SurveyResponseMode = 'single_editable' | 'single_locked' | 'multiple';
export type SurveyQuestionType =
  | 'short_text'
  | 'long_text'
  | 'single_choice'
  | 'multiple_choice'
  | 'dropdown'
  | 'rating'
  | 'date'
  | 'time';

export interface SurveyTargetConfig {
  require_activity_registration?: boolean;
  roles?: string[];
  years?: number[];
}

export interface Survey {
  id: string;
  academic_year_id: string;
  activity_id?: string | null;
  title: string;
  description?: string | null;
  status: SurveyStatus;
  response_mode: SurveyResponseMode;
  target_config: SurveyTargetConfig;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  activities?: {
    id: string;
    title: string;
    date?: string | null;
    location?: string | null;
  } | null;
}

export interface SurveyQuestion {
  id: string;
  survey_id: string;
  position: number;
  type: SurveyQuestionType;
  label: string;
  description?: string | null;
  required: boolean;
  options: {
    choices?: string[];
    choice_limits?: Array<number | null>;
    min?: number;
    max?: number;
  };
}

export interface SurveyResponse {
  id: string;
  survey_id: string;
  user_id: string;
  submitted_at: string;
  updated_at: string;
  users?: {
    full_name?: string | null;
    full_name_kana?: string | null;
    mssv?: string | null;
    university_email?: string | null;
  } | null;
  survey_answers?: SurveyAnswer[];
}

export interface SurveyAnswer {
  id: string;
  response_id: string;
  question_id: string;
  value: unknown;
}
