import type { Lead, Tone } from '../types';

// Skills/tools the AI must never attribute to the user in a generated email.
// Sourced from 00.Resume/samiulAsumel.cv/CLAUDE.md's "hard content rules" —
// that file is the single source of truth for what's actually true about
// the user's background, built up over multiple corrections to the CV
// content. An outreach email is a claim made to a stranger with the user's
// name on it, so it inherits the same honesty bar as the CV itself, not a
// looser "sounds impressive" one. Keep this list in sync with that file's
// "Do not re-add" bullet if it's ever updated.
export const FORBIDDEN_CLAIMS = [
  'SELinux',
  'Podman',
  'firewalld',
  'Ansible',
  'n8n',
  'Kubernetes',
  'AWS certified',
  'PMP',
] as const;

const HONESTY_RULES = `Hard rules — do not violate these, even if it would make the email more persuasive:
- Only claim skills and experience that appear in the resume text below. Do not invent metrics, employers, job titles, certifications, or years of experience.
- Never claim: ${FORBIDDEN_CLAIMS.join(', ')}. If any of these appear in the resume text as "in progress," describe them the same way — never as completed or certified.
- RHCSA/RHCE, if mentioned in the resume, is self-directed practice in progress, never a held certification.
- The port operations background is the primary professional identity — do not reduce it to a footnote in favor of the software skills.
- No marketing slogans, no "synergy"/"passionate"/"rockstar" language, no emoji, no arrow-chain buzzword formulas ("identify → analyze → design → build"). Write like a specific person describing specific work.`;

function toneInstruction(tone: Tone): string {
  return tone === 'formal'
    ? 'Tone: formal and professional. Full sentences, no contractions, address the recipient respectfully.'
    : 'Tone: casual and direct, like a note to a peer. Contractions are fine. Still respectful, not flippant.';
}

export interface DraftPromptInput {
  resumeText: string;
  lead: Pick<Lead, 'company_name' | 'url' | 'contact_name' | 'fetched_context'>;
  tone: Tone;
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

// Pure and side-effect free on purpose: worker/lib/ai.ts is the only place
// that touches the network, so this function can be unit tested (see
// tests/prompt.test.ts) without a Workers AI binding or any mocking.
export function buildDraftPrompt(input: DraftPromptInput): ChatMessage[] {
  const { resumeText, lead, tone } = input;
  const greeting = lead.contact_name ? `addressed to ${lead.contact_name}` : 'with a generic greeting (no contact name is known)';
  const companyContext = lead.fetched_context
    ? `Additional context fetched from the company's website:\n${lead.fetched_context}`
    : `No additional company context is available yet — write from the company name and resume alone. Do not invent details about the company.`;

  const system = `You write cold outreach emails on behalf of a real job seeker. Every email you draft will be reviewed and edited by them before sending, but it must be honest and specific as written.

${HONESTY_RULES}

${toneInstruction(tone)}

Output only the email body (including a subject line as the first line, prefixed "Subject: "). No preamble, no explanation, no markdown formatting.`;

  const user = `Resume / background:
${resumeText}

Target company: ${lead.company_name}
Company URL: ${lead.url}
${companyContext}

Write a short cold outreach email (120-200 words) ${greeting}, connecting the resume background to what this company likely needs, and asking for a conversation.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
