// BonaMind icon barrel — the single import surface for our own icon system.
//
// Consumers do:  import { Flame, Mic, type LucideIcon } from '@/components/icons';
// This replaces `import ... from '@/components/icons'` across the app.
//
// - createIcon / Icon / IconProps / IconNode / LucideIcon come from the factory.
// - Every concrete icon component is vendored in icons.generated.ts (regen via
//   `node scripts/vendor-lucide-icons.cjs`).

export {
  Icon,
  createIcon,
  type IconNode,
  type IconProps,
  type LucideIcon,
} from './createIcon';

export * from './icons.generated';
