import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { CHANNEL_LABEL } from '../lib/channels';
import type { Lead, Tone, Channel } from '../types';

interface DraftPanelProps {
  lead: Lead | null;
  hasProfile: boolean;
  hasCvFile: boolean;
  onLeadChanged: (lead: Lead) => void;
  onDraftGenerated: () => void;
  onHistoryChanged: () => void;
}

// Only email's prompt asks the model for a "Subject: ..." first line
// (worker/lib/prompt.ts's CHANNEL_SPECS) — every other channel returns a
// plain body with no line to strip.
function splitSubject(draftText: string): { subject: string; body: string } {
  const lines = draftText.split('\n');
  if (lines[0]?.toLowerCase().startsWith('subject:')) {
    return { subject: lines[0].slice('subject:'.length).trim(), body: lines.slice(1).join('\n').trim() };
  }
  return { subject: '', body: draftText };
}

// wa.me has no way to pre-select a specific contact by name, only by phone
// number — strip everything but digits since users may paste a number with
// spaces, dashes, or a leading +.
function whatsappNumberDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function DraftPanel({ lead, hasProfile, hasCvFile, onLeadChanged, onDraftGenerated, onHistoryChanged }: DraftPanelProps) {
  const [tone, setTone] = useState<Tone>('formal');
  const [channel, setChannel] = useState<Channel>('email');
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
  }, [lead?.id, channel]);

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
      const entry = await api.generateDraft(lead.id, tone, channel);
      setDraftText(entry.draft_text);
      onLeadChanged({ ...lead, status: 'drafted' });
      onDraftGenerated();
      onHistoryChanged();
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
      // document — the channel-specific "Open in ..." action below is the
      // fallback path where one exists.
      setError('Could not copy to clipboard. Select the text above and copy it manually.');
    }
  }

  async function downloadCv() {
    try {
      await api.downloadCv();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download CV');
    }
  }

  async function markSent() {
    if (!lead) return;
    setSending(true);
    setError(null);
    try {
      await api.markSent(lead.id, draftText, channel);
      onLeadChanged({ ...lead, status: 'sent' });
      setSentConfirmed(true);
      onHistoryChanged();
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
  const whatsappHref = `https://wa.me/${lead.whatsapp_number ? whatsappNumberDigits(lead.whatsapp_number) : ''}?text=${encodeURIComponent(draftText)}`;
  // mailto: and wa.me both accept the message as a URL parameter; LinkedIn
  // has no equivalent deep link for pre-filling a DM or connection note, so
  // the only "open" action for either LinkedIn channel is the profile URL
  // itself — the message still has to be pasted in by hand once there.
  const allowsAttachment = channel === 'email' || channel === 'cover_letter';

  return (
    <section className="panel">
      <h2>Draft for {lead.company_name}</h2>

      {!hasProfile && <p className="error-text">Save a resume profile before generating drafts.</p>}

      <div className="draft-panel__controls">
        <label>
          Channel
          <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tone
          <select value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
            <option value="formal">Formal</option>
            <option value="casual">Casual</option>
          </select>
        </label>
        <button type="button" className="btn btn--accent" onClick={generate} disabled={generating || !hasProfile}>
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
            <button type="button" className="btn btn--accent" onClick={copyToClipboard}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
            {allowsAttachment && hasCvFile && (
              // Neither mailto: nor wa.me can carry a file attachment (a
              // hard limitation of both URI schemes) — this is the reminder
              // to grab the file and attach it by hand before sending.
              <button type="button" className="btn btn--accent" onClick={downloadCv}>
                Download CV
              </button>
            )}
            {channel === 'email' && (
              <a className="btn btn--accent" href={mailto}>
                Open in email client
              </a>
            )}
            {channel === 'whatsapp' && (
              <a className="btn btn--accent" href={whatsappHref} target="_blank" rel="noreferrer">
                Open in WhatsApp
              </a>
            )}
            {(channel === 'linkedin_dm' || channel === 'linkedin_connection') && lead.linkedin_url && (
              <a className="btn btn--accent" href={lead.linkedin_url} target="_blank" rel="noreferrer">
                Open LinkedIn profile
              </a>
            )}
            <button type="button" className="btn btn--accent" onClick={markSent} disabled={sending}>
              {sending ? 'Saving…' : 'Mark sent'}
            </button>
            {sentConfirmed && <span className="panel__meta">Logged as sent. Follow up in 7 days if no reply.</span>}
          </div>
        </>
      )}
    </section>
  );
}
