import { ReactNode } from "react";
import { Home, Cpu, Zap, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileShellProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: "home", label: "Inicio", icon: Home },
  { id: "devices", label: "Dispositivos", icon: Cpu },
  { id: "consumption", label: "Consumo", icon: Zap },
  { id: "profile", label: "Perfil", icon: User },
];

const MobileShell = ({ children, activeTab, onTabChange }: MobileShellProps) => {
  return (
    <div className="relative mx-auto max-w-md min-h-screen bg-background">
      {/* Content */}
      <main className="mobile-safe-bottom pb-4">
        {children}
      </main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card/90 backdrop-blur-xl border-t border-border/50 z-50">
        <div className="flex items-center justify-around px-2 py-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all duration-200",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <tab.icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
                <span className={cn("text-[10px] font-semibold", isActive && "text-primary")}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className="absolute -bottom-0 h-0.5 w-8 rounded-full gradient-primary" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default MobileShell;
