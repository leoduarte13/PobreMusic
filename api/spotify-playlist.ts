// Keep playlist requests on the unified Spotify authentication/API handler.
// This prevents the legacy public-playlist scraper from bypassing the existing
// OAuth/session/token implementation in api/index.ts.
export { default } from './index';
