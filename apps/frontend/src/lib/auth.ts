/**
 * Authentication and Role helpers for RECALL frontend.
 */

export function getUserRole(): 'admin' | 'secretary' {
  try {
    const clerk = (window as unknown as {
      Clerk?: {
        user?: {
          publicMetadata?: { role?: string };
        };
      };
    }).Clerk;

    if (clerk?.user?.publicMetadata?.role === 'admin') {
      return 'admin';
    }
    if (clerk?.user?.publicMetadata?.role === 'secretary') {
      return 'secretary';
    }
  } catch {
    // Ignore in non-browser context
  }

  // Local development / testing role switch support (strictly restricted to DEV environment)
  if (import.meta.env.DEV) {
    const storedRole = typeof localStorage !== 'undefined' ? localStorage.getItem('recall_dev_role') : null;
    if (storedRole === 'admin') {
      return 'admin';
    }
  }

  return 'secretary';
}

export function setDevRole(role: 'admin' | 'secretary') {
  // Never write or allow dev role tampering in production builds
  if (import.meta.env.DEV && typeof localStorage !== 'undefined') {
    localStorage.setItem('recall_dev_role', role);
  }
}
