import { decodeIdToken, Google } from 'arctic';
import type { SsoProfile } from './users';

/**
 * SSO providers hosts can sign in with. Adding one (LINE, GitHub, Microsoft…) means adding an
 * entry here plus its client id/secret; the routes and pages pick it up automatically.
 */
export interface SsoProvider {
  id: string;
  label: string;
  enabled: (env: Env) => boolean;
  authorizationUrl: (env: Env, redirectUri: string, state: string, codeVerifier: string) => URL;
  fetchProfile: (
    env: Env,
    redirectUri: string,
    code: string,
    codeVerifier: string,
  ) => Promise<SsoProfile>;
}

interface GoogleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

const google: SsoProvider = {
  id: 'google',
  label: '使用 Google 登入',
  enabled: (env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  authorizationUrl: (env, redirectUri, state, codeVerifier) =>
    new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri).createAuthorizationURL(
      state,
      codeVerifier,
      ['openid', 'email', 'profile'],
    ),
  fetchProfile: async (env, redirectUri, code, codeVerifier) => {
    const client = new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);
    const tokens = await client.validateAuthorizationCode(code, codeVerifier);
    // The ID token comes straight from Google's token endpoint over TLS, so it is not re-verified.
    const claims = decodeIdToken(tokens.idToken()) as GoogleIdTokenClaims;
    return {
      provider: 'google',
      providerUserId: claims.sub,
      email: claims.email_verified ? (claims.email ?? null) : null,
      name: claims.name ?? null,
      picture: claims.picture ?? null,
    };
  },
};

export const SSO_PROVIDERS: SsoProvider[] = [google];

export function findProvider(id: string) {
  return SSO_PROVIDERS.find((provider) => provider.id === id);
}
