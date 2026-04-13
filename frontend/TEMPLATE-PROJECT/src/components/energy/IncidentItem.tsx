import { AlertCircle, Clock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface IncidentItemProps {
  title: string;
  timeRange: string;
  readingsCount: number;
  isOpen: boolean;
  onClick?: () => void;
}

const IncidentItem = ({ title, timeRange, readingsCount, isOpen, onClick }: IncidentItemProps) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-xl p-4 flex items-start gap-3 text-left transition-all duration-200",
        isOpen
          ? "bg-anomaly/5 border border-anomaly/20"
          : "glass-card border border-border/50"
      )}
    >
      <div className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg mt-0.5",
        isOpen ? "bg-anomaly/10" : "bg-muted"
      )}>
        <AlertCircle className={cn("h-4 w-4", isOpen ? "text-anomaly" : "text-muted-foreground")} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn("text-sm font-semibold", isOpen ? "text-anomaly" : "text-foreground")}>
            {title}
          </p>
          {isOpen && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-anomaly bg-anomaly/10 px-2 py-0.5 rounded-full">
              Activo
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {timeRange}
          </span>
          <span className="text-xs text-muted-foreground">
            {readingsCount} lecturas anómalas
          </span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
    </button>
  );
};

export default IncidentItem;
