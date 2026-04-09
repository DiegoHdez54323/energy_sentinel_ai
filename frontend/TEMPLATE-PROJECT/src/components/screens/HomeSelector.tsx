import { motion } from "framer-motion";
import { Home, Plus, ChevronRight, Zap, MapPin } from "lucide-react";
import EmptyState from "@/components/energy/EmptyState";

interface HomeSelectorProps {
  onSelectHome: (id: string) => void;
  onCreateHome: () => void;
}

const mockHomes = [
  { id: "1", name: "Casa Principal", devices: 4, city: "Ciudad de México", consumption: "14.2 kWh hoy", hasAnomaly: true },
  { id: "2", name: "Oficina Centro", devices: 2, city: "Monterrey", consumption: "8.7 kWh hoy", hasAnomaly: false },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const HomeSelector = ({ onSelectHome, onCreateHome }: HomeSelectorProps) => {
  if (mockHomes.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <EmptyState
          icon={Home}
          title="Sin hogares registrados"
          description="Crea tu primer hogar para empezar a monitorear el consumo de tus dispositivos."
          action={{ label: "Crear hogar", onClick: onCreateHome }}
        />
      </div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="min-h-screen px-5 pt-16 pb-10"
    >
      <motion.div variants={item} className="mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-energy mb-4">
          <Zap className="h-6 w-6 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Mis hogares</h1>
        <p className="text-sm text-muted-foreground mt-1">Selecciona un hogar para ver su consumo</p>
      </motion.div>

      <motion.div variants={item} className="space-y-3">
        {mockHomes.map((home) => (
          <motion.button
            key={home.id}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectHome(home.id)}
            className="w-full glass-card-hover rounded-xl p-5 text-left"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <Home className="h-6 w-6 text-secondary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">{home.name}</h3>
                  {home.hasAnomaly && (
                    <span className="h-2.5 w-2.5 rounded-full bg-anomaly animate-pulse-gentle" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{home.city}</span>
                </div>
                <div className="flex items-center gap-4 mt-2.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {home.devices} dispositivos
                  </span>
                  <span className="text-xs font-mono font-medium text-primary">
                    {home.consumption}
                  </span>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground mt-1 shrink-0" />
            </div>
          </motion.button>
        ))}
      </motion.div>

      <motion.div variants={item} className="mt-6">
        <button
          onClick={onCreateHome}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-sm font-medium text-muted-foreground"
        >
          <Plus className="h-4 w-4" />
          Añadir nuevo hogar
        </button>
      </motion.div>
    </motion.div>
  );
};

export default HomeSelector;
