/**
 * ReducedMotionGuard
 *
 * Single point of authority for prefers-reduced-motion across the whole app.
 * The explicit app preference is stronger than the OS preference, so a user
 * can turn motion off from Settings and have it follow them between routes.
 */
import React from "react";
import { MotionConfig, LazyMotion, domAnimation } from "framer-motion";
import { useAppPreference } from "../../lib/appPreferences";

interface ReducedMotionGuardProps {
  children: React.ReactNode;
}

const ReducedMotionGuard: React.FC<ReducedMotionGuardProps> = ({ children }) => {
  const [reduceMotion] = useAppPreference("bonamind_reduceMotion", false);

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      <LazyMotion features={domAnimation} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
};

export default ReducedMotionGuard;
