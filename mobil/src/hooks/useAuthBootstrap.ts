import {useEffect} from 'react';
import {getMe} from '../lib/api/endpoints';
import {useAuthStore} from '../store/authStore';

export function useAuthBootstrap() {
  const hasHydrated = useAuthStore(state => state.hasHydrated);
  const token = useAuthStore(state => state.token);
  const setBootstrapping = useAuthStore(state => state.setBootstrapping);
  const setUser = useAuthStore(state => state.setUser);
  const clearSession = useAuthStore(state => state.clearSession);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      if (!token) {
        setBootstrapping(false);
        return;
      }
      try {
        const me = await getMe();
        if (!cancelled) {
          await setUser(me);
        }
      } catch {
        if (!cancelled) {
          clearSession();
        }
      } finally {
        if (!cancelled) {
          setBootstrapping(false);
        }
      }
    }

    bootstrap().catch(() => {
      if (!cancelled) {
        clearSession();
        setBootstrapping(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, token, clearSession, setBootstrapping, setUser]);
}
