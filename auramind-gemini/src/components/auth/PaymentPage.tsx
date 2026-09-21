import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Check, Sparkles, ShieldCheck, Brain, Bot, BookOpen, Zap } from '@/components/icons';
import { ONBOARDING_ROLE_LABEL } from '../../lib/onboardingRoles';

interface PaymentPageProps {
  user: { id: string; email: string; name: string };
  cancelled?: boolean;
}

const PLANS = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: '$7.99',
    interval: '/month',
    priceId: import.meta.env.VITE_STRIPE_PRICE_ID_MONTHLY ?? '',
    badge: null,
    desc: 'Full access, flexible billing.',
  },
  {
    id: 'annual',
    name: 'Annual',
    price: '$3.99',
    interval: '/month',
    priceId: import.meta.env.VITE_STRIPE_PRICE_ID_ANNUAL ?? '',
    badge: 'Save 50%',
    totalBilled: '$47.88 billed annually',
    desc: 'The complete upgrade. Best value.',
  },
];

const FEATURES = [
  { icon: Brain, label: 'AI Flashcard Generation', detail: 'Turn notes, PDFs, and outlines into smart flashcards instantly.' },
  { icon: Bot, label: '4 AI Study Agent Modes', detail: 'Study From Anything, Study Buddy, Content Pipeline, and Research Assistant.' },
  { icon: BookOpen, label: 'Unlimited Decks & Cards', detail: 'Create as many decks as you need with spaced repetition scheduling.' },
  { icon: Sparkles, label: 'Research & Content Tools', detail: 'Convert PowerPoint, PDFs, and text into structured study materials.' },
];

