import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { Lead } from '../types';

interface LeadFormProps {
  onCreated: (lead: Lead) => void;
}

export function LeadForm({ onCreated }: LeadFormProps) {
  const [companyName, setCompanyName] = useState('');
  const [url, setUrl] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const lead = await api.createLead({
        company_name: companyName,
        url,
        contact_name: contactName || undefined,
        contact_email: contactEmail || undefined,
      });
      onCreated(lead);
      setCompanyName('');
      setUrl('');
      setContactName('');
      setContactEmail('');
    } catch (err) {
      // Route validation (worker/routes/leads.ts) returns per-field messages
      // in `details` — surface those rather than the generic message so a
      // bad URL vs. a missing company name are distinguishable.
      if (err instanceof ApiError && err.details.length > 0) {
        setError(err.details.join('; '));
      } else {
        setError(err instanceof Error ? err.message : 'Failed to add lead');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel">
      <h2>Add a lead</h2>
      <form onSubmit={handleSubmit} className="lead-form">
        <label>
          Company name
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
        </label>
        <label>
          Company URL
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://company.example.com"
            required
          />
        </label>
        <label>
          Contact name (optional)
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </label>
        <label>
          Contact email (optional)
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add lead'}
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}
