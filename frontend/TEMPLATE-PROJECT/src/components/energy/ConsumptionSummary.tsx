import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConsumptionSummaryProps {
  value: string;
  unit: string;
  label: string;
  trend?: "up" | "down" | "flat";
  trendValue?: string;
}

const ConsumptionSummary = ({ value, unit, label, trend = "flat", trendValue }: ConsumptionSummaryProps) => {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  return (
    <div className="glass-card rounded-xl p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-2">
        <span className="text-2xl font-bold text-foreground font-mono">{value}</span>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      {trendValue && (
        <div className={cn(
          "flex items-center gap-1 mt-2 text-xs font-medium",
          trend === "down" ? "text-success" : trend === "up" ? "text-warning" : "text-muted-foreground"
        )}>
          <TrendIcon className="h-3 w-3" />
          <span>{trendValue} vs. semana pasada</span>
        </div>
      )}
    </div>
  );
};

export default ConsumptionSummary;
