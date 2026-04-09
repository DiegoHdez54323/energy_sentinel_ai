import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Link2, ExternalLink, CheckCircle2, AlertCircle, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShellyIntegrationProps {
  onBack: () => void;
  onGoToDiscovery: () => void;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const ShellyIntegration = ({ onBack, onGoToDiscovery }: ShellyIntegrationProps) => {
  const [isConnected, setIsConnected] = useState(true);

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
        <h1 className="text-lg font-bold text-foreground">Integración Shelly</h1>
      </motion.div>

      {/* Connection Status */}
      <motion.div
        variants={item}
        className={`rounded-xl p-5 border ${isConnected ? "bg-success/5 border-success/20" : "bg-muted border-border"}`}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isConnected ? "bg-success/10" : "bg-muted"}`}>
            {isConnected ? (
              <CheckCircle2 className="h-6 w-6 text-success" />
            ) : (
              <Unplug className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">
              {isConnected ? "Shelly Cloud conectado" : "Sin conexión"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isConnected ? "Cuenta vinculada correctamente" : "Conecta tu cuenta Shelly para importar dispositivos"}
            </p>
          </div>
        </div>

        {isConnected ? (
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 rounded-xl text-xs h-9"
              onClick={() => setIsConnected(false)}
            >
              <Unplug className="h-3.5 w-3.5 mr-1.5" />
              Desconectar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 rounded-xl text-xs h-9"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Re-sincronizar
            </Button>
          </div>
        ) : (
          <Button
            className="w-full mt-4 rounded-xl gradient-primary text-primary-foreground border-0 h-11"
            onClick={() => setIsConnected(true)}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Conectar con Shelly Cloud
          </Button>
        )}
      </motion.div>

      {/* Info Section */}
      <motion.div variants={item} className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-2">¿Cómo funciona?</h3>
        <div className="space-y-4">
          {[
            { step: "1", title: "Conecta tu cuenta", desc: "Vincula tu cuenta de Shelly Cloud con OAuth seguro" },
            { step: "2", title: "Descubre dispositivos", desc: "Buscamos automáticamente los smart plugs en tu cuenta" },
            { step: "3", title: "Importa y monitorea", desc: "Selecciona los dispositivos que quieres monitorear" },
          ].map((s) => (
            <div key={s.step} className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                {s.step}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{s.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Discovery CTA */}
      {isConnected && (
        <motion.div variants={item}>
          <Button
            onClick={onGoToDiscovery}
            className="w-full rounded-xl gradient-primary text-primary-foreground border-0 h-12 font-semibold"
          >
            <Link2 className="h-4 w-4 mr-2" />
            Descubrir dispositivos Shelly
          </Button>
        </motion.div>
      )}

      {/* Endpoints info */}
      <motion.div variants={item} className="glass-card rounded-xl p-4">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Endpoints:</span>{" "}
          GET /integrations/shelly · POST /integrations/shelly/oauth/start
        </p>
      </motion.div>
    </motion.div>
  );
};

export default ShellyIntegration;
