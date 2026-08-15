import { api } from '../api/client';
import { leadDisplayName, LINKEDIN_STATUS_LABEL } from '../lib/leadDisplay';
import type { Lead, LinkedinStatus } from '../types';

interface LeadListProps {
  leads: Lead[];
  selectedLeadId: number | null;
  onSelect: (id: number) => void;
  onChanged: (lead: Lead) => void;
  onDeleted: (id: number) => void;
}

const STATUS_LABEL: Record<Lead['status'], string> = {
  new: 'New',
  drafted: 'Drafted',
  sent: 'Sent',
  replied: 'Replied',
  closed: 'Closed',
};

export function LeadList({ leads, selectedLeadId, onSelect, onChanged, onDeleted }: LeadListProps) {
  async function toggleReplied(lead: Lead) {
    const updated = await api.updateLead(lead.id, { replied: lead.status !== 'replied' });
    onChanged(updated);
  }

  // 'closed' means the user has decided not to pursue this lead further —
  // distinct from 'replied', which just means they heard back and may still
  // be in conversation. Toggling back to 'new' is the only way out of
  // 'closed' short of deleting the lead outright.
  async function toggleClosed(lead: Lead) {
    const updated = await api.updateLead(lead.id, { status: lead.status === 'closed' ? 'new' : 'closed' });
    onChanged(updated);
  }

  async function remove(lead: Lead) {
    await api.deleteLead(lead.id);
    onDeleted(lead.id);
  }

  async function updateLinkedinStatus(lead: Lead, linkedin_status: LinkedinStatus) {
    const updated = await api.updateLead(lead.id, { linkedin_status });
    onChanged(updated);
  }

  if (leads.length === 0) {
    return (
      <section className="panel">
        <h2>Leads</h2>
        <p className="panel__hint">No leads yet — add one above.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Leads ({leads.length})</h2>
      <ul className="lead-list">
        {leads.map((lead) => (
          <li key={lead.id} className={lead.id === selectedLeadId ? 'lead-list__item lead-list__item--active' : 'lead-list__item'}>
            <div className="lead-list__row">
              <button type="button" className="lead-list__main" onClick={() => onSelect(lead.id)}>
                <span className="lead-list__company">{leadDisplayName(lead)}</span>
                <span className={`lead-list__status lead-list__status--${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
              </button>
              <div className="lead-list__actions">
                {lead.status === 'sent' || lead.status === 'replied' ? (
                  <label className="lead-list__replied">
                    <input
                      type="checkbox"
                      checked={lead.status === 'replied'}
                      onChange={() => toggleReplied(lead)}
                    />
                    Replied
                  </label>
                ) : null}
                <button type="button" className="btn btn--ghost" onClick={() => toggleClosed(lead)}>
                  {lead.status === 'closed' ? 'Reopen' : 'Close'}
                </button>
                <button type="button" className="btn btn--danger" onClick={() => remove(lead)} aria-label={`Delete ${leadDisplayName(lead)}`}>
                  Delete
                </button>
              </div>
            </div>
            {lead.linkedin_url && (
              <label className="lead-list__linkedin-status">
                LinkedIn
                <select
                  value={lead.linkedin_status}
                  onChange={(e) => updateLinkedinStatus(lead, e.target.value as LinkedinStatus)}
                >
                  {(Object.keys(LINKEDIN_STATUS_LABEL) as LinkedinStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {LINKEDIN_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
