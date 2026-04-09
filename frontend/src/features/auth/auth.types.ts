export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthUser = {
  createdAt?: string;
  email: string;
  id: string;
  name?: string | null;
};

export type StoredAuthSession = {
  tokens: AuthTokens;
  user: AuthUser | null;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  email: string;
  name?: string;
  password: string;
};

export type RefreshPayload = {
  refreshToken: string;
};

export type AuthStatus = 'bootstrapping' | 'anonymous' | 'authenticated';

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    createdAt: string;
    email: string;
    id: string;
    name?: string | null;
  };
};

export type MeResponse = {
  user: {
    email: string;
    exp: number;
    iat: number;
    sub: string;
  };
};
