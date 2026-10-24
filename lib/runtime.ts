// lib/runtime.ts
// Where the Homedash API lives. On the Vercel site it's the same origin ('').
// When Homedash runs inside Home Assistant, the panel sets this to the Vercel origin
// the panel script was loaded from, so PIN login and recipe import still reach /api.

let apiBase = '';

export const setApiBase = (base: string) => {
  apiBase = base.replace(/\/$/, '');
};

export const apiUrl = (path: string) => `${apiBase}${path}`;
