import type { Env, LeadStatus, LinkedinStatus } from '../types';
import { jsonOk, noContent, badRequest, notFound } from '../lib/http';
import * as db from '../lib/db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATUSES: LeadStatus[] = ['new', 'drafted', 'sent', 'replied', 'closed'];
const VALID_LINKEDIN_STATUSES: LinkedinStatus[] = ['not_connected', 'requested', 'connected'];

export async function handleListLeads(env: Env): Promise<Response> {
  return jsonOk(await db.listLeads(env));
}

export async function handleCreateLead(request: Request, env: Env): Promise<Response> {
  const body = await request.json<Record<string, unknown>>().catch(() => null);
  if (!body) {
    throw badRequest('Request body must be JSON');
  }

  const companyName = typeof body.company_name === 'string' && body.company_name.trim() ? body.company_name.trim() : null;
  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  const contactName = typeof body.contact_name === 'string' && body.contact_name.trim() ? body.contact_name.trim() : null;
  const contactEmail = typeof body.contact_email === 'string' && body.contact_email.trim() ? body.contact_email.trim() : null;
  const linkedinUrl = typeof body.linkedin_url === 'string' && body.linkedin_url.trim() ? body.linkedin_url.trim() : null;
  const whatsappNumber = typeof body.whatsapp_number === 'string' && body.whatsapp_number.trim() ? body.whatsapp_number.trim() : null;

  const details: string[] = [];
  if (companyName && companyName.length > 200) {
    details.push('company_name must be 200 characters or fewer');
  }
  // url is optional now (a person-only lead has no company site to store),
  // but if one is given it still has to actually be a URL.
  let parsedUrl: URL | null = null;
  if (rawUrl) {
    try {
      parsedUrl = new URL(rawUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        details.push('url must be http(s)');
      }
    } catch {
      details.push('url must be a valid absolute URL, e.g. https://example.com');
    }
  }
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    details.push('contact_email is not a valid email address');
  }
  if (linkedinUrl) {
    try {
      new URL(linkedinUrl);
    } catch {
      details.push('linkedin_url must be a valid absolute URL');
    }
  }
  // A lead has to be identifiable as *something* — a company, a named
  // contact, or a LinkedIn profile — but not necessarily all three now
  // that a lead can be just a person with no company attached.
  if (!companyName && !contactName && !linkedinUrl) {
    details.push('Provide at least a company name, a contact name, or a LinkedIn profile URL');
  }
  if (details.length > 0) {
    throw badRequest('Invalid lead data', details);
  }

  const lead = await db.createLead(env, {
    companyName,
    url: parsedUrl ? parsedUrl.toString() : null,
    contactName,
    contactEmail,
    linkedinUrl,
    whatsappNumber,
  });
  return jsonOk(lead, 'Lead created', 201);
}

export async function handleUpdateLead(request: Request, env: Env, id: number): Promise<Response> {
  const existing = await db.getLead(env, id);
  if (!existing) {
    throw notFound('Lead');
  }

  const body = await request.json<Record<string, unknown>>().catch(() => null);
  if (!body) {
    throw badRequest('Request body must be JSON');
  }

  if (typeof body.replied === 'boolean') {
    const updated = await db.setLeadReplied(env, id, body.replied);
    return jsonOk(updated, 'Lead updated');
  }

  if (typeof body.status === 'string') {
    if (!VALID_STATUSES.includes(body.status as LeadStatus)) {
      throw badRequest('status must be one of: ' + VALID_STATUSES.join(', '));
    }
    const updated = await db.updateLeadStatus(env, id, body.status as LeadStatus);
    return jsonOk(updated, 'Lead updated');
  }

  if (typeof body.linkedin_status === 'string') {
    if (!VALID_LINKEDIN_STATUSES.includes(body.linkedin_status as LinkedinStatus)) {
      throw badRequest('linkedin_status must be one of: ' + VALID_LINKEDIN_STATUSES.join(', '));
    }
    const updated = await db.updateLeadLinkedinStatus(env, id, body.linkedin_status as LinkedinStatus);
    return jsonOk(updated, 'Lead updated');
  }

  throw badRequest('Nothing to update — provide status, replied, or linkedin_status');
}

export async function handleDeleteLead(env: Env, id: number): Promise<Response> {
  const existing = await db.getLead(env, id);
  if (!existing) {
    throw notFound('Lead');
  }
  await db.deleteLead(env, id);
  return noContent();
}
