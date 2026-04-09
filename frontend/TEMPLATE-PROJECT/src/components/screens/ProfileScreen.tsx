import { motion } from "framer-motion";
import { User, ChevronRight, Link2, LogOut, Shield, HelpCircle, Zap, Home } from "lucide-react";

interface ProfileScreenProps {
  onShellyClick?: () => void;
  onLogout?: () => void;
  onHomeSwitch?: () => void;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const ProfileScreen = ({ onShellyClick, onLogout, onHomeSwitch }: ProfileScreenProps) => {
  const menuItems = [
    { icon: Link2, label: "Integración Shelly", desc: "Conectada", color: "text-primary", onClick: onShellyClick },
    { icon: Shield, label: "Seguridad", desc: "Cambiar contraseña", color: "text-muted-foreground" },
    { icon: HelpCircle, label: "Ayuda", desc: "Preguntas frecuentes", color: "text-muted-foreground" },
  ];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="px-5 pt-14 space-y-6"
    >
      <motion.div variants={item}>
        <h1 className="text-xl font-bold text-foreground">Perfil</h1>
      </motion.div>

      {/* User card */}
      <motion.div variants={item} className="glass-card rounded-xl p-5 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-energy">
          <User className="h-7 w-7 text-primary-foreground" />
        </div>
        <div className="flex-1">
          <p className="text-base font-semibold text-foreground">Carlos Méndez</p>
          <p className="text-sm text-muted-foreground">carlos@email.com</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </motion.div>

      {/* Home info */}
      <motion.div variants={item}>
        <button onClick={onHomeSwitch} className="w-full glass-card rounded-xl p-4 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
              <Home className="h-5 w-5 text-secondary-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Casa Principal</p>
              <p className="text-xs text-muted-foreground">4 dispositivos · Cambiar hogar</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      </motion.div>

      {/* Menu */}
      <motion.div variants={item} className="space-y-1">
        {menuItems.map((menuItem) => (
          <button
            key={menuItem.label}
            onClick={menuItem.onClick}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-muted/50 transition-colors text-left"
          >
            <menuItem.icon className={`h-5 w-5 ${menuItem.color}`} />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{menuItem.label}</p>
              <p className="text-xs text-muted-foreground">{menuItem.desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </motion.div>

      {/* Logout */}
      <motion.div variants={item}>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 p-3.5 rounded-xl text-destructive hover:bg-destructive/5 transition-colors text-sm font-medium"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </motion.div>

      <div className="h-4" />
    </motion.div>
  );
};

export default ProfileScreen;
