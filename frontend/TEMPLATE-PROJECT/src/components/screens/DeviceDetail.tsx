import { motion } from "framer-motion";
import { ArrowLeft, Power, Zap, Clock, Activity } from "lucide-react";
import StatusBadge from "@/components/energy/StatusBadge";
import ConsumptionChart from "@/components/energy/ConsumptionChart";
import ConsumptionSummary from "@/components/energy/ConsumptionSummary";
import IncidentItem from "@/components/energy/IncidentItem";

interface DeviceDetailProps {
  onBack: () => void;
}

const mockChartData = [
  { time: "00:00", value: 120 },
  { time: "04:00", value: 115 },
  { time: "08:00", value: 180 },
  { time: "12:00", value: 350 },
  { time: "14:00", value: 420 },
  { time: "16:00", value: 280 },
  { time: "18:00", value: 890 },
  { time: "19:00", value: 650 },
  { time: "20:00", value: 200 },
  { time: "22:00", value: 140 },
];

const mockIncidents = [
  { id: "1", title: "Pico de consumo inusual", timeRange: "Hoy 18:00 – 18:12", readings: 4, isOpen: true },
  { id: "2", title: "Consumo elevado prolongado", timeRange: "Ayer 14:30 – 15:45", readings: 8, isOpen: false },
  { id: "3", title: "Arranque anómalo", timeRange: "Mar 25, 09:10 – 09:12", readings: 2, isOpen: false },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const DeviceDetail = ({ onBack }: DeviceDetailProps) => {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="px-5 pt-14 space-y-6"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-card border border-border"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">Refrigerador</h1>
          <p className="text-xs text-muted-foreground">Cocina</p>
        </div>
        <StatusBadge status="anomaly" size="md" />
      </motion.div>

      {/* Live Status Card */}
      <motion.div variants={item} className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-success animate-pulse-gentle" />
            <span className="text-xs font-medium text-muted-foreground">Encendido</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Actualizado hace 2 min
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold font-mono text-foreground">152</span>
          <span className="text-lg text-muted-foreground">W</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Consumo actual</p>
      </motion.div>

      {/* Consumption Chart */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Consumo hoy</h2>
          <div className="flex gap-1">
            {["24h", "7d", "30d"].map((period, i) => (
              <button
                key={period}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  i === 0
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {period}
              </button>
            ))}
          </div>
        </div>
        <div className="glass-card rounded-xl p-4">
          <ConsumptionChart data={mockChartData} />
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3">
        <ConsumptionSummary value="3.6" unit="kWh" label="Hoy" trend="up" trendValue="+12%" />
        <ConsumptionSummary value="24.1" unit="kWh" label="Esta semana" trend="down" trendValue="-5%" />
      </motion.div>

      {/* Anomalies */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4 text-anomaly" />
            Incidentes
          </h2>
          <span className="text-xs text-muted-foreground">{mockIncidents.length} total</span>
        </div>
        <div className="space-y-2.5">
          {mockIncidents.map((incident) => (
            <IncidentItem
              key={incident.id}
              title={incident.title}
              timeRange={incident.timeRange}
              readingsCount={incident.readings}
              isOpen={incident.isOpen}
            />
          ))}
        </div>
      </motion.div>

      <div className="h-4" />
    </motion.div>
  );
};

export default DeviceDetail;
