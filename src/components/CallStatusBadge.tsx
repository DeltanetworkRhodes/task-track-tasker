import { CALL_STATUS, type CallStatusKey } from "@/lib/callStatus";

interface CallStatusBadgeProps {
  status: CallStatusKey | string | null;
  callCount?: number;
  onClick?: () => void;
}

const CallStatusBadge = ({ status, callCount = 0, onClick }: CallStatusBadgeProps) => {
  const key = (status || "not_called") as CallStatusKey;
  const cfg = CALL_STATUS[key] || CALL_STATUS.not_called;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${cfg.color} ${cfg.border} ${onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
      onClick={onClick ? (e) => {
        e.stopPropagation();
        onClick();
      } : undefined}
    >
      {cfg.icon} {cfg.label}
      {key === "no_answer" && callCount > 1 && (
        <span className="opacity-60">×{callCount}</span>
      )}
    </span>
  );
};

export default CallStatusBadge;
