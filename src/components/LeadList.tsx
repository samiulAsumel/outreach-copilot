import { api } from '../api/client';
import type { Lead } from '../types';

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
};

export function LeadList({ leads, selectedLeadId, onSelect, onChanged, onDeleted }: LeadListProps) {
  async function toggleReplied(lead: Lead) {
    const updated = await api.updateLead(lead.id, { replied: lead.status !== 'replied' });
    onChanged(updated);
  }

  async function remove(lead: Lead) {
    await api.deleteLead(lead.id);
    onDeleted(lead.id);
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
            <button type="button" className="lead-list__main" onClick={() => onSelect(lead.id)}>
              <span className="lead-list__company">{lead.company_name}</span>
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
              <button type="button" className="lead-list__delete" onClick={() => remove(lead)} aria-label={`Delete ${lead.company_name}`}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