const PaymentPage: React.FC<PaymentPageProps> = ({ user, cancelled = false }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState('annual');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Personalization carried over from onboarding (`/subscribe?role=teacher&topic=...`).
  const roleParam = searchParams.get('role');
  const roleLabel = roleParam ? ONBOARDING_ROLE_LABEL[roleParam as keyof typeof ONBOARDING_ROLE_LABEL] : null;
  const topic = searchParams.get('topic');

  const handleSubscribe = async () => {
    const plan = PLANS.find((p) => p.id === selectedPlan);
    if (!plan) return;

    setLoading(true);
    setError('');

    try {
      // The API authenticates checkout: identity is derived from the bearer
      // token server-side, never from the body.
      const { supabase } = await import('../../services/database/supabase');
      const { data: { session } } = await supabase!.auth.getSession();
      const token = session?.access_token;
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/stripe/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          priceId: plan.priceId,
          userId: user.id,
          email: user.email,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Server error (${response.status}). Please try again or contact support.`);
      }

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.alreadySubscribed) {
        setError('You are already subscribed to a plan.');
      } else {
        setError(data.error || 'Could not start checkout.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex flex-col relative overflow-hidden">
      {/* Aurora glow background */}
      <div className="fixed inset-0 pointer-events-none">
        <img
          src="/auramind/aurora-glow.png"
          alt=""
          className="w-full h-full object-cover"
          style={{ opacity: 0.2 }}
        />
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, #7C3AED 0%, transparent 70%)', filter: 'blur(100px)' }}
        />
        <div
          className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #3B82F6 0%, transparent 70%)', filter: 'blur(80px)' }}
        />
      </div>

      {/* Back link */}
      <div className="px-6 py-4 relative z-10">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-[#7A7A96] hover:text-[#F0EFFE] text-xs transition-colors"
        >
          <ArrowLeft size={14} />
          Back to home
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 pb-16 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-4xl"
        >
          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-full text-[#8B5CF6] text-[10px] font-semibold uppercase tracking-wider mb-6">
              <Zap size={12} />
              7-Day Free Trial
            </div>
            {roleLabel && (
              <div className="mb-3 text-[#A78BFA] text-xs">
                {roleParam === 'teacher' ? 'The Teacher plan' : `${roleLabel} plan`} — access to everything.
              </div>
            )}
            <h1 className="text-[#F0EFFE] text-3xl font-light tracking-tight mb-3">
              {topic ? `Your "${topic}" deck is ready.` : 'Upgrade your learning'}
            </h1>
            <p className="text-[#7A7A96] text-sm max-w-md mx-auto">
              {roleParam === 'teacher'
                ? 'Unlock AI-powered prep, class-ready study tools, and unlimited decks for you and your learners.'
                : 'Unlock AI-powered study tools, unlimited decks, and accelerated learning. Cancel anytime.'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
            {/* Left: Features */}
            <div className="order-2 lg:order-1 space-y-4">
              {FEATURES.map((feature, i) => (
                <motion.div
                  key={feature.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.15 + i * 0.08 }}
                  className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-4 flex gap-3 hover:border-[#3A3A4F] transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#7C3AED]/10 flex items-center justify-center shrink-0">
                    <feature.icon size={16} className="text-[#8B5CF6]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-[#F0EFFE] mb-0.5">{feature.label}</h3>
                    <p className="text-[10px] text-[#7A7A96] leading-relaxed">{feature.detail}</p>
                  </div>
                </motion.div>
              ))}

              {/* Trust badges */}
              <div className="flex items-center justify-center gap-6 pt-2 text-[#7A7A96]">
                <div className="flex items-center gap-1.5 text-[10px] font-medium">
                  <ShieldCheck size={14} className="text-[#10B981]" />
                  Secure checkout
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-medium">
                  <ShieldCheck size={14} className="text-[#10B981]" />
                  Cancel anytime
                </div>
              </div>
            </div>

            {/* Right: Plans & CTA */}
            <div className="order-1 lg:order-2">
              <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl overflow-hidden">
                {/* Plan selector */}
                <div className="p-5 space-y-3">
                  {PLANS.map((plan) => {
                    const isSelected = selectedPlan === plan.id;
                    return (
                      <button
                        key={plan.id}
                        onClick={() => setSelectedPlan(plan.id)}
                        className={`w-full text-left p-4 rounded-lg border transition-all duration-200 relative ${
                          isSelected
                            ? 'border-[#7C3AED] bg-[#7C3AED]/5 ring-1 ring-[#7C3AED]/20'
                            : 'border-[#2A2A3A] bg-transparent hover:border-[#3A3A4F]'
                        }`}
                      >
                        {plan.badge && (
                          <div className="absolute -top-2.5 right-3 bg-[#10B981] text-black text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                            {plan.badge}
                          </div>
                        )}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-[#F0EFFE]">{plan.name}</span>
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                              isSelected ? 'border-[#7C3AED] bg-[#7C3AED]' : 'border-[#3A3A4F]'
                            }`}
                          >
                            {isSelected && <Check size={10} className="text-white" />}
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-[#F0EFFE] tracking-tight">{plan.price}</span>
                          <span className="text-xs text-[#7A7A96]">{plan.interval}</span>
                        </div>
                        {plan.totalBilled && (
                          <p className="text-[10px] text-[#7A7A96] mt-1.5">{plan.totalBilled}</p>
                        )}
                        <p className="text-[10px] text-[#7A7A96] mt-1">{plan.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {/* CTA */}
                <div className="p-5 border-t border-[#2A2A3A] bg-[#0A0A0F]/50">
                  {cancelled && (
                    <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                      Payment was cancelled. No charges were made. You can try again whenever you're ready.
                    </div>
                  )}
                  {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleSubscribe}
                    disabled={loading}
                    className="w-full py-3 bg-[#7C3AED] text-white text-sm font-medium rounded-lg hover:bg-[#6D28D9] transition-all duration-300 shadow-[0_0_24px_rgba(124,58,237,0.25)] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Starting trial...
                      </>
                    ) : (
                      <>
                        <Zap size={14} />
                        Start 7-Day Free Trial
                      </>
                    )}
                  </button>

                  <p className="text-center text-[10px] text-[#7A7A96] mt-4 leading-relaxed">
                    No charge until your trial ends. By upgrading, you agree to our{' '}
                    <span className="text-[#8B5CF6]">Terms</span> and{' '}
                    <span className="text-[#8B5CF6]">Privacy Policy</span>.
                  </p>
                </div>
              </div>

              {/* Stripe badge */}
              <div className="flex items-center justify-center gap-2 mt-4 text-[#7A7A96] text-[10px]">
                <svg className="w-4 h-4 opacity-40" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M2 10h20" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                Secured by Stripe
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default PaymentPage;
