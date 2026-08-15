import { useEffect, useState } from 'react';
import { api, cvDownloadUrl } from '../api/client';
import type { Lead, Tone } from '../types';

interface DraftPanelProps {
  lead: Lead | null;
  hasProfile: boolean;
  hasCvFile: boolean;
  onLeadChanged: (lead: Lead) => void;
  onDraftGenerated: () => void;
}

// Subject line comes back as the first line of the draft ("Subject: ...",
// see worker/lib/prompt.ts's output instruction) — split it out so the
// mailto: link can use it as the actual subject instead of the whole body.
function splitSubject(draftText: string): { subject: string; body: string } {
  const lines = draftText.split('\n');
  if (lines[0]?.toLowerCase().startsWith('subject:')) {
    return { subject: lines[0].slice('subject:'.length).trim(), body: lines.slice(1).join('\n').trim() };
  }
  return { subject: '', body: draftText };
}

export function DraftPanel({ lead, hasProfile, hasCvFile, onLeadChanged, onDraftGenerated }: DraftPanelProps) {
  const [tone, setTone] = useState<Tone>('formal');
  const [draftText, setDraftText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sentConfirmed, setSentConfirmed] = useState(false);

  useEffect(() => {
    setDraftText('');
    setError(null);
    setCopied(false);
    setSentConfirmed(false);
  }, [lead?.id]);

  if (!lead) {
    return (
      <section className="panel">
        <h2>Draft</h2>
        <p className="panel__hint">Select a lead to generate a draft.</p>
      </section>
    );
  }

  async function generate() {
    if (!lead) return;
    setGenerating(true);
    setError(null);
    setSentConfirmed(false);
    try {
      const entry = await api.generateDraft(lead.id, tone);
      setDraftText(entry.draft_text);
      onLeadChanged({ ...lead, status: 'drafted' });
      onDraftGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate draft');
    } finally {
      setGenerating(false);
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(draftText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Most commonly a missing clipboard-write permission or an unfocused
      // document — "Open in email client" below is the fallback path.
      setError('Could not copy to clipboard. Select the text above and copy it manually, or use "Open in email client".');
    }
  }

  async function markSent() {
    if (!lead) return;
    setSending(true);
    setError(null);
    try {
      await api.markSent(lead.id, draftText);
      onLeadChanged({ ...lead, status: 'sent' });
      setSentConfirmed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as sent');
    } finally {
      setSending(false);
    }
  }

  const { subject, body } = splitSubject(draftText);
  const mailto = lead.contact_email
    ? `mailto:${encodeURIComponent(lead.contact_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <section className="panel">
      <h2>Draft for {lead.company_name}</h2>

      {!hasProfile && <p className="error-text">Save a resume profile before generating drafts.</p>}

      <div className="draft-panel__controls">
        <label>
          Tone
          <select value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
            <option value="formal">Formal</option>
            <option value="casual">Casual</option>
          </select>
        </label>
        <button type="button" onClick={generate} disabled={generating || !hasProfile}>
          {generating ? 'Generating…' : draftText ? 'Regenerate' : 'Generate draft'}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {draftText && (
        <>
          <textarea
            className="draft-panel__textarea"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={14}
          />
          <div className="panel__actions">
            <button type="button" onClick={copyToClipboard}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
            {hasCvFile && (
              // mailto: links cannot carry attachments (a hard limitation of
              // the URI scheme, not something worth working around) — this
              // is the reminder to grab the file and attach it by hand
              // before actually sending.
              <a className="button-like" href={cvDownloadUrl}>
                Download CV
              </a>
            )}
            <a className="button-like" href={mailto}>
              Open in email client
            </a>
            <button type="button" onClick={markSent} disabled={sending}>
              {sending ? 'Saving…' : 'Mark sent'}
            </button>
            {sentConfirmed && <span className="panel__meta">Logged as sent. Follow up in 7 days if no reply.</span>}
          </div>
        </>
      )}
    </section>
  );
}
