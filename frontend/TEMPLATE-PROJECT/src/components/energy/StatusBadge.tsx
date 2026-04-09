import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";

type Status = "normal" | "warning" | "anomaly";

interface StatusBadgeProps {
  status: Status;
  label?: string;
  size?: "sm" | "md";
}

const icons = {
  normal: CheckCircle2,
  warning: AlertTriangle,
  anomaly: AlertCircle,
};

const StatusBadge = ({ status, label, size = "sm" }: StatusBadgeProps) => {
  const Icon = icons[status];
  const defaultLabels = { normal: "Normal", warning: "Atención", anomaly: "Anomalía" };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        status === "normal" && "status-normal",
        status === "warning" && "status-warning",
        status === "anomaly" && "status-anomaly"
      )}
    >
      <Icon className={cn(size === "sm" ? "h-3 w-3" : "h-4 w-4")} />
      {label || defaultLabels[status]}
    </span>
  );
};

export default StatusBadge;
