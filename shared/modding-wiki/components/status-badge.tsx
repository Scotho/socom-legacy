import { STATUS_MEANING, type Status } from '../lib/status';

// The page's MW.R6 status and what owns it, at the top of every page (MW-3). The sources are repository paths, shown
// as text: the wiki links nothing outside itself for a status (MW.R6).
export function StatusBadge({ status, source }: { status: Status; source: string | string[] }) {
  const sources = typeof source === 'string' ? [source] : source;
  return (
    <div className="s2u-status not-prose" data-status={status}>
      <span className="s2u-status-label" title={STATUS_MEANING[status]}>
        Status: {status}
      </span>
      <span className="s2u-status-source">
        Owned by:{' '}
        {sources.map((s, i) => (
          <span key={s}>
            {i > 0 ? ', ' : ''}
            <code>{s}</code>
          </span>
        ))}
      </span>
    </div>
  );
}
