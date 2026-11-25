import type { InterviewStatus } from "../types";

const LABELS: Record<InterviewStatus, string> = {
  scheduled: "Scheduled",
  interviewing: "In session",
  ended: "Ended",
};

export function StatusBadge({ status }: { status: InterviewStatus }) {
  return <span className={`badge badge-${status}`}>{LABELS[status]}</span>;
}
