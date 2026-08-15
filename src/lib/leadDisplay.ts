import type { Lead } from '../types';

// A lead can be a company, a person, or both — never neither (enforced
// server-side in worker/routes/leads.ts). This is the one place that picks
// what to call it when company_name is absent, so LeadList and DraftPanel
// can't drift on the fallback order.
export function leadDisplayName(lead: Pick<Lead, 'company_name' | 'contact_name'>): string {
  return lead.company_name ?? lead.contact_name ?? 'Unnamed lead';
}
