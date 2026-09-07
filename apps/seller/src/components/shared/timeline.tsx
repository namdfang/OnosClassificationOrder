"use client";

interface TimelineProps {
  steps: string[];
  currentStep: number;
  color?: string;
}

export function Timeline({ steps, currentStep, color = "#141d2e" }: TimelineProps) {
  return (
    <div className="flex items-center w-full gap-0">
      {steps.map((step, i) => {
        const done = i <= currentStep;
        const isActive = i === currentStep;
        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border-2 transition-all"
                style={{
                  borderColor: done ? color : "var(--color-border1)",
                  background: done ? color : "var(--color-card)",
                  color: done ? "#fff" : "var(--color-text-muted)",
                  boxShadow: isActive ? `0 0 0 3px ${color}25` : "none",
                }}
              >
                {done && i < currentStep ? "\u2713" : i + 1}
              </div>
              <div
                className="text-[8px] mt-1 text-center whitespace-nowrap font-semibold"
                style={{ color: done ? color : "var(--color-text-muted)" }}
              >
                {step}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div
                className="flex-1 h-[2px] mx-1 rounded-full"
                style={{ background: i < currentStep ? color : "var(--color-border1)" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
