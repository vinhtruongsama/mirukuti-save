export interface User {
  id: string;
  email: string;
  mssv?: string | null;
  full_name: string;
  full_name_kana?: string | null;
  gender?: 'Male' | 'Female' | 'Other' | null;
  line_nickname?: string | null;
  phone?: string | null;
  university_email?: string | null;
  line_id?: string | null;
  hometown?: string | null;
  nationality?: string | null;
  avatar_url?: string | null;
}

export interface AcademicYear {
  id: string;
  name: string;
  is_current: boolean;
}

export interface ClubMembership {
  id: string;
  user_id: string;
  academic_year_id: string;
  role: 'president' | 'vice_president' | 'treasurer' | 'executive' | 'member' | 'alumni';
  department?: string | null;
  class_name?: string | null;
  university_year?: 0 | 1 | 2 | 3 | 4;
  is_active: boolean;
}
