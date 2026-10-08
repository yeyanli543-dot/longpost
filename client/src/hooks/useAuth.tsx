import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  getToken,
  setToken,
  clearToken,
  getCurrentUser,
  login as apiLogin,
  register as apiRegister,
  updateProfile as apiUpdateProfile,
  changePassword as apiChangePassword,
  updatePreferences as apiUpdatePreferences,
  handleGoogleCallback,
} from '@client/src/api/auth';
import { loginWithCode as apiLoginWithCode } from '@client/src/api/access-codes';
import type {
  UserProfile,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  ChangePasswordRequest,
  UpdatePreferencesRequest,
  AuthResponse,
} from '@shared/api.interface';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (data: LoginRequest) => Promise<UserProfile>;
  loginWithCode: (code: string) => Promise<UserProfile>;
  register: (data: RegisterRequest) => Promise<UserProfile>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateProfile: (data: UpdateProfileRequest) => Promise<void>;
  changePassword: (data: ChangePasswordRequest) => Promise<void>;
  updatePreferences: (data: UpdatePreferencesRequest) => Promise<void>;
  setAuthFromOAuth: (provider: string, code: string, state?: string) => Promise<UserProfile & { redirectTo?: string }>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      setUser(null);
      return;
    }

    // 冷启动、容器刚起来、网络抖动时后端可能还没就绪。
    // 以前一次失败就当作未登录，表现就是"明明刚登录，刷新一下又要登录"。
    // 现在只认 401，其它情况重试一次，并且不动本地 token。
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const currentUser = await getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
        } else {
          clearToken();
          setUser(null);
        }
        setLoading(false);
        return;
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401) {
          logger.warn('Token 无效，清除登录态');
          clearToken();
          setUser(null);
          setLoading(false);
          return;
        }
        logger.warn(
          `获取当前用户失败（第 ${attempt + 1} 次，非 401），保留本地 token`,
          err,
        );
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    const handleAuthLogout = (): void => {
      setUser(null);
    };
    window.addEventListener('auth:logout', handleAuthLogout);
    return () => window.removeEventListener('auth:logout', handleAuthLogout);
  }, []);

  const login = useCallback(async (data: LoginRequest): Promise<UserProfile> => {
    const response = await apiLogin(data);
    setToken(response.token);
    setUser(response.user as UserProfile);
    return response.user as UserProfile;
  }, []);

  const loginWithCode = useCallback(async (code: string): Promise<UserProfile> => {
    const response = await apiLoginWithCode(code);
    setToken(response.token);
    setUser(response.user as UserProfile);
    return response.user as UserProfile;
  }, []);

  const register = useCallback(async (data: RegisterRequest): Promise<UserProfile> => {
    const response = await apiRegister(data);
    setToken(response.token);
    setUser(response.user as UserProfile);
    return response.user as UserProfile;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    await fetchUser();
  }, [fetchUser]);

  const updateProfile = useCallback(async (data: UpdateProfileRequest) => {
    const updated = await apiUpdateProfile(data);
    setUser(updated);
  }, []);

  const changePassword = useCallback(async (data: ChangePasswordRequest) => {
    await apiChangePassword(data);
  }, []);

  const updatePreferences = useCallback(async (data: UpdatePreferencesRequest) => {
    const updated = await apiUpdatePreferences(data);
    setUser(updated);
  }, []);

  const setAuthFromOAuth = useCallback(
    async (provider: string, code: string, state?: string): Promise<UserProfile & { redirectTo?: string }> => {
      let response: AuthResponse & { redirectTo?: string };
      if (provider === 'google') {
        response = await handleGoogleCallback(code, state);
      } else {
        throw new Error('不支持的登录方式');
      }
      setToken(response.token);
      setUser(response.user as UserProfile);
      return { ...(response.user as UserProfile), redirectTo: response.redirectTo };
    },
    [],
  );

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      loginWithCode,
      register,
      logout,
      refreshUser,
      updateProfile,
      changePassword,
      updatePreferences,
      setAuthFromOAuth,
      isAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
