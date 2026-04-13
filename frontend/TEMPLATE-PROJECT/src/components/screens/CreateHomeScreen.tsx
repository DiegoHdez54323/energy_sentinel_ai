import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Home, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CreateHomeScreenProps {
  onBack: () => void;
  onCreate: () => void;
}

const CreateHomeScreen = ({ onBack, onCreate }: CreateHomeScreenProps) => {
  return (
    <div className="min-h-screen bg-background px-5 pt-14 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-xl bg-card border border-border">
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <h1 className="text-lg font-bold text-foreground">Nuevo hogar</h1>
      </div>

      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="space-y-5"
      >
        {/* Icon */}
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-secondary">
            <Home className="h-10 w-10 text-secondary-foreground" />
          </div>
        </div>

        {/* Form */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Nombre del hogar
            </label>
            <input
              type="text"
              placeholder="Ej: Casa Principal"
              className="w-full h-12 px-4 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Dirección (opcional)
            </label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Ciudad o dirección"
                className="w-full h-12 pl-11 pr-4 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>
          </div>
        </div>

        <Button
          onClick={onCreate}
          className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm border-0 mt-4"
        >
          Crear hogar
        </Button>
      </motion.div>
    </div>
  );
};

export default CreateHomeScreen;
