import { useEffect, useState, useCallback } from 'react';
import { api, setUnauthorizedHandler } from './api/client';
import type { ResumeProfile, Lead } from './types';
import { ProfileEditor } from './components/ProfileEditor';
import { LeadForm } from './components/LeadForm';
import { LeadList } from './components/LeadList';
import { DraftPanel } from './components/DraftPanel';
import { LeadTimeline } from './components/LeadTimeline';
import { Dashboard } from './components/Dashboard';
import { QuotaBar } from './components/QuotaBar';
import { LoginScreen } from './components/LoginScreen';

// 'checking' covers the moment the stored token is being validated against
// the server; the app must render neither the dashboard nor the login
// screen while that's in flight (either would flash something wrong for an
// instant — dashboard chrome to a logged-out visitor, or a login prompt
// over a session that's actually still valid).
type SessionState = 'checking' | 'authenticated' | 'anonymous';

// null = no explicit choice made yet, follow the OS/browser preference
// (styles.css's `prefers-color-scheme` block). An explicit choice is
// persisted so it survives a reload and overrides the OS preference from
// then on, via the `data-theme` attribute styles.css also checks for.
type ThemeChoice = 'light' | 'dark' | null;
const THEME_STORAGE_KEY = 'outreach_copilot_theme';

export function App() {
  const [session, setSession] = useState<SessionState>('checking');
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [draftsToday, setDraftsToday] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped whenever a draft is generated or marked sent, so LeadTimeline
  // knows to re-fetch — its data isn't derivable from `leads` state, which
  // only carries one overall status, not a per-channel history.
  const [historyVersion, setHistoryVersion] = useState(0);
  const [theme, setTheme] = useState<ThemeChoice>(() => (localStorage.getItem(THEME_STORAGE_KEY) as ThemeChoice) ?? null);

  useEffect(() => {
    if (theme) {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } else {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem(THEME_STORAGE_KEY);
    }
  }, [theme]);

  const isDark = theme === 'dark' || (theme === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const toggleTheme = useCallback(() => setTheme(isDark ? 'light' : 'dark'), [isDark]);

  const refreshUsage = useCallback(() => {
    api.getUsage().then((u) => setDraftsToday(u.drafts_today)).catch(() => {});
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setSession('anonymous'));
    api.checkSession().then((valid) => setSession(valid ? 'authenticated' : 'anonymous'));
  }, []);

  useEffect(() => {
    if (session !== 'authenticated') return;
    Promise.all([api.getProfile(), api.listLeads(), api.getUsage()])
      .then(([p, l, u]) => {
        setProfile(p);
        setLeads(l);
        setDraftsToday(u.drafts_today);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load'));
  }, [session]);

  function handleLeadCreated(lead: Lead) {
    setLeads((prev) => [lead, ...prev]);
    setSelectedLeadId(lead.id);
  }

  function handleLeadChanged(updated: Lead) {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  function handleLeadDeleted(id: number) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setSelectedLeadId((current) => (current === id ? null : current));
  }

  const selectedLead = leads.find((l) => l.id === selectedLeadId) ?? null;
  const hasProfile = Boolean(profile?.content_text?.trim());
  const hasCvFile = Boolean(profile?.cv_file_name);

  if (session === 'checking') {
    // Deliberately blank rather than a spinner or any dashboard chrome —
    // this state exists specifically so an unauthenticated visitor never
    // sees a flash of "there might be something here" before the login
    // screen takes over.
    return null;
  }

  if (session === 'anonymous') {
    return <LoginScreen onLoggedIn={() => setSession('authenticated')} />;
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>Outreach Copilot</h1>
        <div className="app__header-actions">
          <QuotaBar draftsToday={draftsToday} />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={toggleTheme}
          >
            {isDark ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              api.logout();
              setSession('anonymous');
            }}
          >
            Log out
          </button>
        </div>
      </header>

      {loadError && <p className="error-text">{loadError}</p>}

      <Dashboard refreshKey={historyVersion + leads.length} />

      <main className="app__grid">
        <div className="app__column">
          <ProfileEditor profile={profile} onSaved={setProfile} />
          <LeadForm onCreated={handleLeadCreated} />
          <LeadList
            leads={leads}
            selectedLeadId={selectedLeadId}
            onSelect={setSelectedLeadId}
            onChanged={handleLeadChanged}
            onDeleted={handleLeadDeleted}
          />
        </div>
        <div className="app__column">
          <DraftPanel
            lead={selectedLead}
            hasProfile={hasProfile}
            hasCvFile={hasCvFile}
            onLeadChanged={handleLeadChanged}
            onDraftGenerated={refreshUsage}
            onHistoryChanged={() => setHistoryVersion((v) => v + 1)}
          />
          <LeadTimeline lead={selectedLead} refreshKey={historyVersion} />
        </div>
      </main>
    </div>
  );
}
