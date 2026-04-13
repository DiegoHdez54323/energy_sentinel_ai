import { motion } from "framer-motion";
import DeviceCard from "@/components/energy/DeviceCard";
import { Plus, Search, Filter } from "lucide-react";

interface DevicesScreenProps {
  onDeviceClick: (id: string) => void;
}

const mockDevices = [
  { id: "1", name: "Aire Acondicionado", room: "Sala", watts: 1200, status: "normal" as const, isOn: true },
  { id: "2", name: "Refrigerador", room: "Cocina", watts: 150, status: "anomaly" as const, isOn: true },
  { id: "3", name: "Lavadora", room: "Lavandería", watts: 0, status: "normal" as const, isOn: false },
  { id: "4", name: "Microondas", room: "Cocina", watts: 0, status: "normal" as const, isOn: false },
  { id: "5", name: "Televisor", room: "Sala", watts: 85, status: "warning" as const, isOn: true },
  { id: "6", name: "Cargador EV", room: "Garaje", watts: 0, status: "normal" as const, isOn: false },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const DevicesScreen = ({ onDeviceClick }: DevicesScreenProps) => {
  const activeCount = mockDevices.filter(d => d.isOn).length;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="px-5 pt-14 space-y-5"
    >
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Casa Principal</p>
          <h1 className="text-xl font-bold text-foreground mt-0.5">Dispositivos</h1>
        </div>
        <button className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
          <Plus className="h-5 w-5 text-primary-foreground" />
        </button>
      </motion.div>

      {/* Search */}
      <motion.div variants={item} className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar dispositivo..."
          className="w-full h-11 pl-11 pr-11 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        />
        <button className="absolute right-3 top-1/2 -translate-y-1/2 p-1">
          <Filter className="h-4 w-4 text-muted-foreground" />
        </button>
      </motion.div>

      {/* Summary */}
      <motion.div variants={item} className="flex gap-3">
        <div className="flex-1 glass-card rounded-xl p-3 text-center">
          <p className="text-lg font-bold font-mono text-foreground">{mockDevices.length}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total</p>
        </div>
        <div className="flex-1 glass-card rounded-xl p-3 text-center">
          <p className="text-lg font-bold font-mono text-success">{activeCount}</p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Activos</p>
        </div>
        <div className="flex-1 glass-card rounded-xl p-3 text-center">
          <p className="text-lg font-bold font-mono text-anomaly">
            {mockDevices.filter(d => d.status === "anomaly").length}
          </p>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Alertas</p>
        </div>
      </motion.div>

      {/* List */}
      <motion.div variants={item} className="space-y-2.5">
        {mockDevices.map((device) => (
          <DeviceCard
            key={device.id}
            name={device.name}
            room={device.room}
            currentWatts={device.watts}
            status={device.status}
            isOn={device.isOn}
            onClick={() => onDeviceClick(device.id)}
          />
        ))}
      </motion.div>

      <div className="h-4" />
    </motion.div>
  );
};

export default DevicesScreen;
