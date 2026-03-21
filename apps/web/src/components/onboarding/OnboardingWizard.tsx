"use client";

import { useState, useCallback, type FormEvent } from "react";
import {
  Camera,
  Bell,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Wifi,
  X,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("osp_access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

const STORAGE_KEY = "osp_onboarding_complete";

const STEPS = ["welcome", "add-camera", "alerts", "done"] as const;
type Step = (typeof STEPS)[number];

interface OnboardingWizardProps {
  readonly onComplete: () => void;
  readonly onAddCamera: (data: {
    name: string;
    protocol: string;
    connectionUri: string;
    location?: { label?: string };
  }) => Promise<void>;
}

export function OnboardingWizard({
  onComplete,
  onAddCamera,
}: OnboardingWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep: Step = STEPS[stepIndex] ?? "welcome";

  // Camera form state
  const [cameraName, setCameraName] = useState("");
  const [protocol, setProtocol] = useState("rtsp");
  const [connectionUri, setConnectionUri] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cameraAdded, setCameraAdded] = useState(false);

  // Alerts state
  const [motionAlerts, setMotionAlerts] = useState(true);

  const goNext = useCallback(() => {
    setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
  }, []);

  const goBack = useCallback(() => {
    setStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleSkip = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    onComplete();
  }, [onComplete]);

  const handleFinish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    onComplete();
  }, [onComplete]);

  const handleAddCamera = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!cameraName.trim() || !connectionUri.trim()) return;

      setSubmitting(true);
      setSubmitError(null);
      try {
        const data: {
          name: string;
          protocol: string;
          connectionUri: string;
          location?: { label?: string };
        } = {
          name: cameraName.trim(),
          protocol,
          connectionUri: connectionUri.trim(),
        };
        if (locationLabel.trim()) {
          data.location = { label: locationLabel.trim() };
        }
        await onAddCamera(data);
        setCameraAdded(true);
        goNext();
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : "Failed to add camera",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [cameraName, protocol, connectionUri, locationLabel, onAddCamera, goNext],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/95 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-8 shadow-2xl">
        {/* Skip button */}
        <button
          type="button"
          onClick={handleSkip}
          className="absolute top-4 right-4 p-1 text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer"
          aria-label="Skip onboarding"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((step, i) => (
            <div
              key={step}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === stepIndex
                  ? "w-6 bg-blue-500"
                  : i < stepIndex
                    ? "w-2 bg-blue-500/50"
                    : "w-2 bg-zinc-700"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[300px]">
          {/* Step 1: Welcome */}
          {currentStep === "welcome" && (
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10">
                  <Camera className="h-8 w-8 text-blue-500" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-zinc-50 mb-3">
                Welcome to OSP
              </h2>
              <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                Open Security Platform is your self-hosted video surveillance
                solution. Connect IP cameras, detect motion, receive alerts, and
                review recordings -- all from one place.
              </p>
              <div className="grid grid-cols-2 gap-3 text-left mb-6">
                {[
                  { icon: Camera, label: "Connect IP cameras via RTSP/ONVIF" },
                  { icon: Bell, label: "Real-time motion and AI alerts" },
                  {
                    icon: CheckCircle2,
                    label: "24/7 recording with smart retention",
                  },
                  { icon: Wifi, label: "Network camera auto-discovery" },
                ].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex items-start gap-2 rounded-lg bg-zinc-800/50 p-3"
                  >
                    <Icon className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                    <span className="text-xs text-zinc-300">{label}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors duration-150 cursor-pointer"
              >
                Get Started
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Step 2: Add Camera */}
          {currentStep === "add-camera" && (
            <div>
              <h2 className="text-xl font-bold text-zinc-50 mb-2">
                Add Your First Camera
              </h2>
              <p className="text-sm text-zinc-400 mb-5">
                Connect an IP camera to start monitoring. You can add more
                later.
              </p>

              <form onSubmit={handleAddCamera} className="space-y-3">
                <div>
                  <label
                    htmlFor="onb-camera-name"
                    className="block text-sm font-medium text-zinc-300 mb-1"
                  >
                    Camera Name
                  </label>
                  <input
                    id="onb-camera-name"
                    type="text"
                    value={cameraName}
                    onChange={(e) => setCameraName(e.target.value)}
                    placeholder="Front Door Camera"
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Protocol
                  </label>
                  <div className="flex rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden">
                    {(["rtsp", "onvif"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setProtocol(p)}
                        className={`flex-1 px-3 py-1.5 text-sm font-medium uppercase tracking-wide transition-colors cursor-pointer ${
                          protocol === p
                            ? "bg-blue-500/15 text-blue-400 border-b-2 border-blue-500"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="onb-camera-uri"
                    className="block text-sm font-medium text-zinc-300 mb-1"
                  >
                    Connection URI
                  </label>
                  <input
                    id="onb-camera-uri"
                    type="text"
                    value={connectionUri}
                    onChange={(e) => setConnectionUri(e.target.value)}
                    placeholder={
                      protocol === "rtsp"
                        ? "rtsp://192.168.1.100:554/stream"
                        : "http://192.168.1.100:80/onvif/device_service"
                    }
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor="onb-camera-location"
                    className="block text-sm font-medium text-zinc-300 mb-1"
                  >
                    Location{" "}
                    <span className="text-zinc-500 font-normal">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="onb-camera-location"
                    type="text"
                    value={locationLabel}
                    onChange={(e) => setLocationLabel(e.target.value)}
                    placeholder="Building A, Floor 2"
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>

                {submitError && (
                  <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-md">
                    {submitError}
                  </p>
                )}

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={goBack}
                    className="inline-flex items-center gap-1 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors duration-150 cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={goNext}
                      className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer"
                    >
                      Skip
                    </button>
                    <button
                      type="submit"
                      disabled={
                        submitting ||
                        !cameraName.trim() ||
                        !connectionUri.trim()
                      }
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {submitting && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      {submitting ? "Adding..." : "Add Camera"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* Step 3: Set Up Alerts */}
          {currentStep === "alerts" && (
            <div>
              <h2 className="text-xl font-bold text-zinc-50 mb-2">
                Set Up Alerts
              </h2>
              <p className="text-sm text-zinc-400 mb-6">
                Configure which notifications you want to receive.
              </p>

              <div className="space-y-3 mb-8">
                <label className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-4 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Bell className="h-5 w-5 text-amber-400" />
                    <div>
                      <p className="text-sm font-medium text-zinc-200">
                        Motion Alerts
                      </p>
                      <p className="text-xs text-zinc-500">
                        Get notified when motion is detected
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMotionAlerts((prev) => !prev)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 cursor-pointer ${
                      motionAlerts ? "bg-blue-500" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
                        motionAlerts ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </label>
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex items-center gap-1 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors duration-150 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors duration-150 cursor-pointer"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {currentStep === "done" && (
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/10">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-zinc-50 mb-3">
                You're All Set!
              </h2>
              <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                {cameraAdded
                  ? "Your camera has been added and is ready to go. Head to the dashboard to see your live feed."
                  : "Your workspace is ready. Add a camera from the dashboard to get started with monitoring."}
              </p>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 mb-6 text-left">
                <h3 className="text-sm font-medium text-zinc-200 mb-2">
                  Quick Summary
                </h3>
                <ul className="space-y-1.5 text-xs text-zinc-400">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    Account configured
                  </li>
                  <li className="flex items-center gap-2">
                    {cameraAdded ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full border border-zinc-600" />
                    )}
                    {cameraAdded ? "Camera added" : "No camera added yet"}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    Motion alerts {motionAlerts ? "enabled" : "disabled"}
                  </li>
                </ul>
              </div>

              <button
                type="button"
                onClick={handleFinish}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors duration-150 cursor-pointer"
              >
                Go to Dashboard
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
