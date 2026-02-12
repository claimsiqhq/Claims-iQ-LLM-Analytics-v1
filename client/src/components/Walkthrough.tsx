import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronRight, ChevronLeft } from "lucide-react";

interface WalkthroughStep {
  target: string;
  title: string;
  description: string;
  placement: "top" | "bottom" | "left" | "right";
}

const STEPS: WalkthroughStep[] = [
  {
    target: '[data-testid="select-client-trigger"]',
    title: "Client Selector",
    description:
      "Switch between client organizations to view their claims data and analytics.",
    placement: "bottom",
  },
  {
    target: '[data-testid="button-new-conversation"]',
    title: "Chat with Your Data",
    description:
      'Ask questions in plain English like "Show me SLA breach rate this month by adjuster" and get instant charts and insights.',
    placement: "right",
  },
  {
    target: '[data-tour="kpi-strip"]',
    title: "Live KPI Dashboard",
    description:
      "Real-time key metrics at a glance — queue depth, SLA breach rate, and claim volume with trend indicators.",
    placement: "bottom",
  },
  {
    target: '[data-tour="morning-brief"]',
    title: "Morning Brief",
    description:
      "AI-generated daily operations briefing with recommended actions and priority alerts for your team.",
    placement: "bottom",
  },
  {
    target: '[data-tour="canvas-area"]',
    title: "Analytics Canvas",
    description:
      "Charts from your questions appear here side-by-side. Click data points to drill down, export to CSV, or save as a dashboard.",
    placement: "top",
  },
  {
    target: '[data-testid="btn-voice-toggle"]',
    title: "Voice Assistant",
    description:
      "Talk to your data hands-free. Ask questions by voice and hear AI-spoken insights while charts appear on screen.",
    placement: "top",
  },
  {
    target: '[data-testid="btn-settings"]',
    title: "Settings & Data Import",
    description:
      "Import spreadsheets, manage clients, configure AI models, and customize your preferences.",
    placement: "bottom",
  },
];

const STORAGE_KEY = "claimsiq_walkthrough_completed";

interface WalkthroughProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Walkthrough: React.FC<WalkthroughProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const step = STEPS[currentStep];

  const findAndScrollTarget = useCallback(() => {
    if (!step) return null;
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) return null;
    el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    return el;
  }, [step]);

  const updatePosition = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) {
      setTargetRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setTargetRect(rect);
  }, [step]);

  useEffect(() => {
    if (!isOpen) return;
    setIsAnimating(true);
    const el = findAndScrollTarget();
    const timer = setTimeout(() => {
      if (el) {
        setTargetRect(el.getBoundingClientRect());
      } else {
        setTargetRect(null);
      }
      setIsAnimating(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [currentStep, isOpen, findAndScrollTarget]);

  useEffect(() => {
    if (!isOpen) return;
    const onUpdate = () => {
      updatePosition();
      rafRef.current = requestAnimationFrame(onUpdate);
    };
    const timerId = setTimeout(() => {
      rafRef.current = requestAnimationFrame(onUpdate);
    }, 500);
    return () => {
      clearTimeout(timerId);
      cancelAnimationFrame(rafRef.current);
    };
  }, [isOpen, updatePosition, currentStep]);

  useEffect(() => {
    if (!targetRect || !tooltipRef.current) return;

    const tw = tooltipRef.current.offsetWidth;
    const th = tooltipRef.current.offsetHeight;
    const pad = 16;
    const gap = 14;

    let top = 0;
    let left = 0;

    switch (step.placement) {
      case "bottom":
        top = targetRect.bottom + gap;
        left = targetRect.left + targetRect.width / 2 - tw / 2;
        break;
      case "top":
        top = targetRect.top - th - gap;
        left = targetRect.left + targetRect.width / 2 - tw / 2;
        break;
      case "right":
        top = targetRect.top + targetRect.height / 2 - th / 2;
        left = targetRect.right + gap;
        break;
      case "left":
        top = targetRect.top + targetRect.height / 2 - th / 2;
        left = targetRect.left - tw - gap;
        break;
    }

    if (top + th > window.innerHeight - pad) {
      top = targetRect.top - th - gap;
    }
    if (top < pad) {
      top = targetRect.bottom + gap;
    }
    if (left + tw > window.innerWidth - pad) {
      left = window.innerWidth - tw - pad;
    }
    if (left < pad) {
      left = pad;
    }

    top = Math.max(pad, Math.min(top, window.innerHeight - th - pad));

    setTooltipPos({ top, left });
  }, [targetRect, step]);

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      handleFinish();
    }
  }, [currentStep]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  const handleFinish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setCurrentStep(0);
    onClose();
  }, [onClose]);

  const handleSkip = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setCurrentStep(0);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleSkip();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleSkip, handleNext, handlePrev]);

  if (!isOpen) return null;

  const spotlightPad = 8;

  return (
    <div className="fixed inset-0 z-[200]" data-testid="walkthrough-overlay">
      <svg
        className="fixed inset-0 w-full h-full"
        style={{ pointerEvents: "auto" }}
        onClick={handleSkip}
      >
        <defs>
          <mask id="walkthrough-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - spotlightPad}
                y={targetRect.top - spotlightPad}
                width={targetRect.width + spotlightPad * 2}
                height={targetRect.height + spotlightPad * 2}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(52, 42, 79, 0.75)"
          mask="url(#walkthrough-mask)"
        />
      </svg>

      {targetRect && (
        <div
          className="fixed rounded-xl border-2 border-brand-purple shadow-[0_0_0_4px_rgba(119,99,183,0.25)] pointer-events-none transition-all duration-300"
          style={{
            left: targetRect.left - spotlightPad,
            top: targetRect.top - spotlightPad,
            width: targetRect.width + spotlightPad * 2,
            height: targetRect.height + spotlightPad * 2,
          }}
        />
      )}

      <div
        ref={tooltipRef}
        className={`fixed z-[201] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-surface-grey-lavender dark:border-gray-600 w-[340px] transition-opacity duration-300 ${isAnimating ? "opacity-0" : "opacity-100"}`}
        style={{ top: `${tooltipPos.top}px`, left: `${tooltipPos.left}px`, pointerEvents: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-brand-purple text-white flex items-center justify-center text-xs font-bold shrink-0">
                {currentStep + 1}
              </div>
              <h3 className="font-display font-bold text-brand-deep-purple dark:text-gray-100 text-base">
                {step.title}
              </h3>
            </div>
            <button
              onClick={handleSkip}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              data-testid="btn-walkthrough-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
            {step.description}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentStep(i)}
                  className={`h-2 rounded-full transition-all duration-200 ${
                    i === currentStep
                      ? "bg-brand-purple w-5"
                      : i < currentStep
                        ? "bg-brand-purple/40 w-2"
                        : "bg-gray-200 dark:bg-gray-600 w-2"
                  }`}
                  data-testid={`walkthrough-dot-${i}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  onClick={handlePrev}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-brand-deep-purple dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1"
                  data-testid="btn-walkthrough-prev"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}
              {currentStep === 0 && (
                <button
                  onClick={handleSkip}
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                  data-testid="btn-walkthrough-skip"
                >
                  Skip tour
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-4 py-1.5 text-sm font-semibold bg-brand-purple hover:bg-brand-purple/90 text-white rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                data-testid="btn-walkthrough-next"
              >
                {currentStep < STEPS.length - 1 ? (
                  <>
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </>
                ) : (
                  "Finish"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export function shouldShowWalkthrough(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== "true";
}

export function resetWalkthrough(): void {
  localStorage.removeItem(STORAGE_KEY);
}
