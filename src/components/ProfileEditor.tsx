import { useEffect, useState } from 'react';
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(profile?.content_text ?? '');
  }, [profile]);

  const dirty = text !== (profile?.content_text ?? '');

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveProfile(text);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
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
      <div className="panel__actions">
        <button type="button" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save resume'}
        </button>
        {profile?.updated_at && <span className="panel__meta">Last saved {new Date(profile.updated_at).toLocaleString()}</span>}
      </div>
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}
