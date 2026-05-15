"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const projectOptions = [
  "Skyline Heights",
  "Marina Bay",
  "Green Valley",
  "Urban Square",
] as const;

const budgetOptions = [
  "Under 50L",
  "50L-1Cr",
  "1-2Cr",
  "2-5Cr",
  "5Cr+",
] as const;

const configurationOptions = ["1BHK", "2BHK", "3BHK", "4BHK", "Villa"] as const;

const channelOptions = ["Voice", "Web", "WhatsApp"] as const;

const schema = z.object({
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(60, "Keep it under 60 characters"),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(60, "Keep it under 60 characters"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email"),
  phone: z
    .string()
    .min(1, "Phone is required")
    .refine(
      (v) => v.replace(/\D/g, "").length >= 10,
      "Enter at least 10 digits",
    ),
  projectInterest: z.enum(projectOptions, {
    errorMap: () => ({ message: "Choose a project" }),
  }),
  budgetRange: z.enum(budgetOptions, {
    errorMap: () => ({ message: "Choose a budget range" }),
  }),
  configuration: z.enum(configurationOptions, {
    errorMap: () => ({ message: "Choose a configuration" }),
  }),
  preferredChannel: z.enum(channelOptions),
  message: z.string().max(800, "Keep your message under 800 characters").optional(),
});

type FormValues = z.infer<typeof schema>;

type SubmittedSummary = FormValues & { phoneDisplay: string };

export default function Page() {
  const [view, setView] = useState<"form" | "success">("form");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SubmittedSummary | null>(null);
  // Synchronous guard against double-submission. setSubmitting takes a
  // render tick to propagate to the disabled button; this ref blocks a
  // second invocation in the same tick.
  const inFlightRef = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    reValidateMode: "onBlur",
    defaultValues: {
      preferredChannel: "Voice",
      projectInterest: undefined as unknown as FormValues["projectInterest"],
      budgetRange: undefined as unknown as FormValues["budgetRange"],
      configuration: undefined as unknown as FormValues["configuration"],
    },
  });

  const phoneValue = watch("phone");

  const onSubmit = async (data: FormValues) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    const fullPhone = `+91 ${data.phone}`.replace(/\s+/g, " ").trim();
    const payload = {
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: data.email.trim(),
      phone: fullPhone,
      projectInterest: data.projectInterest,
      budgetRange: data.budgetRange,
      configuration: data.configuration,
      preferredChannel: data.preferredChannel,
      ...(data.message && data.message.trim().length > 0
        ? { message: data.message.trim() }
        : {}),
    };

    try {
      const res = await fetch("/api/submit-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Something went wrong. Please try again.");
      }
      setSummary({ ...data, phoneDisplay: fullPhone });
      setView("success");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "We couldn't submit your inquiry. Please try again.";
      setSubmitError(message);
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  if (view === "success" && summary) {
    return (
      <SuccessView
        summary={summary}
        onBack={() => {
          setSummary(null);
          setSubmitError(null);
          setView("form");
          reset({
            preferredChannel: "Voice",
          });
        }}
      />
    );
  }

  return (
    <main className="relative min-h-screen">
      <TopBar />

      <div className="relative mx-auto max-w-[1240px] px-6 md:px-12 lg:px-16 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 pt-12 md:pt-20">
          {/* LEFT — editorial intro */}
          <section className="lg:col-span-5 lg:sticky lg:top-28 self-start">
            <p className="fade-in text-[10.5px] tracking-editorial uppercase text-burgundy font-medium">
              Pre-Sales Inquiry
            </p>

            <h1 className="fade-in fade-in-delay-1 mt-8 font-serif text-[42px] sm:text-[52px] md:text-[60px] leading-[1.02] tracking-tight text-ink">
              Find <span className="italic font-light text-burgundy">your</span> home,
              <br className="hidden sm:block" /> on your time.
            </h1>

            <div className="fade-in fade-in-delay-2 mt-10 flex items-start gap-4 max-w-md">
              <span className="mt-[10px] block h-px w-8 bg-burgundy/70 shrink-0" />
              <p className="text-[15px] leading-[1.7] text-ink-muted font-light">
                Tell us what you&rsquo;re looking for. A senior consultant will
                speak with you within{" "}
                <span className="text-ink">30 seconds</span> &mdash; on your
                preferred channel, in your language.
              </p>
            </div>

            <div className="fade-in fade-in-delay-3 mt-14 hidden lg:block">
              <p className="text-[10px] tracking-editorial uppercase text-ink-faint">
                The Promise
              </p>
              <ul className="mt-4 space-y-3 text-[13.5px] text-ink-muted font-light">
                <li className="flex items-baseline gap-3">
                  <span className="text-burgundy font-serif text-[11px]">i.</span>
                  Senior consultant, never a call centre.
                </li>
                <li className="flex items-baseline gap-3">
                  <span className="text-burgundy font-serif text-[11px]">ii.</span>
                  Private viewings, on your schedule.
                </li>
                <li className="flex items-baseline gap-3">
                  <span className="text-burgundy font-serif text-[11px]">iii.</span>
                  No follow-ups unless invited.
                </li>
              </ul>
            </div>
          </section>

          {/* RIGHT — the form */}
          <section className="lg:col-span-7 fade-in fade-in-delay-2">
            <div className="flex items-baseline justify-between border-t border-hairline pt-6">
              <h2 className="font-serif text-[26px] md:text-[30px] text-ink">
                Inquiry Details
              </h2>
              <span className="text-[10px] tracking-editorial uppercase text-ink-faint">
                * required fields
              </span>
            </div>

            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="mt-8 space-y-10"
            >
              {/* Name row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-8">
                <Field
                  label="First Name *"
                  error={errors.firstName?.message}
                  htmlFor="firstName"
                >
                  <input
                    id="firstName"
                    type="text"
                    autoComplete="given-name"
                    placeholder="First name"
                    aria-invalid={!!errors.firstName}
                    className="field-input"
                    {...register("firstName")}
                  />
                </Field>

                <Field
                  label="Last Name *"
                  error={errors.lastName?.message}
                  htmlFor="lastName"
                >
                  <input
                    id="lastName"
                    type="text"
                    autoComplete="family-name"
                    placeholder="Last name"
                    aria-invalid={!!errors.lastName}
                    className="field-input"
                    {...register("lastName")}
                  />
                </Field>
              </div>

              {/* Contact row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-8">
                <Field
                  label="Email *"
                  error={errors.email?.message}
                  htmlFor="email"
                >
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    aria-invalid={!!errors.email}
                    className="field-input"
                    {...register("email")}
                  />
                </Field>

                <Field
                  label="Phone *"
                  error={errors.phone?.message}
                  htmlFor="phone"
                >
                  <div className="flex items-end gap-3 border-b border-hairline focus-within:border-burgundy hover:border-burgundy/70 transition-colors">
                    <span className="pb-[10px] pt-[14px] text-[15px] text-ink-muted select-none">
                      +91
                    </span>
                    <input
                      id="phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      placeholder="98765 43210"
                      aria-invalid={!!errors.phone}
                      className="field-input border-b-0 flex-1"
                      style={{ borderBottom: 0 }}
                      {...register("phone")}
                    />
                  </div>
                </Field>
              </div>

              <SectionDivider label="Property" />

              {/* Project + Budget + Config */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-8">
                <Field
                  label="Project Interest *"
                  error={errors.projectInterest?.message}
                  htmlFor="projectInterest"
                >
                  <select
                    id="projectInterest"
                    aria-invalid={!!errors.projectInterest}
                    defaultValue=""
                    className="field-input field-select"
                    {...register("projectInterest")}
                  >
                    <option value="" disabled>
                      Select a project
                    </option>
                    {projectOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Budget Range *"
                  error={errors.budgetRange?.message}
                  htmlFor="budgetRange"
                >
                  <select
                    id="budgetRange"
                    aria-invalid={!!errors.budgetRange}
                    defaultValue=""
                    className="field-input field-select"
                    {...register("budgetRange")}
                  >
                    <option value="" disabled>
                      Select a range
                    </option>
                    {budgetOptions.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Configuration *"
                  error={errors.configuration?.message}
                  htmlFor="configuration"
                >
                  <select
                    id="configuration"
                    aria-invalid={!!errors.configuration}
                    defaultValue=""
                    className="field-input field-select"
                    {...register("configuration")}
                  >
                    <option value="" disabled>
                      Select a configuration
                    </option>
                    {configurationOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>

                {/* Preferred channel — placed in the grid for visual balance on desktop */}
                <Field
                  label="Preferred Channel *"
                  error={errors.preferredChannel?.message}
                  htmlFor="preferredChannel"
                >
                  <div
                    id="preferredChannel"
                    role="radiogroup"
                    aria-label="Preferred Channel"
                    className="flex flex-wrap items-center gap-x-7 gap-y-3 pt-[14px] pb-[10px] border-b border-hairline"
                  >
                    {channelOptions.map((c) => (
                      <label key={c} className="radio-pill inline-flex items-center gap-2 text-[14px] text-ink">
                        <input
                          type="radio"
                          value={c}
                          {...register("preferredChannel")}
                        />
                        <span className="indicator" aria-hidden />
                        <span>{c}</span>
                      </label>
                    ))}
                  </div>
                </Field>
              </div>

              <SectionDivider label="Anything Else" />

              {/* Message */}
              <Field
                label="Optional Message"
                error={errors.message?.message}
                htmlFor="message"
              >
                <textarea
                  id="message"
                  rows={3}
                  placeholder="Anything else we should know?"
                  aria-invalid={!!errors.message}
                  className="field-input resize-none"
                  {...register("message")}
                />
              </Field>

              {submitError && (
                <p className="text-[13px] text-burgundy border-l-2 border-burgundy pl-3 italic font-serif">
                  {submitError}
                </p>
              )}

              {/* Submit */}
              <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-6">
                <p className="text-[11px] text-ink-faint leading-relaxed max-w-sm">
                  By submitting, you consent to be contacted by a Skyline
                  Realty consultant. Your details are not sold or shared.
                </p>

                <button
                  type="submit"
                  disabled={!isValid || submitting}
                  className="btn-primary w-full sm:w-auto"
                >
                  {submitting ? (
                    <>
                      <span className="spinner" aria-hidden />
                      <span>Connecting you to a consultant...</span>
                    </>
                  ) : (
                    <>
                      <span>Request a Call</span>
                      <span className="arrow" aria-hidden>
                        &rarr;
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* Tiny live preview of phone for confidence */}
              {phoneValue && phoneValue.replace(/\D/g, "").length >= 10 && (
                <p className="text-[11px] text-ink-faint">
                  We&rsquo;ll call you at{" "}
                  <span className="text-ink">+91 {phoneValue}</span>.
                </p>
              )}
            </form>
          </section>
        </div>
      </div>

      <Footer />
    </main>
  );
}

/* ---------------- Sub-components ---------------- */

function TopBar() {
  return (
    <header className="relative z-10 border-b border-hairline">
      <div className="mx-auto max-w-[1240px] px-6 md:px-12 lg:px-16 flex items-center justify-between py-6">
        <div className="flex items-center gap-3">
          <span className="text-[10px] tracking-editorial uppercase text-ink-faint">
            01
          </span>
          <span className="block h-px w-6 bg-hairline" />
          <span className="text-[10px] tracking-editorial uppercase text-ink-muted">
            Inquiry
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-serif italic text-[14px] text-ink-muted hidden sm:inline">
            est.
          </span>
          <span className="font-serif text-[20px] md:text-[22px] tracking-tight text-ink">
            Skyline <span className="italic font-light text-burgundy">Realty</span>
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-3">
          <span className="editorial-dot" aria-hidden />
          <span className="text-[10px] tracking-editorial uppercase text-ink-muted">
            Open · Mumbai
          </span>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="relative border-t border-hairline">
      <div className="mx-auto max-w-[1240px] px-6 md:px-12 lg:px-16 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] tracking-wide uppercase text-ink-faint">
        <p>&copy; Skyline Realty &middot; Mumbai &middot; Bengaluru</p>
        <p>
          A consultant responds in <span className="text-ink">30 seconds</span>
          , 09:00&ndash;21:00 IST.
        </p>
      </div>
    </footer>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="block h-px flex-1 bg-hairline" />
      <span className="text-[10px] tracking-editorial uppercase text-ink-faint">
        {label}
      </span>
      <span className="block h-px flex-1 bg-hairline" />
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-[10.5px] tracking-editorial uppercase text-ink-muted"
      >
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {error && (
        <p
          role="alert"
          className="mt-2 text-[12px] text-burgundy font-serif italic"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------------- Success view ---------------- */

function SuccessView({
  summary,
  onBack,
}: {
  summary: SubmittedSummary;
  onBack: () => void;
}) {
  return (
    <main className="relative min-h-screen">
      <header className="relative z-10 border-b border-hairline">
        <div className="mx-auto max-w-[1240px] px-6 md:px-12 lg:px-16 flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <span className="text-[10px] tracking-editorial uppercase text-ink-faint">
              02
            </span>
            <span className="block h-px w-6 bg-hairline" />
            <span className="text-[10px] tracking-editorial uppercase text-ink-muted">
              Received
            </span>
          </div>
          <span className="font-serif text-[20px] md:text-[22px] tracking-tight text-ink">
            Skyline <span className="italic font-light text-burgundy">Realty</span>
          </span>
          <div className="hidden sm:flex items-center gap-3">
            <span className="editorial-dot" aria-hidden />
            <span className="text-[10px] tracking-editorial uppercase text-ink-muted">
              In Queue
            </span>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1240px] px-6 md:px-12 lg:px-16 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 pt-16 md:pt-24">
          <section className="lg:col-span-6 fade-in">
            <p className="text-[10.5px] tracking-editorial uppercase text-burgundy font-medium">
              Inquiry Received
            </p>

            <h1 className="fade-in-delay-1 fade-in mt-8 font-serif text-[44px] sm:text-[56px] md:text-[68px] leading-[1.02] tracking-tight text-ink">
              We&rsquo;ll call <span className="italic font-light text-burgundy">you</span>
              <br /> in 30 seconds.
            </h1>

            <p className="fade-in fade-in-delay-2 mt-8 max-w-md font-serif italic text-[18px] leading-[1.6] text-ink-muted">
              Your inquiry has been received. A consultant is preparing now to
              speak with you on your preferred channel.
            </p>

            <div className="fade-in fade-in-delay-3 mt-12 flex items-center gap-3">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-burgundy/40 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-burgundy" />
              </span>
              <span className="text-[11px] tracking-editorial uppercase text-ink-muted">
                Dialling on {summary.preferredChannel}
              </span>
            </div>
          </section>

          <aside className="lg:col-span-6 fade-in fade-in-delay-2">
            <div className="border-t border-hairline pt-6">
              <p className="text-[10px] tracking-editorial uppercase text-ink-faint">
                What you sent
              </p>
              <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-10 text-[14px]">
                <SummaryRow
                  label="Name"
                  value={`${summary.firstName} ${summary.lastName}`}
                />
                <SummaryRow label="Email" value={summary.email} />
                <SummaryRow label="Phone" value={summary.phoneDisplay} />
                <SummaryRow label="Channel" value={summary.preferredChannel} />
                <SummaryRow label="Project" value={summary.projectInterest} />
                <SummaryRow label="Budget" value={summary.budgetRange} />
                <SummaryRow label="Configuration" value={summary.configuration} />
                {summary.message && (
                  <div className="sm:col-span-2">
                    <p className="text-[10px] tracking-editorial uppercase text-ink-faint">
                      Message
                    </p>
                    <p className="mt-1.5 font-serif italic text-ink-muted leading-relaxed">
                      &ldquo;{summary.message}&rdquo;
                    </p>
                  </div>
                )}
              </dl>
            </div>

            <div className="mt-12 border-t border-hairline pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-[12px] text-ink-muted">
                Haven&rsquo;t received a call?{" "}
                <span className="text-ink">+91 22 4000 0000</span>
              </p>
              <button
                type="button"
                onClick={onBack}
                className="group inline-flex items-center gap-2 text-[11px] tracking-editorial uppercase text-burgundy hover:text-burgundy-600 transition-colors"
              >
                <span aria-hidden className="transition-transform group-hover:-translate-x-1">
                  &larr;
                </span>
                Back to form
              </button>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </main>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] tracking-editorial uppercase text-ink-faint">
        {label}
      </dt>
      <dd className="mt-1.5 text-ink">{value}</dd>
    </div>
  );
}
