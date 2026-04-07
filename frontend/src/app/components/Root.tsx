import { Outlet } from "react-router";
import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { useI18n } from "../i18n";

const PHONE_MAX_SHORT_EDGE = 500;
const PHONE_MAX_LONG_EDGE = 1000;
const MOBILE_DESKTOP_VIEWPORT_WIDTH = 1366;
const MOBILE_DESKTOP_VIEWPORT_HEIGHT = 768;

const BASE_FONT_SIZE = 16;
const BASE_RADIUS_REM = 0.625;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getVisualViewportSize() {
  return {
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  };
}

function isPhoneViewport() {
  const { width, height } = getVisualViewportSize();
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  const hasTouch = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

  return hasTouch && shortEdge <= PHONE_MAX_SHORT_EDGE && longEdge <= PHONE_MAX_LONG_EDGE;
}

export function Root() {
  const [isPortrait, setIsPortrait] = useState(false);
  const [isPhoneLandscape, setIsPhoneLandscape] = useState(false);
  const [landscapeScaleX, setLandscapeScaleX] = useState(1);
  const [landscapeScaleY, setLandscapeScaleY] = useState(1);
  const { t } = useI18n();

  useEffect(() => {
    const htmlElement = document.documentElement;

    const resetTuningVariables = () => {
      htmlElement.style.removeProperty("--font-size");
      htmlElement.style.removeProperty("--radius");
    };

    const syncPhoneLayout = () => {
      const { width, height } = getVisualViewportSize();
      const isPhone = isPhoneViewport();
      const portrait = isPhone && height > width;
      const phoneLandscape = isPhone && !portrait;

      setIsPortrait(portrait);
      setIsPhoneLandscape(phoneLandscape);

      if (phoneLandscape) {
        const scaleX = width / MOBILE_DESKTOP_VIEWPORT_WIDTH;
        const scaleY = height / MOBILE_DESKTOP_VIEWPORT_HEIGHT;
        const axisDelta = scaleX - scaleY;

        const tunedFontSize = BASE_FONT_SIZE * clamp(1 - axisDelta * 0.18, 0.92, 1.08);
        const tunedRadius = BASE_RADIUS_REM * clamp(1 - axisDelta * 0.12, 0.9, 1.1);

        setLandscapeScaleX(scaleX);
        setLandscapeScaleY(scaleY);

        htmlElement.style.setProperty("--font-size", `${tunedFontSize}px`);
        htmlElement.style.setProperty("--radius", `${tunedRadius}rem`);
      } else {
        setLandscapeScaleX(1);
        setLandscapeScaleY(1);
        resetTuningVariables();
      }
    };

    window.addEventListener("resize", syncPhoneLayout);
    window.addEventListener("orientationchange", syncPhoneLayout);
    window.visualViewport?.addEventListener("resize", syncPhoneLayout);

    syncPhoneLayout();

    return () => {
      window.removeEventListener("resize", syncPhoneLayout);
      window.removeEventListener("orientationchange", syncPhoneLayout);
      window.visualViewport?.removeEventListener("resize", syncPhoneLayout);
      resetTuningVariables();
    };
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-950 text-white font-sans select-none" style={{ height: "100dvh" }}>
      {/* Mobile Portrait Warning overlay */}
      {isPortrait ? (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 text-center p-6 space-y-4">
          <RotateCw className="w-16 h-16 text-yellow-400 animate-spin-slow" />
          <h1 className="text-2xl font-bold">{t("Please rotate your device")}</h1>
          <p className="text-slate-300">
            {t("AIPOT is designed for the best experience in landscape mode.")}
          </p>
        </div>
      ) : isPhoneLandscape ? (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div
              style={{
                width: MOBILE_DESKTOP_VIEWPORT_WIDTH,
                height: MOBILE_DESKTOP_VIEWPORT_HEIGHT,
                transform: `scaleX(${landscapeScaleX}) scaleY(${landscapeScaleY})`,
                transformOrigin: "center center",
                willChange: "transform",
              }}
            >
              <Outlet />
            </div>
          </div>
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
