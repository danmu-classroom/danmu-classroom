export interface User {
  id: number;
  email: string | null;
  name: string | null;
  picture: string | null;
}

export interface SsoProfile {
  provider: string;
  providerUserId: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

/** Finds the user behind an SSO identity, creating both on first login; refreshes the profile. */
export async function upsertSsoUser(db: D1Database, profile: SsoProfile): Promise<User> {
  const existing = await db
    .prepare('SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?')
    .bind(profile.provider, profile.providerUserId)
    .first<{ user_id: number }>();

  if (existing) {
    const user = await db
      .prepare(
        `UPDATE users SET email = ?, name = ?, picture = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? RETURNING id, email, name, picture`,
      )
      .bind(profile.email, profile.name, profile.picture, existing.user_id)
      .first<User>();
    if (!user) throw new Error('user disappeared');
    return user;
  }

  const user = await db
    .prepare(
      'INSERT INTO users (email, name, picture) VALUES (?, ?, ?) RETURNING id, email, name, picture',
    )
    .bind(profile.email, profile.name, profile.picture)
    .first<User>();
  if (!user) throw new Error('could not create user');
  await db
    .prepare('INSERT INTO oauth_accounts (provider, provider_user_id, user_id) VALUES (?, ?, ?)')
    .bind(profile.provider, profile.providerUserId, user.id)
    .run();
  return user;
}
