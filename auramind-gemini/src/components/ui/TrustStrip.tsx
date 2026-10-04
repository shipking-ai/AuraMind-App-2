"use client";

import { useCountUp, useInView } from "@/lib/auramind/hooks";

/**
 * TrustStrip — three claims about the product, all substantiable.
 *
 * This previously animated three hardcoded user metrics: 1,248 active
 * learners, 84,000 cards reviewed, 91% average retention. BonaMind has not
 * launched, so all three were fabricated, and the first sat directly below
 * a "Join 1,248 learners" line — the same invented number twice.
 *
 * Beyond being untrue, invented metrics are the specific claim type the FTC
 * treats as requiring substantiation, and they are trivially disproved by
 * anyone who checks. They are replaced here with facts about the software
 * that can be verified from the codebase:
 *
 *   - FSRS v5 is the scheduler (services/study/fsrs.ts).
 *   - 90% is `requestRetention` in DEFAULT_CONFIG — what the scheduler
 *     optimises for. It is a statement about configuration, not a claim
 *     about what users have achieved.
 *   - Hands-free voice study is implemented and shipping.
 *
 * Swap these back to live numbers once real usage exists; read them from
 * Supabase rather than hardcoding, so they can never drift into fiction.
 */
export function TrustStrip() {
  const { ref, inView } = useInView<HTMLDivElement>();
  // The one number here is the scheduler's target retention, so the
  // count-up still lands on something real.
  const retentionPct = useCountUp(90, 1400, inView);

  return (
    <section ref={ref} className="border-y border-[#2A2A3A] bg-[#0A0A0F] py-10">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 md:grid-cols-3">
        <div className="text-center">
          <div className="font-serif text-4xl italic text-[#F0EFFE] md:text-5xl">
            FSRS v5
          </div>
          <div className="mt-1 text-xs uppercase tracking-widest text-[#7A7A96]">
            Scheduling algorithm
          </div>
        </div>

        <div className="text-center md:border-x md:border-[#2A2A3A]">
          <div className="font-serif text-4xl italic text-[#F0EFFE] md:text-5xl tabular-nums">
            {retentionPct}%
          </div>
          <div className="mt-1 text-xs uppercase tracking-widest text-[#7A7A96]">
            Target retention
          </div>
        </div>

        <div className="text-center">
          <div className="font-serif text-4xl italic text-[#F0EFFE] md:text-5xl">
            Hands-free
          </div>
          <div className="mt-1 text-xs uppercase tracking-widest text-[#7A7A96]">
            Voice study mode
          </div>
        </div>
      </div>
    </section>
  );
}
