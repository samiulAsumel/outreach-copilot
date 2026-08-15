import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { CHANNEL_LABEL } from '../lib/channels';
import type { AnalyticsSummary, Channel } from '../types';

const ALL_CHANNELS = Object.keys(CHANNEL_LABEL) as Channel[];

interface StatTileProps {
  label: string;
  value: string | number;
}

function StatTile({ label, value }: StatTileProps) {
  return (
    <div className="stat-tile">
      <span className="stat-tile__label">{label}</span>
      <span className="stat-tile__value">{value}</span>
    </div>
  );
}

// Magnitude comparison across a fixed small set of categories — per the
// dataviz method, that's a job for one sequential hue (bar length carries
// the value), not a categorical palette; there's no "identity" to keep
// distinct here; every channel row uses the same color.
function ChannelBarChart({ draftsByChannel }: { draftsByChannel: Record<Channel, number> }) {
  const max = Math.max(1, ...ALL_CHANNELS.map((c) => draftsByChannel[c]));
  return (
    <div className="bar-chart">
      {ALL_CHANNELS.map((channel) => {
        const count = draftsByChannel[channel];
        return (
          <div className="bar-row" key={channel}>
            <span className="bar-row__label">{CHANNEL_LABEL[channel]}</span>
            <div className="bar-row__track">
              <div className="bar-row__fill" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="bar-row__value">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

interface DashboardProps {
  // Bumped by App.tsx whenever leads or outreach history change — analytics
  // has no other signal to know it's stale, since it's a separate aggregate
  // query, not derived from the `leads` state already in memory.
  refreshKey: number;
}

export function Dashboard({ refreshKey }: DashboardProps) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAnalytics().then(setSummary).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load analytics'));
  }, [refreshKey]);

  if (error) {
    return (
      <section className="panel">
        <h2>Dashboard</h2>
        <p className="error-text">{error}</p>
      </section>
    );
  }

  if (!summary) {
    return (
      <section className="panel">
        <h2>Dashboard</h2>
        <p className="panel__hint">Loading…</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Dashboard</h2>
      <div className="stat-tile-row">
        <StatTile label="Leads" value={summary.leads_total} />
        <StatTile label="Sent" value={summary.sent_total} />
        <StatTile label="Replied" value={summary.replied_total} />
        <StatTile label="Reply rate" value={summary.sent_total > 0 ? `${summary.reply_rate}%` : '—'} />
        <StatTile label="Follow-ups overdue" value={summary.followups_overdue} />
      </div>
      <h3 className="panel__subheading">Drafts by channel</h3>
      <ChannelBarChart draftsByChannel={summary.drafts_by_channel} />
    </section>
  );
}
