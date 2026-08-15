// Hand-rolled node:test runner, no framework — matching the house
// convention (portbill/tests/vat.test.js). Run with:
//   node --test --experimental-strip-types tests/*.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDraftPrompt, FORBIDDEN_CLAIMS, type DraftPromptInput } from '../worker/lib/prompt.ts';

const baseLead = {
  company_name: 'Acme Logistics',
  url: 'https://acme.example.com',
  contact_name: null as string | null,
  fetched_context: null as string | null,
};

// Every call below overrides only what a given test cares about, so adding a
// new required DraftPromptInput field later only means updating this one
// object, not every test.
const base: DraftPromptInput = {
  resumeText: 'Some resume text.',
  lead: baseLead,
  tone: 'formal',
  portfolioLink: null,
  hasCvFile: false,
};

test('system prompt names every forbidden claim explicitly', () => {
  const [system] = buildDraftPrompt(base);
  for (const claim of FORBIDDEN_CLAIMS) {
    assert.ok(
      system.content.includes(claim),
      `system prompt must explicitly forbid "${claim}" — if this fails, the honesty guard was edited out`
    );
  }
});

test('system prompt carries the core honesty rules', () => {
  const [system] = buildDraftPrompt(base);
  assert.match(system.content, /Only claim skills and experience that appear in the resume text/);
  assert.match(system.content, /self-directed practice in progress/);
  assert.match(system.content, /primary professional identity/);
});

test('formal and casual tones produce different instructions', () => {
  const [formal] = buildDraftPrompt({ ...base, resumeText: 'x', tone: 'formal' });
  const [casual] = buildDraftPrompt({ ...base, resumeText: 'x', tone: 'casual' });
  assert.notEqual(formal.content, casual.content);
  assert.match(formal.content, /formal and professional/);
  assert.match(casual.content, /casual and direct/);
});

test('user message includes resume text, company name, and URL', () => {
  const [, user] = buildDraftPrompt({
    ...base,
    resumeText: 'MD Samiul Alam Sumel, 12+ years port operations.',
  });
  assert.match(user.content, /MD Samiul Alam Sumel/);
  assert.match(user.content, /Acme Logistics/);
  assert.match(user.content, /https:\/\/acme\.example\.com/);
});

test('missing contact name falls back to a generic-greeting instruction, not a fabricated name', () => {
  const [, user] = buildDraftPrompt({ ...base, resumeText: 'x' });
  assert.match(user.content, /generic greeting/);
});

test('a known contact name is passed through for a personalized greeting', () => {
  const [, user] = buildDraftPrompt({
    ...base,
    resumeText: 'x',
    lead: { ...baseLead, contact_name: 'Jane Doe' },
  });
  assert.match(user.content, /addressed to Jane Doe/);
});

test('no fetched company context tells the model not to invent company details', () => {
  const [, user] = buildDraftPrompt({ ...base, resumeText: 'x' });
  assert.match(user.content, /Do not invent details about the company/);
});

test('portfolio link, when set, is required verbatim in the sign-off instruction', () => {
  const [system] = buildDraftPrompt({ ...base, resumeText: 'x', portfolioLink: 'https://sasumel.pages.dev' });
  assert.match(system.content, /https:\/\/sasumel\.pages\.dev/);
});

test('no portfolio link means no sign-off-link instruction at all', () => {
  const [system] = buildDraftPrompt({ ...base, resumeText: 'x', portfolioLink: null });
  assert.doesNotMatch(system.content, /portfolio link/i);
});

test('hasCvFile: true permits mentioning an attached CV', () => {
  const [system] = buildDraftPrompt({ ...base, resumeText: 'x', hasCvFile: true });
  assert.match(system.content, /CV is attached/);
});

test('hasCvFile: false explicitly forbids mentioning an attachment — the honesty guard extends here too', () => {
  const [system] = buildDraftPrompt({ ...base, resumeText: 'x', hasCvFile: false });
  assert.match(system.content, /Do not mention an attached CV/);
});
