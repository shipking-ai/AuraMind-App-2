import { create } from "zustand";
import { Bot, CreditCard, Database, Lock, Smartphone, Zap } from "../../components/icons";
import type { ViewKey, AuthMode, ChatMode, Deck, FlashcardData, ChatMessage, HealthCheck, IssueItem, CategoryScore, AdminUser } from "./types";

interface BonaMindState {
  view: ViewKey;
  authMode: AuthMode;
  chatMode: ChatMode;
  cmdOpen: boolean;
  setView: (v: ViewKey) => void;
  setAuthMode: (m: AuthMode) => void;
  setChatMode: (m: ChatMode) => void;
  setCmdOpen: (b: boolean) => void;
}

export const useBonaMind = create<BonaMindState>((set) => ({
  view: "landing",
  authMode: "signup",
  chatMode: "explain",
  cmdOpen: false,
  setView: (v) => set({ view: v }),
  setAuthMode: (m) => set({ authMode: m }),
  setChatMode: (m) => set({ chatMode: m }),
  setCmdOpen: (b) => set({ cmdOpen: b }),
}));

/* ---------------- Sample data ---------------- */

export const SAMPLE_DECKS: Deck[] = [
  { id: "d1", name: "Cell Biology", category: "Science", dueCount: 12, totalCards: 148, retention: 82, lastStudied: "2h ago", status: "healthy" },
  { id: "d2", name: "Spanish Vocab", category: "Languages", dueCount: 8, totalCards: 220, retention: 76, lastStudied: "5h ago", status: "weak-spots" },
  { id: "d3", name: "Algorithms", category: "Computer Science", dueCount: 4, totalCards: 96, retention: 88, lastStudied: "yesterday", status: "healthy" },
  { id: "d4", name: "US History", category: "History", dueCount: 0, totalCards: 64, retention: 91, lastStudied: "3 days ago", status: "no-due" },
];

export const SAMPLE_FLASHCARDS: FlashcardData[] = [
  { id: "c1", deckName: "Cell Biology", category: "BIOLOGY", front: "What powers ATP synthase?", back: "The proton gradient across the inner mitochondrial membrane.", explanation: "The electron transport chain pumps protons from the matrix into the intermembrane space, building up a gradient. ATP synthase uses that stored pressure to phosphorylate ADP into ATP as protons flow back through.", mnemonic: "ETC charges the battery. ATP synthase uses the battery.", cardNumber: 4, totalCards: 24 },
  { id: "c2", deckName: "Cell Biology", category: "BIOLOGY", front: "Where does glycolysis take place in the cell?", back: "In the cytoplasm (cytosol).", explanation: "Glycolysis is an anaerobic process that splits one glucose into two pyruvate molecules. It does not require mitochondria.", mnemonic: "Glycolysis = cytoplasm (both start with a soft sound).", cardNumber: 5, totalCards: 24 },
  { id: "c3", deckName: "Cell Biology", category: "BIOLOGY", front: "Name the phases of mitosis in order.", back: "Prophase \u2192 Metaphase \u2192 Anaphase \u2192 Telophase.", explanation: "PMAT: chromatin condenses (P), chromosomes line up at the equator (M), sister chromatids pull apart (A), nuclear envelope reforms and cytokinesis begins (T).", mnemonic: "Pro Met Ana Telo \u2014 'Put My Answer There.'", cardNumber: 6, totalCards: 24 },
  { id: "c4", deckName: "Cell Biology", category: "BIOLOGY", front: "What is the role of ribosomes?", back: "Ribosomes synthesize proteins by translating mRNA.", explanation: "Free ribosomes make proteins used in the cytosol; ribosomes bound to the rough ER make proteins destined for membranes or secretion.", mnemonic: "Ribosomes = protein factories.", cardNumber: 7, totalCards: 24 },
];

export const SAMPLE_CHAT: ChatMessage[] = [
  { id: "m1", role: "user", content: "I keep getting ATP synthase vs the electron transport chain confused." },
  { id: "m2", role: "ai", content: "Totally normal \u2014 they are physically chained together so it feels like one process.\n\nThe electron transport chain (ETC) sits in the inner mitochondrial membrane and pumps protons across it, building a gradient.\n\nATP synthase is the turbine next door. It lets protons flow back through and uses that flow to make ATP.\n\nMemory hook:\nETC charges the battery. ATP synthase uses the battery." },
  { id: "m3", role: "user", content: "Quiz me on this." },
  { id: "m4", role: "ai", content: "", quiz: { question: "What does the electron transport chain create that ATP synthase uses?", options: ["Oxygen molecules", "A proton gradient", "Glucose", "DNA polymerase"], correctIndex: 1 } },
];

