// Which social sign-in buttons are configured, from the environment. Kept
// apart from auth.ts so pages can ask without loading the database drivers.

export type SocialProvider = 'github' | 'google';

export function socialProviders(): SocialProvider[] {
  const out: SocialProvider[] = [];
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) out.push('github');
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) out.push('google');
  return out;
}
