import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Casa {
  id: string;
  nome: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
}

interface HouseStore {
  casaAtual: Casa | null;
  setCasaAtual: (casa: Casa | null) => void;
  clearCasaAtual: () => void;
}

export const useHouseStore = create<HouseStore>()(
  persist(
    (set) => ({
      casaAtual: null,
      setCasaAtual: (casa) => set({ casaAtual: casa }),
      clearCasaAtual: () => set({ casaAtual: null }),
    }),
    {
      name: 'caule-house-storage',
    }
  )
);
