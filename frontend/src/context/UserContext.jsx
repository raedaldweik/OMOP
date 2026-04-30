import { createContext, useContext } from 'react';

const UserContext = createContext();

const RESEARCHER = {
  id:     'researcher',
  name:   'Researcher',
  role:   'researcher',
  sub:    'OHDSI Network · OMOP CDM',
  avatar: 'R',
  color:  'bg-brand-gold',
};

export function UserProvider({ children }) {
  return (
    <UserContext.Provider value={{ currentUser: RESEARCHER }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
