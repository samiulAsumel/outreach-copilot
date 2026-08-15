import { useEffect, useState, useCallback } from 'react';
import { api } from './api/client';
import type { ResumeProfile, Lead } from './types';
import { ProfileEditor } from './components/ProfileEditor';
import { LeadForm } from './components/LeadForm';
import { LeadList } from './components/LeadList';
import { DraftPanel } from './components/DraftPanel';
import { QuotaBar } from './components/QuotaBar';

export function App() {
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [draftsToday, setDraftsToday] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshUsage = useCallback(() => {
    api.getUsage().then((u) => setDraftsToday(u.drafts_today)).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([api.getProfile(), api.listLeads(), api.getUsage()])
      .then(([p, l, u]) => {
        setProfile(p);
        setLeads(l);
        setDraftsToday(u.drafts_today);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

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

  return (
    <div className="app">
      <header className="app__header">
        <h1>Outreach Copilot</h1>
        <QuotaBar draftsToday={draftsToday} />
      </header>

      {loadError && <p className="error-text">{loadError}</p>}

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
            onLeadChanged={handleLeadChanged}
            onDraftGenerated={refreshUsage}
          />
        </div>
      </main>
    </div>
  );
}
