import { memberIdentity } from '../lib/members';

/**
 * The bench: one seat per council member. While the council deliberates the
 * seats shimmer; the member named in the latest progress line is lit.
 */
export function Bench({ members, progressMessage, done }: {
  members: string[];
  progressMessage?: string;
  done?: boolean;
}) {
  if (members.length === 0) return null;
  return (
    <div className={`bench ${done ? 'bench-done' : ''}`} aria-hidden={members.length > 24}>
      {members.map((label) => {
        const id = memberIdentity(label);
        const speaking = !done && !!progressMessage?.includes(label);
        return (
          <span
            key={label}
            className={`seat ${speaking ? 'speaking' : ''}`}
            style={{ ['--seat' as string]: id.color }}
            title={label}
          >
            {id.initials}
          </span>
        );
      })}
    </div>
  );
}
