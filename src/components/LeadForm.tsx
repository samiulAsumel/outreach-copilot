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
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
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
        linkedin_url: linkedinUrl || undefined,
        whatsapp_number: whatsappNumber || undefined,
      });
      onCreated(lead);
      setCompanyName('');
      setUrl('');
      setContactName('');
      setContactEmail('');
      setLinkedinUrl('');
      setWhatsappNumber('');
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
      <p className="panel__hint">
        A lead can be a company, a person, or both — provide at least a company name, a
        contact name, or a LinkedIn profile URL.
      </p>
      <form onSubmit={handleSubmit} className="lead-form">
        <label>
          Company name (optional)
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </label>
        <label>
          Company URL (optional)
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://company.example.com"
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
        <label>
          LinkedIn profile URL (optional)
          <input
            type="url"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://linkedin.com/in/..."
          />
        </label>
        <label>
          WhatsApp number (optional)
          <input
            type="tel"
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            placeholder="+880..."
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add lead'}
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}
