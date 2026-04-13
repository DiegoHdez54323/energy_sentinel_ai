import { motion } from "framer-motion";
import ConsumptionChart from "@/components/energy/ConsumptionChart";
import ConsumptionSummary from "@/components/energy/ConsumptionSummary";
import { BarChart3, TrendingDown } from "lucide-react";

const mockWeekly = [
  { time: "Lun", value: 12.4 },
  { time: "Mar", value: 14.1 },
  { time: "Mié", value: 11.8 },
  { time: "Jue", value: 15.2 },
  { time: "Vie", value: 13.9 },
  { time: "Sáb", value: 18.3 },
  { time: "Dom", value: 9.6 },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const ConsumptionScreen = () => {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="px-5 pt-14 space-y-6"
    >
      <motion.div variants={item}>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Casa Principal</p>
        <h1 className="text-xl font-bold text-foreground mt-0.5">Consumo</h1>
      </motion.div>

      {/* Period selector */}
      <motion.div variants={item} className="flex gap-1 bg-muted p-1 rounded-xl">
        {["Hoy", "Semana", "Mes"].map((p, i) => (
          <button
            key={p}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              i === 1
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            {p}
          </button>
        ))}
      </motion.div>

      {/* Main chart */}
      <motion.div variants={item} className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Consumo semanal</span>
        </div>
        <ConsumptionChart data={mockWeekly} height={200} />
      </motion.div>

      {/* Stats grid */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3">
        <ConsumptionSummary value="95.3" unit="kWh" label="Esta semana" trend="down" trendValue="-8%" />
        <ConsumptionSummary value="13.6" unit="kWh" label="Promedio/día" trend="flat" />
      </motion.div>

      {/* Per device breakdown */}
      <motion.div variants={item}>
        <h2 className="text-sm font-semibold text-foreground mb-3">Por dispositivo</h2>
        <div className="space-y-3">
          {[
            { name: "Aire Acondicionado", pct: 42, kwh: "40.0" },
            { name: "Refrigerador", pct: 25, kwh: "23.8" },
            { name: "Lavadora", pct: 18, kwh: "17.2" },
            { name: "Microondas", pct: 15, kwh: "14.3" },
          ].map((d) => (
            <div key={d.name} className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{d.name}</span>
                <span className="text-sm font-mono font-semibold text-foreground">{d.kwh} kWh</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full gradient-primary transition-all duration-700"
                  style={{ width: `${d.pct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{d.pct}% del total</p>
            </div>
          ))}
        </div>
      </motion.div>

      <div className="h-4" />
    </motion.div>
  );
};

export default ConsumptionScreen;
