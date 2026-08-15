import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { CHANNEL_LABEL } from '../lib/channels';
import type { Lead, OutreachLogEntry } from '../types';

interface LeadTimelineProps {
  lead: Lead | null;
  // Bumped by DraftPanel whenever a draft is generated or marked sent — the
  // history has no other signal to know it's stale, since it's fetched
  // independently of the lead object itself (which only carries a single
  // overall `status`, not per-channel history).
  refreshKey: number;
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '';
}

function isOverdue(followupDueDate: string | null, replied: 0 | 1): boolean {
  if (!followupDueDate || replied) return false;
  return new Date(followupDueDate) < new Date();
}

function EntryRow({ entry }: { entry: OutreachLogEntry }) {
  const overdue = isOverdue(entry.followup_due_date, entry.replied);
  return (
    <li className="lead-timeline__entry">
      <div className="lead-timeline__entry-header">
        <span className="lead-timeline__channel">{CHANNEL_LABEL[entry.channel]}</span>
        {entry.tone && <span className="lead-timeline__tone">{entry.tone}</span>}
      </div>
      <div className="lead-timeline__meta">
        <span>Drafted {formatDate(entry.created_at)}</span>
        {entry.sent_at && <span>Sent {formatDate(entry.sent_at)}</span>}
        {entry.replied === 1 && <span className="lead-timeline__replied-badge">Replied</span>}
        {overdue && <span className="lead-timeline__overdue-badge">Follow-up overdue</span>}
      </div>
    </li>
  );
}

export function LeadTimeline({ lead, refreshKey }: LeadTimelineProps) {
  const [history, setHistory] = useState<OutreachLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lead) {
      setHistory([]);
      return;
    }
    api
      .getLeadHistory(lead.id)
      .then(setHistory)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load history'));
  }, [lead, refreshKey]);

  if (!lead) {
    return null;
  }

  return (
    <section className="panel">
      <h2>Outreach history for {lead.company_name}</h2>
      {error && <p className="error-text">{error}</p>}
      {history.length === 0 ? (
        <p className="panel__hint">Nothing drafted for this lead yet.</p>
      ) : (
        <ul className="lead-timeline">
          {history.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
}
