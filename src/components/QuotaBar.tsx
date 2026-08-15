interface QuotaBarProps {
  draftsToday: number | null;
}

// Self-discipline tool, not a hard block (spec: dashboard shows "6/10 sent
// today" as a counter, not a gate) — the user sends manually from Gmail
// anyway, so there's nothing here to enforce even if we wanted to.
export function QuotaBar({ draftsToday }: QuotaBarProps) {
  return (
    <div className="quota-bar">
      <span className="quota-bar__label">Drafts generated today</span>
      <span className="quota-bar__count">{draftsToday === null ? '…' : draftsToday}</span>
    </div>
  );
}
