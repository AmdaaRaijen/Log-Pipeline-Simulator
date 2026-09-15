"use client";
import React from "react";
import { Download, Settings, ShieldAlert, FileCode2 } from "lucide-react";

const STEPS = [
  { label: "Setup", icon: Settings },
  { label: "Usecases", icon: ShieldAlert },
  { label: "YAML Config", icon: FileCode2 },
  { label: "VRL Filter", icon: FileCode2 },
  { label: "Review", icon: Download },
];

export function StepIndicator({
  current,
  hasCustomUsecase,
}: {
  current: number;
  hasCustomUsecase: boolean;
}) {
  const visibleSteps = hasCustomUsecase ? STEPS : STEPS.filter((_, i) => i !== 3);

  return (
    <div className="flex items-center gap-0 mb-6">
      {visibleSteps.map((step, idx) => {
        const realIdx = hasCustomUsecase ? idx : idx >= 3 ? idx + 1 : idx;
        const isCurrent = realIdx === current;
        const isDone = realIdx < current;
        return (
          <React.Fragment key={idx}>
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  isCurrent ? "bg-blue-600 text-white" :
                  isDone ? "bg-green-600 text-white" :
                  "bg-gray-700 text-gray-400"
                }`}
              >
                {isDone ? "✓" : idx + 1}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap ${isCurrent ? "text-white" : "text-gray-500"}`}>
                {step.label}
              </span>
            </div>
            {idx < visibleSteps.length - 1 && (
              <div className={`h-px flex-1 mx-3 min-w-4 ${realIdx < current ? "bg-green-600" : "bg-gray-700"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
