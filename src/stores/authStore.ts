import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserData {
  uid: string;
  email: string;
  name: string;
  fullName?: string;
  role: 'admin' | 'morador' | 'hospede';
  isActive: boolean;
  isPresent: boolean;
  phone?: string;
  cpf?: string;
  pixKey?: string;
  birthDate?: string;
  photoURL?: string;
  houseId?: string;
}

interface AuthStore {
  user: UserData | null;
  firebaseUser: any | null;
  isLoading: boolean;
  setUser: (user: UserData | null) => void;
  setFirebaseUser: (user: any | null) => void;
  setLoading: (loading: boolean) => void;
  setIsPresent: (isPresent: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      firebaseUser: null,
      isLoading: true,
      setUser: (user) => set({ user }),
      setFirebaseUser: (firebaseUser) => set({ firebaseUser }),
      setLoading: (isLoading) => set({ isLoading }),
      setIsPresent: (isPresent) =>
        set((state) => ({
          user: state.user ? { ...state.user, isPresent } : null,
        })),
      logout: () => set({ user: null, firebaseUser: null }),
    }),
    {
      name: 'caule-auth-storage',
      partialize: (state) => ({ user: state.user, firebaseUser: state.firebaseUser }),
    }
  )
);
