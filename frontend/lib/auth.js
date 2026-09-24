const STORAGE_KEY = 'smartbreath-user';

export function createAuthClient() {
  return {
    currentUser() {
      if (typeof window === 'undefined') return null;
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    },
    persist(user) { if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user)); },
    signIn() { throw new Error('Configure the Cognito client adapter before using production sign-in.'); },
    signOut() { if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY); }
  };
}
