import type { PropsWithChildren } from 'react';
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from 'react';

import { apiRequest, isAuthApiError } from '@/lib/api/api-client';
import { clearActiveHomeSelection } from '@/features/homes/active-home.storage';
import { loginRequest, logoutRequest, meRequest, mergeAuthUsers, refreshRequest, registerRequest } from './auth.api';
import { clearStoredAuthSession, readStoredAuthSession, writeStoredAuthSession } from './auth.storage';
import type {
  AuthStatus,
  AuthTokens,
  AuthUser,
  LoginPayload,
  RegisterPayload,
  StoredAuthSession,
} from './auth.types';

type AuthState = {
  status: AuthStatus;
  tokens: AuthTokens | null;
  user: AuthUser | null;
};

type AuthContextValue = AuthState & {
  authenticatedRequest: <T>(path: string, options?: AuthenticatedRequestOptions) => Promise<T>;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
};

type AuthenticatedRequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  signal?: AbortSignal;
};

type AuthAction =
  | { type: 'SET_ANONYMOUS' }
  | { session: StoredAuthSession; type: 'SET_SESSION' };

const initialState: AuthState = {
  status: 'bootstrapping',
  tokens: null,
  user: null,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const sessionRef = useRef<StoredAuthSession | null>(null);
  const refreshPromiseRef = useRef<Promise<AuthTokens> | null>(null);

  useEffect(() => {
    sessionRef.current = state.status === 'authenticated' && state.tokens
      ? { tokens: state.tokens, user: state.user }
      : null;
  }, [state.status, state.tokens, state.user]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const storedSession = await readStoredAuthSession();

      if (!storedSession) {
        if (!cancelled) {
          dispatch({ type: 'SET_ANONYMOUS' });
        }
        return;
      }

      const nextSession = await restoreStoredSession(storedSession);

      if (cancelled) {
        return;
      }

      if (!nextSession) {
        dispatch({ type: 'SET_ANONYMOUS' });
        return;
      }

      dispatch({ session: nextSession, type: 'SET_SESSION' });
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  async function persistSession(session: StoredAuthSession) {
    sessionRef.current = session;
    await writeStoredAuthSession(session);
    dispatch({ session, type: 'SET_SESSION' });
    return session;
  }

  async function clearSession() {
    refreshPromiseRef.current = null;
    sessionRef.current = null;
    await clearStoredAuthSession();
    await clearActiveHomeSelection();
    dispatch({ type: 'SET_ANONYMOUS' });
  }

  async function refreshTokens() {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const currentSession = sessionRef.current;
    const currentRefreshToken = currentSession?.tokens.refreshToken;

    if (!currentRefreshToken) {
      await clearSession();
      throw new Error('UNAUTHENTICATED');
    }

    const refreshPromise = refreshRequest({ refreshToken: currentRefreshToken })
      .then(async (tokens) => {
        const nextSession = {
          tokens,
          user: currentSession?.user ?? null,
        } satisfies StoredAuthSession;

        await persistSession(nextSession);
        return tokens;
      })
      .catch(async (error) => {
        await clearSession();
        throw error;
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });

    refreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  }

  async function restoreStoredSession(storedSession: StoredAuthSession) {
    try {
      const currentUser = await meRequest(storedSession.tokens.accessToken);
      const nextSession = {
        tokens: storedSession.tokens,
        user: mergeAuthUsers(storedSession.user, currentUser),
      } satisfies StoredAuthSession;

      await writeStoredAuthSession(nextSession);
      return nextSession;
    } catch (error) {
      if (!isAuthApiError(error)) {
        await clearStoredAuthSession();
        return null;
      }
    }

    try {
      const refreshedTokens = await refreshRequest({
        refreshToken: storedSession.tokens.refreshToken,
      });
      const currentUser = await meRequest(refreshedTokens.accessToken);
      const nextSession = {
        tokens: refreshedTokens,
        user: mergeAuthUsers(storedSession.user, currentUser),
      } satisfies StoredAuthSession;

      await writeStoredAuthSession(nextSession);
      return nextSession;
    } catch {
      await clearStoredAuthSession();
      return null;
    }
  }

  async function login(payload: LoginPayload) {
    const session = await loginRequest(payload);
    await clearActiveHomeSelection();
    await persistSession(session);
  }

  async function register(payload: RegisterPayload) {
    const session = await registerRequest(payload);
    await clearActiveHomeSelection();
    await persistSession(session);
  }

  async function logout() {
    const currentRefreshToken = sessionRef.current?.tokens.refreshToken;

    try {
      if (currentRefreshToken) {
        await logoutRequest({ refreshToken: currentRefreshToken });
      }
    } finally {
      await clearSession();
    }
  }

  async function authenticatedRequest<T>(
    path: string,
    options: AuthenticatedRequestOptions = {}
  ) {
    const currentAccessToken = sessionRef.current?.tokens.accessToken;

    if (!currentAccessToken) {
      throw new Error('UNAUTHENTICATED');
    }

    try {
      return await apiRequest<T>(path, {
        ...options,
        accessToken: currentAccessToken,
      });
    } catch (error) {
      if (!isAuthApiError(error)) {
        throw error;
      }

      const refreshedTokens = await refreshTokens();

      return apiRequest<T>(path, {
        ...options,
        accessToken: refreshedTokens.accessToken,
      });
    }
  }

  const value = {
    authenticatedRequest,
    login,
    logout,
    register,
    status: state.status,
    tokens: state.tokens,
    user: state.user,
  } satisfies AuthContextValue;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_ANONYMOUS':
      return {
        status: 'anonymous',
        tokens: null,
        user: null,
      };
    case 'SET_SESSION':
      return {
        status: 'authenticated',
        tokens: action.session.tokens,
        user: action.session.user,
      };
    default:
      return state;
  }
}