export const SAMPLE_HEALTH_CHECKS: HealthCheck[] = [
  { id: "h1", name: "Supabase connection", status: "pass", duration: "12ms", details: "Connected. Auth provider OK.", category: "Database & Auth" },
  { id: "h2", name: "Auth service", status: "pass", duration: "8ms", details: "Email + Google providers configured.", category: "Database & Auth" },
  { id: "h3", name: "Database tables", status: "pass", duration: "16ms", details: "8/8 tables present.", category: "Database & Auth" },
  { id: "h4", name: "RLS policies", status: "warn", duration: "21ms", details: "2 tables missing RLS: review_logs, ai_chats.", category: "Security" },
  { id: "h5", name: "Stripe webhook", status: "fail", duration: "\u2014", details: "Webhook secret not verified. Live mode undetectable.", category: "Payments" },
  { id: "h6", name: "AI generation latency", status: "warn", duration: "6.2s", details: "P95 exceeds 5s. Risk of Vercel function timeout.", category: "AI Services" },
  { id: "h7", name: "FSRS scheduler", status: "pass", duration: "4ms", details: "v5.2 algorithm. Reviews scheduled correctly.", category: "Performance" },
  { id: "h8", name: "Service worker (PWA)", status: "pass", duration: "11ms", details: "Registered. Offline fallback active.", category: "PWA / Offline" },
  { id: "h9", name: "HTTPS enforced", status: "pass", duration: "\u2014", details: "HSTS header present.", category: "Security" },
  { id: "h10", name: "CSP header", status: "warn", duration: "\u2014", details: "CSP missing 'connect-src' for streaming.", category: "Security" },
];

export const SAMPLE_ISSUES: IssueItem[] = [
  { id: "i1", severity: "critical", title: "Stripe webhook not verified", body: "Your Stripe webhook secret is not set. Subscription events may be silently dropped, leaving Pro users in an unverified state.", fix: "Add STRIPE_WEBHOOK_SECRET to your Vercel env, then re-deploy. Verify the endpoint in the Stripe dashboard.", affected: ["api/stripe/webhook.ts", "src/lib/stripe.ts"] },
  { id: "i2", severity: "critical", title: "AI generation timeout risk", body: "P95 generation latency is 6.2s. Vercel functions time out at 10s, so a small tail of users will see failed generations during launch.", fix: "Switch to a streaming Edge Function or return partial results progressively.", affected: ["api/generate.ts", "src/hooks/useAIGeneration.ts"] },
  { id: "i3", severity: "warning", title: "2 tables missing RLS policies", body: "review_logs and ai_chats have no row-level security. Authenticated users could potentially query other users' rows.", fix: "Add RLS policies: `using (user_id = auth.uid())` on both tables.", affected: ["prisma/schema.prisma", "supabase/migrations/"] },
  { id: "i4", severity: "warning", title: "CSP header missing connect-src", body: "Streaming AI responses may be blocked by the browser CSP on Safari.", fix: "Update middleware CSP to include the AI provider's domain in connect-src.", affected: ["middleware.ts"] },
  { id: "i5", severity: "info", title: "No visible privacy policy", body: "A /privacy route does not exist. Stripe and the App Store will require this at launch.", fix: "Add /privacy and /terms routes, link them in the footer.", affected: ["src/app/(marketing)/"] },
];

export const SAMPLE_CATEGORY_SCORES: CategoryScore[] = [
  { name: "Database & Auth", icon: Database, score: 94 },
  { name: "AI Services", icon: Bot, score: 68 },
  { name: "Payments", icon: CreditCard, score: 42 },
  { name: "Security", icon: Lock, score: 76 },
  { name: "Performance", icon: Zap, score: 88 },
  { name: "PWA / Offline", icon: Smartphone, score: 95 },
];

export const SAMPLE_ADMIN_USERS: AdminUser[] = [
  { id: "u1", email: "alex@university.edu", plan: "pro", cards: 412, lastActive: "Today", churned: false },
  { id: "u2", email: "maria.k@gmail.com", plan: "pro", cards: 268, lastActive: "Today", churned: false },
  { id: "u3", email: "jonas@proton.me", plan: "free", cards: 64, lastActive: "2 days ago", churned: false },
  { id: "u4", email: "chioma.o@outlook.com", plan: "pro", cards: 188, lastActive: "5 days ago", churned: false },
  { id: "u5", email: "rick@oldmail.com", plan: "free", cards: 12, lastActive: "42 days ago", churned: true },
  { id: "u6", email: "sara.med@uni.edu", plan: "pro", cards: 740, lastActive: "Today", churned: false },
  { id: "u7", email: "tom.dev@gmail.com", plan: "free", cards: 38, lastActive: "11 days ago", churned: false },
];
