import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { api } from '../api/client';
import type { ResumeProfile } from '../types';

interface ProfileEditorProps {
  profile: ResumeProfile | null;
  onSaved: (profile: ResumeProfile) => void;
}

// Rarely changes (spec step 1: "paste/save once") — so this is a plain
// textarea + explicit Save, not autosave-on-every-keystroke, which would
// just spam D1 writes against the free-tier daily write limit for no
// benefit on a field that changes maybe monthly.
export function ProfileEditor({ profile, onSaved }: ProfileEditorProps) {
  const [text, setText] = useState(profile?.content_text ?? '');
  const [portfolioLink, setPortfolioLink] = useState(profile?.portfolio_link ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cvBusy, setCvBusy] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(profile?.content_text ?? '');
    setPortfolioLink(profile?.portfolio_link ?? '');
  }, [profile]);

  const dirty = text !== (profile?.content_text ?? '') || portfolioLink !== (profile?.portfolio_link ?? '');

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveProfile(text, portfolioLink.trim() || null);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-selected later (e.g. after Remove)
    if (!file) return;
    setCvBusy(true);
    setCvError(null);
    try {
      const saved = await api.uploadCv(file);
      onSaved(saved);
    } catch (err) {
      setCvError(err instanceof Error ? err.message : 'Failed to upload CV');
    } finally {
      setCvBusy(false);
    }
  }

  async function handleRemoveCv() {
    setCvBusy(true);
    setCvError(null);
    try {
      await api.deleteCv();
      if (profile) {
        onSaved({ ...profile, cv_file_name: null, cv_file_uploaded_at: null });
      }
    } catch (err) {
      setCvError(err instanceof Error ? err.message : 'Failed to remove CV');
    } finally {
      setCvBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Resume / background</h2>
      <p className="panel__hint">
        Paste your resume or CV summary once. This is the source material every draft is built from —
        keep it accurate and specific, since the AI is instructed to only claim what's written here.
      </p>
      <textarea
        className="profile-editor__textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        placeholder="Paste your resume text here..."
      />
      <label className="profile-editor__link-label">
        Portfolio link (optional — included in every draft's sign-off)
        <input
          type="url"
          value={portfolioLink}
          onChange={(e) => setPortfolioLink(e.target.value)}
          placeholder="https://sasumel.pages.dev"
        />
      </label>
      <div className="panel__actions">
        <button type="button" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save resume'}
        </button>
        {profile?.updated_at && <span className="panel__meta">Last saved {new Date(profile.updated_at).toLocaleString()}</span>}
      </div>
      {error && <p className="error-text">{error}</p>}

      <div className="cv-row">
        <span className="cv-row__label">CV file</span>
        {profile?.cv_file_name ? (
          <>
            <span className="cv-row__filename">{profile.cv_file_name}</span>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={cvBusy}>
              Replace
            </button>
            <button type="button" onClick={handleRemoveCv} disabled={cvBusy} className="lead-list__delete">
              Remove
            </button>
          </>
        ) : (
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={cvBusy}>
            {cvBusy ? 'Uploading…' : 'Upload CV'}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileSelected}
          hidden
        />
      </div>
      {cvError && <p className="error-text">{cvError}</p>}
    </section>
  );
}
