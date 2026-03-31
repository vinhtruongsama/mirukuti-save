import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { AcademicYear } from '../types';

interface AppState {
  academicYears: AcademicYear[];
  selectedYear: AcademicYear | null;
  isLoading: boolean;
  error: string | null;
  fetchAcademicYears: () => Promise<void>;
  setSelectedYear: (year: AcademicYear) => void;
}

export const useAppStore = create<AppState>((set) => ({
  academicYears: [],
  selectedYear: null,
  isLoading: false,
  error: null,

  fetchAcademicYears: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('academic_years')
        .select('*')
        .order('name', { ascending: false });

      if (error) throw error;

      const years = data as AcademicYear[];
      const currentYear = years.find((y) => y.is_current) || years[0] || null;

      set({ 
        academicYears: years, 
        selectedYear: currentYear,
        isLoading: false 
      });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  setSelectedYear: (year) => {
    set({ selectedYear: year });
  },
}));
