import { motion } from "framer-motion";
import { Home, Plus, ChevronRight, Zap } from "lucide-react";
import ConsumptionSummary from "@/components/energy/ConsumptionSummary";
import DeviceCard from "@/components/energy/DeviceCard";
import StatusBadge from "@/components/energy/StatusBadge";

interface HomeDashboardProps {
  onDeviceClick: (id: string) => void;
}

const mockDevices = [
  { id: "1", name: "Aire Acondicionado", room: "Sala", watts: 1200, status: "normal" as const, isOn: true },
  { id: "2", name: "Refrigerador", room: "Cocina", watts: 150, status: "anomaly" as const, isOn: true },
  { id: "3", name: "Lavadora", room: "Lavandería", watts: 0, status: "normal" as const, isOn: false },
  { id: "4", name: "Microondas", room: "Cocina", watts: 0, status: "normal" as const, isOn: false },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const HomeDashboard = ({ onDeviceClick }: HomeDashboardProps) => {
  const activeAnomalies = mockDevices.filter((d) => d.status === "anomaly").length;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="px-5 pt-14 space-y-6"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mi hogar</p>
          <h1 className="text-xl font-bold text-foreground mt-0.5">Casa Principal</h1>
        </div>
        <div className="flex items-center gap-2">
          {activeAnomalies > 0 && (
            <StatusBadge status="anomaly" label={`${activeAnomalies} alerta`} size="md" />
          )}
        </div>
      </motion.div>

      {/* Consumption Summary */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3">
        <ConsumptionSummary
          value="14.2"
          unit="kWh"
          label="Hoy"
          trend="down"
          trendValue="-8%"
        />
        <ConsumptionSummary
          value="98.5"
          unit="kWh"
          label="Esta semana"
          trend="up"
          trendValue="+3%"
        />
      </motion.div>

      {/* Active alert banner */}
      {activeAnomalies > 0 && (
        <motion.div
          variants={item}
          className="rounded-xl p-4 bg-anomaly/5 border border-anomaly/15 flex items-center gap-3"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-anomaly/10">
            <Zap className="h-5 w-5 text-anomaly" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Anomalía detectada</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Refrigerador muestra consumo inusual
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </motion.div>
      )}

      {/* Devices */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Dispositivos</h2>
          <button className="flex items-center gap-1 text-xs font-medium text-primary">
            <Plus className="h-3.5 w-3.5" />
            Añadir
          </button>
        </div>
        <div className="space-y-2.5">
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
        </div>
      </motion.div>
    </motion.div>
  );
};

export default HomeDashboard;
