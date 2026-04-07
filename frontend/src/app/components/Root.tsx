import { Outlet } from "react-router";
import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { useI18n } from "../i18n";

export function Root() {
  const [isPortrait, setIsPortrait] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    const handleResize = () => {
      // Check if mobile device and portrait mode
      const isMobile = window.innerWidth <= 768;
      const portrait = window.innerHeight > window.innerWidth;
      setIsPortrait(isMobile && portrait);
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="w-full h-screen overflow-hidden bg-slate-950 text-white font-sans select-none">
      {/* Mobile Portrait Warning overlay */}
      {isPortrait ? (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 text-center p-6 space-y-4">
          <RotateCw className="w-16 h-16 text-yellow-400 animate-spin-slow" />
          <h1 className="text-2xl font-bold">{t("Please rotate your device")}</h1>
          <p className="text-slate-300">
            {t("AIPOT is designed for the best experience in landscape mode.")}
          </p>
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
