/**
 * Page exports - only eagerly loaded pages.
 *
 * CRITICAL: Do NOT add lazy-loaded pages here.
 * If a page is dynamically imported in lazy.tsx, do not re-export it here,
 * as that would defeat code splitting by including it in the main bundle.
 *
 * For lazy-loaded pages, import from './lazy' instead.
 */

// EAGER PAGES - Critical path (always in main bundle)
// These are needed for initial app render and auth flow
export { Dashboard } from './Dashboard';
export { Login } from './Login';
export { Setup } from './Setup';
export { Callback } from './Callback';

// LAZY PAGES - Import from './lazy' instead
// All other pages are lazy-loaded for code splitting
// See lazy.tsx for the full list of lazy-loaded page exports
