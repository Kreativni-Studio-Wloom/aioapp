"use client";

import { motion } from "motion/react";

/**
 * Route fade-in. Opacity only: a transform on this wrapper would turn it into the containing block
 * for `position: fixed` descendants (FABs, rest-timer bar) and pin them mid-page.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}
