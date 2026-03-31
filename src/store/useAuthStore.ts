import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import type { User, ClubMembership } from '../types';
import { useAppStore } from './useAppStore';

interface AuthState {
  session: Session | null;
  currentUser: User | null;
  memberships: ClubMembership[];
  currentRole: ClubMembership['role'] | null;
  isLoading: boolean;
  isTemporaryPassword: boolean;
  setAuth: (session: Session | null) => Promise<void>;
  updateCurrentRole: (academicYearId?: string) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  currentUser: null,
  memberships: [],
  currentRole: null,
  isLoading: true,
  isTemporaryPassword: false,

  setAuth: async (session) => {
    set({ isLoading: true });
    
    if (!session?.user) {
      set({ session: null, currentUser: null, memberships: [], currentRole: null, isTemporaryPassword: false, isLoading: false });
      return;
    }

    try {
      // Fetch user profile
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .is('deleted_at', null)
        .single();

      if (userError) {
        // Handle error silently in production
      }

      // Fetch all memberships for this user
      const { data: membershipsData, error: membershipsError } = await supabase
        .from('club_memberships')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .is('deleted_at', null);

      if (membershipsError) {
        // Handle error silently in production
      }

      set({
        session,
        currentUser: (userData as User) || null,
        memberships: (membershipsData as ClubMembership[]) || [],
        isTemporaryPassword: !!session.user.user_metadata?.is_temporary_password,
      });

      // Attempt to calculate current role based on currently selected year
      get().updateCurrentRole();
      
    } catch {
      // Even if data fetch fails, session is valid
      set({ session, currentUser: null, memberships: [], currentRole: null });
    } finally {
      set({ isLoading: false });
    }
  },

  updateCurrentRole: (academicYearId) => {
    const { memberships } = get();
    // Use provided year ID, or fallback to the current selected year in AppStore
    const targetYearId = academicYearId || useAppStore.getState().selectedYear?.id;
    
    if (!targetYearId || memberships.length === 0) {
      set({ currentRole: null });
      return;
    }

    const currentMembership = memberships.find((m) => m.academic_year_id === targetYearId);
    set({ currentRole: currentMembership ? currentMembership.role : null });
  },

  signOut: async () => {
    set({ isLoading: true });
    await supabase.auth.signOut();
    set({ session: null, currentUser: null, memberships: [], currentRole: null, isTemporaryPassword: false, isLoading: false });
  }
}));
