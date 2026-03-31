export interface User {
  id: string;
  email: string;
  mssv?: string | null;
  full_name: string;
  full_name_furigana?: string | null;
  nationality?: string | null;
  phone?: string | null;
  line_id?: string | null;
  hometown?: string | null;
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
  role: 'admin' | 'executive' | 'member' | 'alumni';
  department?: string | null;
  class_name?: string | null;
  university_year?: 1 | 2 | 3 | 4;
  is_active: boolean;
}
