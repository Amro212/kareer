import { STORAGE_KEYS, DEFAULT_SETTINGS, DEFAULT_PROFILE, APP_VERSION } from './constants.js';
import { platform } from './platform.js';
import { createWorkEligibility } from './profile.js';

export function gmGet(key, defaultValue = null) {
  return platform.storage.get(key, defaultValue);
}

export function gmSet(key, value) {
  platform.storage.set(key, value);
}

export function gmDelete(key) {
  platform.storage.delete(key);
}

export function getSettings() {
  const stored = gmGet(STORAGE_KEYS.SETTINGS, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(settings) {
  // Ensure we do not accidentally persist secrets in general settings
  const cleanSettings = { ...settings };
  delete cleanSettings.apiKey;
  delete cleanSettings.openRouterApiKey;
  gmSet(STORAGE_KEYS.SETTINGS, cleanSettings);
  return getSettings();
}

export function parseLegacyLocation(locationStr) {
  if (!locationStr || typeof locationStr !== 'string') return {};
  const parts = locationStr.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return { city: parts[0], stateProvince: parts[1], country: parts.slice(2).join(', ') };
  }
  if (parts.length === 2) {
    return { city: parts[0], country: parts[1] };
  }
  if (parts.length === 1) {
    return { city: parts[0] };
  }
  return {};
}

export function getProfile() {
  const stored = gmGet(STORAGE_KEYS.PROFILE, {});
  const legacyAddress = (!stored.city && !stored.country && stored.location)
    ? parseLegacyLocation(stored.location)
    : {};

  let workEligibilities = Array.isArray(stored?.workEligibilities) ? stored.workEligibilities : [];
  if (workEligibilities.length === 0 && (stored?.workCountry || stored?.workAuthorization)) {
    workEligibilities = [createWorkEligibility({
      country: stored.workCountry || '',
      workAuthorization: stored.workAuthorization || '',
      sponsorshipNow: stored.sponsorshipNow || '',
      sponsorshipFuture: stored.sponsorshipFuture || '',
    })];
  }

  const merged = {
    ...DEFAULT_PROFILE,
    ...legacyAddress,
    ...stored,
    workEligibilities: workEligibilities.map(createWorkEligibility),
    workExperiences: Array.isArray(stored?.workExperiences) ? stored.workExperiences : [],
    education: Array.isArray(stored?.education) ? stored.education : [],
    projects: Array.isArray(stored?.projects) ? stored.projects : [],
    skills: Array.isArray(stored?.skills) ? stored.skills : [],
  };
  if (!merged.location) {
    merged.location = [merged.city, merged.stateProvince, merged.country].filter(Boolean).join(', ');
  }
  const primaryElig = merged.workEligibilities.find(e => e && e.enabled !== false) || merged.workEligibilities[0];
  if (primaryElig) {
    if (!merged.workCountry) merged.workCountry = primaryElig.country;
    if (!merged.workAuthorization) merged.workAuthorization = primaryElig.workAuthorization;
    if (!merged.sponsorshipNow) merged.sponsorshipNow = primaryElig.sponsorshipNow;
    if (!merged.sponsorshipFuture) merged.sponsorshipFuture = primaryElig.sponsorshipFuture;
  }
  return merged;
}

export function saveProfile(profile) {
  const synthesizedLocation = [profile?.city, profile?.stateProvince, profile?.country].filter(Boolean).join(', ');

  let eligibilities = Array.isArray(profile?.workEligibilities) ? [...profile.workEligibilities] : [];
  if (eligibilities.length === 0 && (profile?.workCountry || profile?.workAuthorization)) {
    eligibilities.push(createWorkEligibility({
      country: profile.workCountry || '',
      workAuthorization: profile.workAuthorization || '',
      sponsorshipNow: profile.sponsorshipNow || '',
      sponsorshipFuture: profile.sponsorshipFuture || '',
    }));
  }

  const primaryElig = eligibilities.find(e => e && e.enabled !== false) || eligibilities[0];
  const workCountry = primaryElig?.country !== undefined ? primaryElig.country : (profile?.workCountry || '');
  const workAuthorization = primaryElig?.workAuthorization !== undefined ? primaryElig.workAuthorization : (profile?.workAuthorization || '');
  const sponsorshipNow = primaryElig?.sponsorshipNow !== undefined ? primaryElig.sponsorshipNow : (profile?.sponsorshipNow || '');
  const sponsorshipFuture = primaryElig?.sponsorshipFuture !== undefined ? primaryElig.sponsorshipFuture : (profile?.sponsorshipFuture || '');

  const cleanProfile = {
    ...DEFAULT_PROFILE,
    ...profile,
    workCountry,
    workAuthorization,
    sponsorshipNow,
    sponsorshipFuture,
    location: profile?.location?.trim() ? profile.location.trim() : synthesizedLocation,
    workEligibilities: eligibilities.map(createWorkEligibility),
    workExperiences: Array.isArray(profile?.workExperiences) ? profile.workExperiences : [],
    education: Array.isArray(profile?.education) ? profile.education : [],
    projects: Array.isArray(profile?.projects) ? profile.projects : [],
    skills: Array.isArray(profile?.skills) ? profile.skills : [],
  };
  gmSet(STORAGE_KEYS.PROFILE, cleanProfile);
  return getProfile();
}

/**
 * Returns '' on hosts that keep the key out of this context (extension content
 * scripts). Use hasApiKey() for presence checks so those hosts still work.
 */
export function getApiKey() {
  return platform.secrets.read();
}

export function hasApiKey() {
  return platform.secrets.has();
}

export function saveApiKey(apiKey) {
  platform.secrets.write(apiKey);
}

export function clearApiKey() {
  platform.secrets.clear();
}

export function getDebugLogs() {
  return gmGet(STORAGE_KEYS.DEBUG, []);
}

export function saveDebugLogs(logs) {
  gmSet(STORAGE_KEYS.DEBUG, logs);
}

export function clearDebugLogs() {
  gmSet(STORAGE_KEYS.DEBUG, []);
}

export function initializeStorage() {
  const currentVer = gmGet(STORAGE_KEYS.VERSION);
  if (!currentVer) {
    gmSet(STORAGE_KEYS.VERSION, APP_VERSION);
  }
}

export function getSanitizedState() {
  const settings = getSettings();
  const profile = getProfile();

  return {
    version: APP_VERSION,
    hasApiKey: hasApiKey(),
    settings,
    profileSummary: {
      hasFullName: Boolean(profile.fullName),
      hasEmail: Boolean(profile.email),
      hasResumeContext: Boolean(profile.resumeContext || profile.workExperiences?.length || profile.education?.length || profile.projects?.length || profile.skills?.length),
    },
    url: window.location.href,
    host: window.location.hostname,
    timestamp: new Date().toISOString(),
  };
}

export function resetAll() {
  for (const id of gmGet(STORAGE_KEYS.SESSIONS, [])) gmDelete(`${STORAGE_KEYS.SESSIONS}:${id}`);
  gmDelete(STORAGE_KEYS.SESSIONS);
  gmDelete(STORAGE_KEYS.JOB);
  gmDelete(STORAGE_KEYS.MEMORY);
  gmDelete(STORAGE_KEYS.SETTINGS);
  gmDelete(STORAGE_KEYS.PROFILE);
  clearApiKey();
  gmDelete(STORAGE_KEYS.DEBUG);
  gmSet(STORAGE_KEYS.VERSION, APP_VERSION);
}
