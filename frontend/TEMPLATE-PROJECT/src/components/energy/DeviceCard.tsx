import { Zap, ChevronRight } from "lucide-react";
import StatusBadge from "./StatusBadge";
import { motion } from "framer-motion";

interface DeviceCardProps {
  name: string;
  room?: string;
  currentWatts: number;
  status: "normal" | "warning" | "anomaly";
  isOn: boolean;
  onClick?: () => void;
}

const DeviceCard = ({ name, room, currentWatts, status, isOn, onClick }: DeviceCardProps) => {
  return (
    <motion.button
      onClick={onClick}
      className="w-full glass-card-hover rounded-xl p-4 flex items-center gap-4 text-left"
      whileTap={{ scale: 0.98 }}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isOn ? 'gradient-primary' : 'bg-muted'}`}>
        <Zap className={`h-5 w-5 ${isOn ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground truncate">{name}</p>
          <StatusBadge status={status} />
        </div>
        <div className="flex items-center gap-2 mt-1">
          {room && <span className="text-xs text-muted-foreground">{room}</span>}
          <span className="text-xs font-mono text-muted-foreground">
            {isOn ? `${currentWatts}W` : "Apagado"}
          </span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </motion.button>
  );
};

export default DeviceCard;
