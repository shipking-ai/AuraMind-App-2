import { motion } from 'framer-motion';

/**
 * TypingIndicator — animated dots that appear while Prof. Linnea is
 * generating a response. Pure presentational; no side-effects.
 *
 * Usage:
 *   {isLoading && <TypingIndicator />}
 */
export function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 px-7 py-5 rounded-[32px] bg-zinc-900/5 border border-zinc-800 backdrop-blur-xl w-fit">
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block h-2 w-2 rounded-full bg-violet-400"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
      <span className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500">
        Thinking…
      </span>
    </div>
  );
}

export default TypingIndicator;
