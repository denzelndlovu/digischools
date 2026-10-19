import { createContext, useContext } from 'react';
import type { PublicTenantConfig } from '@digischools/config-schema';

export interface SchoolState {
  school: PublicTenantConfig | null;
  setSchool: (s: PublicTenantConfig | null) => void;
}

export const SchoolContext = createContext<SchoolState | null>(null);

export function useSchool(): SchoolState {
  const s = useContext(SchoolContext);
  if (!s) throw new Error('useSchool must be used inside the root layout');
  return s;
}
