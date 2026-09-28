"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { cn } from "@/components/utils";

interface ProjectType {
  id: string;
  label: string;
  hint: string;
  size: number;
  sizeNote: string;
}

const PROJECT_TYPES: ProjectType[] = [
  { id: "cleanout", label: "Home cleanout", hint: "Furniture, clutter, estate cleanout", size: 20, sizeNote: "Fits a typical room-by-room cleanout." },
  { id: "garage", label: "Garage / junk removal", hint: "Boxes, old tools, general junk", size: 10, sizeNote: "Compact and driveway-friendly." },
  { id: "remodel", label: "Remodel", hint: "Kitchen, bath, flooring tear-out", size: 20, sizeNote: "The most popular size for remodels." },
  { id: "roofing", label: "Roofing", hint: "Shingles and underlayment", size: 20, sizeNote: "Heavy material — watch weight limits." },
  { id: "yard", label: "Yard work", hint: "Storm debris, tree work, landscaping", size: 20, sizeNote: "Brush and branches pack loosely." },
  { id: "construction", label: "Construction", hint: "Job-site debris, C&D", size: 30, sizeNote: "Room for bulky construction waste." },
];

const SIZE_OPTIONS = [10, 15, 20, 30, 40];

const MATERIALS = [
  "Household junk",
  "Furniture",
  "Yard waste / brush",
  "Construction debris",
  "Roofing shingles",
  "Concrete / dirt",
  "Cardboard / recycling",
  "Appliances",
];

const SIZE_TO_CATEGORY: Record<number, string> = {
  10: "roll_off_10",
  15: "roll_off_15",
  20: "roll_off_20",
  30: "roll_off_30",
  40: "roll_off_40",
};

export function QuizClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [project, setProject] = useState<ProjectType | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [material, setMaterial] = useState("");
  const [zip, setZip] = useState("");
  const [zipError, setZipError] = useState<string | null>(null);

  const pickProject = (p: ProjectType) => {
    setProject(p);
    setSize(p.size);
    setStep(1);
  };

  const finish = () => {
    if (!/^\d{5}$/.test(zip.trim())) {
      setZipError("Enter a valid 5-digit ZIP code.");
      return;
    }
    setZipError(null);
    const params = new URLSearchParams();
    params.set("zip", zip.trim());
    if (size) {
      params.set("sizeYards", String(size));
      params.set("category", SIZE_TO_CATEGORY[size]);
    }
    if (material) params.set("material", material);
    if (project) params.set("project", project.id);
    router.push(`/search?${params.toString()}`);
  };

  return (
    <>
        <p className="text-sm font-semibold text-emerald-700">Size quiz · 60 seconds</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
          What size dumpster do you need?
        </h1>

        {/* Progress */}
        <div className="mt-4 flex gap-2" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-emerald-600" : "bg-stone-200")} />
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-500" aria-live="polite">Step {step + 1} of 4</p>

        {step === 0 && (
          <section aria-label="Project type" className="mt-6">
            <h2 className="font-bold text-stone-900">What kind of project is it?</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {PROJECT_TYPES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickProject(p)}
                  className="rounded-xl border border-stone-200 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  <span className="block font-bold text-stone-900">{p.label}</span>
                  <span className="mt-0.5 block text-sm text-stone-500">{p.hint}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 1 && project && (
          <section aria-label="Recommended size" className="mt-6">
            <h2 className="font-bold text-stone-900">We recommend a {size}-yard dumpster</h2>
            <p className="mt-1 text-sm text-stone-500">{project.sizeNote} Adjust if you like:</p>
            <div className="mt-4 grid grid-cols-5 gap-2" role="radiogroup" aria-label="Dumpster size">
              {SIZE_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={size === s}
                  onClick={() => setSize(s)}
                  className={cn(
                    "rounded-xl border p-3 text-center font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600",
                    size === s
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-stone-300 bg-white text-stone-700 hover:border-emerald-600",
                  )}
                >
                  {s}
                  <span className="block text-[11px] font-medium opacity-80">yd</span>
                </button>
              ))}
            </div>
            <Card className="mt-4 bg-stone-50 text-sm text-stone-600">
              Rule of thumb: 10 yd ≈ 3 pickup loads · 20 yd ≈ 6 · 30 yd ≈ 9 · 40 yd ≈ 12. When in
              doubt, size up — overage fees cost more than the next size.
            </Card>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
              <Button onClick={() => setStep(2)} className="flex-1">Continue</Button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section aria-label="Material type" className="mt-6">
            <h2 className="font-bold text-stone-900">What are you throwing away?</h2>
            <p className="mt-1 text-sm text-stone-500">
              Heavy materials like concrete and shingles have weight limits — this helps match you to the right listing.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Material type">
              {MATERIALS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={material === m}
                  onClick={() => setMaterial(m)}
                  className={cn(
                    "rounded-xl border p-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600",
                    material === m
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                      : "border-stone-300 bg-white text-stone-700 hover:border-emerald-600",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} className="flex-1" disabled={!material}>
                Continue
              </Button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section aria-label="Location" className="mt-6">
            <h2 className="font-bold text-stone-900">Where do you need it delivered?</h2>
            <div className="mt-4">
              <Field label="ZIP code" htmlFor="quiz-zip">
                <Input
                  id="quiz-zip"
                  value={zip}
                  onChange={(e) => {
                    setZip(e.target.value);
                    setZipError(null);
                  }}
                  placeholder="32801"
                  inputMode="numeric"
                  maxLength={5}
                  autoComplete="postal-code"
                />
              </Field>
            </div>
            {zipError && (
              <div className="mt-3">
                <Alert tone="red">{zipError}</Alert>
              </div>
            )}
            <Card className="mt-4 bg-emerald-50 text-sm text-stone-700">
              <strong>Your match:</strong> {size}-yard dumpster
              {material ? ` · ${material.toLowerCase()}` : ""}
              {project ? ` · ${project.label.toLowerCase()}` : ""}. We&apos;ll show total prices from
              verified haulers serving your ZIP.
            </Card>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={finish} className="flex-1" size="lg">
                See available dumpsters
              </Button>
            </div>
          </section>
        )}
    </>
  );
}
