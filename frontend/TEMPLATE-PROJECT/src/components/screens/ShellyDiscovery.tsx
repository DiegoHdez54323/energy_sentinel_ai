import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Search, CheckCircle2, Cpu, Download, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/energy/EmptyState";

interface ShellyDiscoveryProps {
  onBack: () => void;
  onImportComplete: () => void;
}

interface DiscoveredDevice {
  id: string;
  name: string;
  type: string;
  channel: string;
  selected: boolean;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const ShellyDiscovery = ({ onBack, onImportComplete }: ShellyDiscoveryProps) => {
  const [phase, setPhase] = useState<"idle" | "scanning" | "results" | "importing" | "done">("idle");
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);

  const startDiscovery = () => {
    setPhase("scanning");
    setTimeout(() => {
      setDevices([
        { id: "s1", name: "Shelly Plug S - Sala", type: "Shelly Plug S", channel: "channel_0", selected: true },
        { id: "s2", name: "Shelly Plug S - Cocina", type: "Shelly Plug S", channel: "channel_0", selected: true },
        { id: "s3", name: "Shelly PM Mini - Lavandería", type: "Shelly PM Mini", channel: "channel_0", selected: false },
        { id: "s4", name: "Shelly Plug S - Garaje", type: "Shelly Plug S", channel: "channel_0", selected: true },
        { id: "s5", name: "Shelly 1PM - Terraza", type: "Shelly 1PM", channel: "channel_0", selected: false },
      ]);
      setPhase("results");
    }, 2500);
  };

  const toggleDevice = (id: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, selected: !d.selected } : d))
    );
  };

  const importDevices = () => {
    setPhase("importing");
    setTimeout(() => setPhase("done"), 2000);
  };

  const selectedCount = devices.filter((d) => d.selected).length;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="min-h-screen px-5 pt-14 pb-10 space-y-6"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-center gap-3">
        <button onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-xl bg-card border border-border">
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">Descubrir dispositivos</h1>
          <p className="text-xs text-muted-foreground">Importa dispositivos desde Shelly Cloud</p>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {/* Idle */}
        {phase === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pt-8"
          >
            <EmptyState
              icon={Search}
              title="Buscar dispositivos Shelly"
              description="Escanearemos tu cuenta Shelly Cloud para encontrar dispositivos disponibles para importar."
              action={{ label: "Iniciar descubrimiento", onClick: startDiscovery }}
            />
          </motion.div>
        )}

        {/* Scanning */}
        {phase === "scanning" && (
          <motion.div
            key="scanning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
                <Loader2 className="h-9 w-9 text-primary animate-spin" />
              </div>
              <motion.div
                className="absolute inset-0 rounded-3xl border-2 border-primary/20"
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <p className="text-sm font-semibold text-foreground mt-6">Buscando dispositivos…</p>
            <p className="text-xs text-muted-foreground mt-1">Conectando con Shelly Cloud</p>
          </motion.div>
        )}

        {/* Results */}
        {phase === "results" && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {devices.length} dispositivos encontrados
              </p>
              <button
                onClick={() => setDevices(prev => prev.map(d => ({ ...d, selected: true })))}
                className="text-xs font-medium text-primary"
              >
                Seleccionar todos
              </button>
            </div>

            <div className="space-y-2">
              {devices.map((device) => (
                <motion.button
                  key={device.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => toggleDevice(device.id)}
                  className={`w-full rounded-xl p-4 flex items-center gap-3 text-left transition-all duration-200 border ${
                    device.selected
                      ? "bg-primary/5 border-primary/20"
                      : "glass-card border-border/50"
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    device.selected ? "gradient-primary" : "bg-muted"
                  }`}>
                    {device.selected ? (
                      <CheckCircle2 className="h-5 w-5 text-primary-foreground" />
                    ) : (
                      <Cpu className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{device.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{device.type} · {device.channel}</p>
                  </div>
                </motion.button>
              ))}
            </div>

            <Button
              onClick={importDevices}
              disabled={selectedCount === 0}
              className="w-full rounded-xl gradient-primary text-primary-foreground border-0 h-12 font-semibold"
            >
              <Download className="h-4 w-4 mr-2" />
              Importar {selectedCount} dispositivo{selectedCount !== 1 ? "s" : ""}
            </Button>
          </motion.div>
        )}

        {/* Importing */}
        {phase === "importing" && (
          <motion.div
            key="importing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-sm font-semibold text-foreground mt-6">Importando dispositivos…</p>
            <p className="text-xs text-muted-foreground mt-1">{selectedCount} dispositivos seleccionados</p>
          </motion.div>
        )}

        {/* Done */}
        {phase === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-16"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-success/10 mb-6">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <h2 className="text-lg font-bold text-foreground">¡Importación completa!</h2>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-[260px]">
              {selectedCount} dispositivos importados correctamente a tu hogar.
            </p>
            <Button
              onClick={onImportComplete}
              className="mt-8 rounded-xl gradient-primary text-primary-foreground border-0 h-11 px-8 font-semibold"
            >
              <Zap className="h-4 w-4 mr-2" />
              Ver mis dispositivos
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Endpoints */}
      <motion.div variants={item} className="glass-card rounded-xl p-4">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Endpoints:</span>{" "}
          POST /integrations/shelly/discovery · POST /integrations/shelly/import
        </p>
      </motion.div>
    </motion.div>
  );
};

export default ShellyDiscovery;
