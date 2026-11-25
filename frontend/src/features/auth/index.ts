export interface LoginCredentials {
  email: string;
  password?: string;
}

export function validateLoginCredentials(credentials: LoginCredentials): { isValid: boolean; error?: string } {
  if (!credentials.email || !credentials.email.includes('@')) {
    return { isValid: false, error: 'A valid email is required.' };
  }
  if (!credentials.password || credentials.password.length === 0) {
    return { isValid: false, error: 'Password is required.' };
  }
  return { isValid: true };
}

export async function loginAction(credentials: LoginCredentials) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  return res.json();
}

export async function logoutAction() {
  const res = await fetch('/api/auth/logout', { method: 'POST' });
  return res.json();
}

export async function getMeAction() {
  const res = await fetch('/api/auth/me');
  return res.json();
}

