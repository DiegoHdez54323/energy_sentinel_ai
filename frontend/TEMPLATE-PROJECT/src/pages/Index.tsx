import { useState, useCallback } from "react";
import MobileShell from "@/components/energy/MobileShell";
import SplashScreen from "@/components/screens/SplashScreen";
import LoginScreen from "@/components/screens/LoginScreen";
import RegisterScreen from "@/components/screens/RegisterScreen";
import HomeSelector from "@/components/screens/HomeSelector";
import CreateHomeScreen from "@/components/screens/CreateHomeScreen";
import HomeDashboard from "@/components/screens/HomeDashboard";
import DevicesScreen from "@/components/screens/DevicesScreen";
import DeviceDetail from "@/components/screens/DeviceDetail";
import ConsumptionScreen from "@/components/screens/ConsumptionScreen";
import ProfileScreen from "@/components/screens/ProfileScreen";
import ShellyIntegration from "@/components/screens/ShellyIntegration";
import ShellyDiscovery from "@/components/screens/ShellyDiscovery";

type Screen =
  | "splash"
  | "login"
  | "register"
  | "homeSelector"
  | "createHome"
  | "homeDashboard"
  | "devices"
  | "deviceDetail"
  | "consumption"
  | "profile"
  | "shellyIntegration"
  | "shellyDiscovery";

const Index = () => {
  const [screen, setScreen] = useState<Screen>("splash");
  const [activeTab, setActiveTab] = useState("home");
  const [previousScreen, setPreviousScreen] = useState<Screen>("homeDashboard");

  const navigate = useCallback((to: Screen) => {
    setPreviousScreen(screen);
    setScreen(to);
  }, [screen]);

  const handleSplashFinish = useCallback(() => setScreen("login"), []);

  // Tab change handler — maps tab ids to screens
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    switch (tab) {
      case "home": setScreen("homeDashboard"); break;
      case "devices": setScreen("devices"); break;
      case "consumption": setScreen("consumption"); break;
      case "profile": setScreen("profile"); break;
    }
  };

  // Splash
  if (screen === "splash") {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  // Auth screens (no shell)
  if (screen === "login") {
    return (
      <LoginScreen
        onLogin={() => navigate("homeSelector")}
        onGoToRegister={() => navigate("register")}
      />
    );
  }

  if (screen === "register") {
    return (
      <RegisterScreen
        onRegister={() => navigate("homeSelector")}
        onGoToLogin={() => navigate("login")}
      />
    );
  }

  // Home selector (no shell)
  if (screen === "homeSelector") {
    return (
      <HomeSelector
        onSelectHome={() => { setActiveTab("home"); navigate("homeDashboard"); }}
        onCreateHome={() => navigate("createHome")}
      />
    );
  }

  // Create home (no shell)
  if (screen === "createHome") {
    return (
      <CreateHomeScreen
        onBack={() => navigate("homeSelector")}
        onCreate={() => { setActiveTab("home"); navigate("homeDashboard"); }}
      />
    );
  }

  // Shelly screens (no tab bar)
  if (screen === "shellyIntegration") {
    return (
      <ShellyIntegration
        onBack={() => navigate("profile")}
        onGoToDiscovery={() => navigate("shellyDiscovery")}
      />
    );
  }

  if (screen === "shellyDiscovery") {
    return (
      <ShellyDiscovery
        onBack={() => navigate("shellyIntegration")}
        onImportComplete={() => { setActiveTab("devices"); navigate("devices"); }}
      />
    );
  }

  // Device detail (inside shell but no tab highlight change)
  if (screen === "deviceDetail") {
    return (
      <MobileShell activeTab={activeTab} onTabChange={handleTabChange}>
        <DeviceDetail onBack={() => navigate(previousScreen === "devices" ? "devices" : "homeDashboard")} />
      </MobileShell>
    );
  }

  // Main tabbed screens
  const renderTab = () => {
    switch (screen) {
      case "homeDashboard":
        return (
          <HomeDashboard
            onDeviceClick={() => { setPreviousScreen("homeDashboard"); setScreen("deviceDetail"); }}
          />
        );
      case "devices":
        return (
          <DevicesScreen
            onDeviceClick={() => { setPreviousScreen("devices"); setScreen("deviceDetail"); }}
          />
        );
      case "consumption":
        return <ConsumptionScreen />;
      case "profile":
        return <ProfileScreen onShellyClick={() => navigate("shellyIntegration")} onLogout={() => navigate("login")} onHomeSwitch={() => navigate("homeSelector")} />;
      default:
        return <HomeDashboard onDeviceClick={() => { setPreviousScreen("homeDashboard"); setScreen("deviceDetail"); }} />;
    }
  };

  return (
    <MobileShell activeTab={activeTab} onTabChange={handleTabChange}>
      {renderTab()}
    </MobileShell>
  );
};

export default Index;
