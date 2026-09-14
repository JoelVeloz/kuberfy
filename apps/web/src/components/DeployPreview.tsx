import { MotionConfig } from "motion/react";
import { AnimatedSpan, Terminal, TypingAnimation } from "@/components/ui/terminal";

export function DeployPreview() {
  return (
    <MotionConfig reducedMotion="user">
      <Terminal>
        <TypingAnimation duration={35}>$ git push origin main</TypingAnimation>
        <AnimatedSpan>==&gt; cloning repository</AnimatedSpan>
        <AnimatedSpan>==&gt; building image</AnimatedSpan>
        <AnimatedSpan>==&gt; rolling update, zero downtime</AnimatedSpan>
        <AnimatedSpan>==&gt; waiting for health check</AnimatedSpan>
        <AnimatedSpan className="text-success">✓ live in 4s</AnimatedSpan>
      </Terminal>
    </MotionConfig>
  );
}
