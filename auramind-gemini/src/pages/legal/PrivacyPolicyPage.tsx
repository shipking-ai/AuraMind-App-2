import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from '@/components/icons';
import { BRAND, PRODUCT_NAME, PARENT_COMPANY_LEGAL } from '../../lib/branding';
import { CogniVectFooter } from '../../components/shared/CogniVectFooter';

const sections = [
  {
    id: 'introduction',
    title: '1. Introduction',
    content: (
      <>
        <p>
          {PARENT_COMPANY_LEGAL} ("we," "our," or "us"), operator of the {PRODUCT_NAME} product, is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI-powered study platform, including our website, mobile application, and related services (collectively, the "Service").
        </p>
        <p>
          By using the Service, you agree to the collection and use of information in accordance with this policy. If you do not agree, please do not use the Service.
        </p>
      </>
    ),
  },
  {
    id: 'information-collection',
    title: '2. Information We Collect',
    content: (
      <>
        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Information You Provide</h4>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Account Information:</strong> When you register, we collect your email address, full name, and password.</li>
          <li><strong className="text-[#F0EFFE]">Profile Information:</strong> Avatar image, study preferences, and any information you add to your profile.</li>
          <li><strong className="text-[#F0EFFE]">Study Content:</strong> Flashcards, decks, notes, study sessions, quiz responses, and any content you create or upload.</li>
          <li><strong className="text-[#F0EFFE]">Documents:</strong> PDFs, PowerPoint files, text documents, and markdown files you upload for content processing.</li>
          <li><strong className="text-[#F0EFFE]">AI Interactions:</strong> Prompts, questions, and conversations you submit to our AI study assistant ("Aura").</li>
          <li><strong className="text-[#F0EFFE]">Communications:</strong> Information you provide when contacting support or participating in surveys.</li>
        </ul>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Information Collected Automatically</h4>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Usage Data:</strong> Pages visited, features used, time spent, study patterns, and interaction data.</li>
          <li><strong className="text-[#F0EFFE]">Device Information:</strong> Browser type, operating system, device type, and IP address.</li>
          <li><strong className="text-[#F0EFFE]">Analytics:</strong> Page views, click events, and feature usage via PostHog (with your consent where required).</li>
          <li><strong className="text-[#F0EFFE]">Cookies:</strong> We use cookies to maintain sessions, remember preferences, and analyze usage.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: '3. How We Use Your Information',
    content: (
      <>
        <p>We use your information for the following purposes:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">To Provide the Service:</strong> Process study content, generate flashcards and quizzes, power AI tutoring, and deliver all platform features.</li>
          <li><strong className="text-[#F0EFFE]">To Improve the Service:</strong> Analyze usage patterns to improve features, optimize the FSRS spaced repetition algorithm, and enhance AI responses.</li>
          <li><strong className="text-[#F0EFFE]">AI Processing:</strong> Your prompts and uploaded content are sent to our AI provider (Groq) solely to generate responses. Local inference runs entirely in your browser. We do not use your content to train or fine-tune AI models.</li>
          <li><strong className="text-[#F0EFFE]">To Communicate:</strong> Send transactional emails (welcome, password reset, payment receipts, trial reminders) via Resend.</li>
          <li><strong className="text-[#F0EFFE]">To Process Payments:</strong> Subscription payments are processed securely by Stripe. We do not store full payment card details.</li>
          <li><strong className="text-[#F0EFFE]">To Ensure Security:</strong> Monitor for unauthorized access, fraud, and abuse of the Service.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'ai-disclosure',
    title: '4. AI-Specific Disclosures',
    content: (
      <>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Input Handling:</strong> Your prompts and uploaded content are sent to our AI providers solely to generate responses in real-time. They are not used to train or improve their models.</li>
          <li><strong className="text-[#F0EFFE]">No Model Training:</strong> We do not use your study content, AI interactions, or personal data to train AI models without your explicit consent.</li>
          <li><strong className="text-[#F0EFFE]">AI Output Caution:</strong> AI-generated content may contain inaccuracies. You are responsible for reviewing and verifying outputs before relying on them.</li>
          <li><strong className="text-[#F0EFFE]">Third-Party Providers:</strong> We use Groq as our AI inference provider. This provider processes your inputs only for generating responses and does not retain your data.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'third-party',
    title: '5. Third-Party Services',
    content: (
      <>
        <p>We use the following third-party service providers:</p>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-xs text-left">
            <thead className="text-[#7A7A96] border-b border-[#2A2A3A]">
              <tr>
                <th className="py-2 pr-4">Provider</th>
                <th className="py-2 pr-4">Purpose</th>
                <th className="py-2">Data Shared</th>
              </tr>
            </thead>
            <tbody className="text-[#9090A8]">
              <tr className="border-b border-[#2A2A3A]/50">
                <td className="py-2 pr-4 text-[#F0EFFE]">Supabase</td>
                <td className="py-2 pr-4">Auth, Database, Storage</td>
                <td className="py-2">Account info, study content</td>
              </tr>
              <tr className="border-b border-[#2A2A3A]/50">
                <td className="py-2 pr-4 text-[#F0EFFE]">Groq</td>
                <td className="py-2 pr-4">AI Inference</td>
                <td className="py-2">Prompts and content</td>
              </tr>
              <tr className="border-b border-[#2A2A3A]/50">
                <td className="py-2 pr-4 text-[#F0EFFE]">Stripe</td>
                <td className="py-2 pr-4">Payment Processing</td>
                <td className="py-2">Payment details (we store none)</td>
              </tr>
              <tr className="border-b border-[#2A2A3A]/50">
                <td className="py-2 pr-4 text-[#F0EFFE]">PostHog</td>
                <td className="py-2 pr-4">Product Analytics</td>
                <td className="py-2">Usage data, events</td>
              </tr>
              <tr className="border-b border-[#2A2A3A]/50">
                <td className="py-2 pr-4 text-[#F0EFFE]">Resend</td>
                <td className="py-2 pr-4">Email Delivery</td>
                <td className="py-2">Email address, transactional data</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 text-[#F0EFFE]">Vercel</td>
                <td className="py-2 pr-4">Hosting</td>
                <td className="py-2">IP addresses, request metadata</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: 'legal-basis',
    title: '6. Legal Basis for Processing (GDPR)',
    content: (
      <>
        <p>If you are located in the EEA or UK, we process your personal data under:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Contract Performance:</strong> To provide the Service you have subscribed to.</li>
          <li><strong className="text-[#F0EFFE]">Consent:</strong> For analytics cookies and marketing communications.</li>
          <li><strong className="text-[#F0EFFE]">Legitimate Interests:</strong> To improve the Service and ensure security.</li>
          <li><strong className="text-[#F0EFFE]">Legal Obligation:</strong> To comply with applicable laws.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'data-retention',
    title: '7. Data Retention',
    content: (
      <>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Account Data:</strong> Retained for the duration of your account. Deleted within 30 days of closure.</li>
          <li><strong className="text-[#F0EFFE]">Study Content:</strong> Retained until you delete it or close your account.</li>
          <li><strong className="text-[#F0EFFE]">AI Interaction Logs:</strong> Anonymized logs retained up to 90 days for debugging.</li>
          <li><strong className="text-[#F0EFFE]">Payment Records:</strong> Retained as required by financial regulations.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'your-rights',
    title: '8. Your Rights',
    content: (
      <>
        <p>Depending on your jurisdiction, you may have the following rights:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Access:</strong> Request a copy of your personal data.</li>
          <li><strong className="text-[#F0EFFE]">Rectification:</strong> Request correction of inaccurate data.</li>
          <li><strong className="text-[#F0EFFE]">Erasure:</strong> Request deletion of your data (available in account settings).</li>
          <li><strong className="text-[#F0EFFE]">Data Portability:</strong> Export your data as JSON or CSV from settings.</li>
          <li><strong className="text-[#F0EFFE]">Objection:</strong> Object to processing based on legitimate interests.</li>
          <li><strong className="text-[#F0EFFE]">Withdraw Consent:</strong> Withdraw consent at any time.</li>
        </ul>
        <p className="mt-3">
          To exercise your rights, contact us at <strong className="text-[#F0EFFE]">{BRAND.contactEmail}</strong>. We will respond within 30 days.
        </p>
      </>
    ),
  },
  {
    id: 'gdpr-export',
    title: '9. GDPR Data Export & Deletion',
    content: (
      <>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Data Export (Article 20):</strong> Export all your data — profile, decks, cards, study sessions — as JSON or CSV from your account settings.</li>
          <li><strong className="text-[#F0EFFE]">Account Deletion (Article 17):</strong> Delete your account and all associated data directly from your settings.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'cookies',
    title: '10. Cookies & Tracking',
    content: (
      <>
        <p>We use cookies and similar technologies to operate and improve the Service.</p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Necessary Cookies:</strong> Required for authentication and core functionality. Cannot be disabled.</li>
          <li><strong className="text-[#F0EFFE]">Analytics Cookies:</strong> Help us understand usage (PostHog). Enabled only with your consent.</li>
          <li><strong className="text-[#F0EFFE]">Preference Cookies:</strong> Remember your settings and preferences.</li>
        </ul>
        <p className="mt-3">
          You can manage cookie preferences at any time through your account settings.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: '11. Children & COPPA Compliance',
    content: (
      <>
        <p>
          BonaMind is designed for users aged 13 and above. We do not knowingly collect personal information from children under 13 without verifiable parental consent in accordance with COPPA.
        </p>
        <p>
          If you believe a child under 13 has provided us with personal data, please contact us immediately at <strong className="text-[#F0EFFE]">{BRAND.contactEmail}</strong>. We will take steps to delete such information promptly.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: '12. Data Security',
    content: (
      <>
        <p>We implement industry-standard security measures:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>Encryption in transit (TLS 1.3) for all communications.</li>
          <li>Encryption at rest for stored data.</li>
          <li>Row-Level Security (RLS) policies for data isolation between users.</li>
          <li>Regular security audits and dependency updates.</li>
          <li>Secure API key management — keys are never exposed to clients.</li>
        </ul>
        <p className="mt-3">
          While we take these precautions seriously, no method of electronic storage is 100% secure.
        </p>
      </>
    ),
  },
  {
    id: 'international',
    title: '13. International Data Transfers',
    content: (
      <>
        <p>
          Your data is processed in the United States. When transferring data from the EEA or UK, we ensure appropriate safeguards including Standard Contractual Clauses and Data Processing Agreements with all sub-processors.
        </p>
      </>
    ),
  },
  {
    id: 'california',
    title: '14. California Privacy Rights (CCPA/CPRA)',
    content: (
      <>
        <p>If you are a California resident, you have additional rights:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Right to Know:</strong> Request disclosure of categories and specific pieces of personal information collected.</li>
          <li><strong className="text-[#F0EFFE]">Right to Delete:</strong> Request deletion of your personal information.</li>
          <li><strong className="text-[#F0EFFE]">Right to Opt-Out:</strong> We do not sell your personal information.</li>
          <li><strong className="text-[#F0EFFE]">Right to Non-Discrimination:</strong> We will not discriminate against you for exercising your rights.</li>
        </ul>
        <p className="mt-3">
          To exercise your California rights, contact us at <strong className="text-[#F0EFFE]">{BRAND.contactEmail}</strong>.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: '15. Changes to This Policy',
    content: (
      <>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be notified via email or through the Service.
        </p>
        <p className="text-[#7A7A96]">
          Last updated: July 9, 2026
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: '16. Contact Us',
    content: (
      <>
        <p>If you have questions about this Privacy Policy or our data practices:</p>
        <ul className="list-none space-y-1 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Email:</strong> {BRAND.contactEmail}</li>
          <li><strong className="text-[#F0EFFE]">Address:</strong> {BRAND.legalAddress}</li>
        </ul>
      </>
    ),
  },
];

export default function PrivacyPolicyPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0A0A0F]/80 backdrop-blur-xl border-b border-[#2A2A3A]/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Link to="/" className="p-2 -ml-2 text-[#7A7A96] hover:text-[#F0EFFE] rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-base font-medium text-[#F0EFFE]">Privacy Policy</h1>
            <p className="text-[10px] text-[#7A7A96]">Last updated: July 9, 2026</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="space-y-6">
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6"
            >
              <h2 className="text-sm font-semibold text-[#F0EFFE] mb-3">{section.title}</h2>
              <div className="text-xs text-[#9090A8] leading-relaxed space-y-2">
                {section.content}
              </div>
            </section>
          ))}
        </div>

        {/* Back to home — kept for nav continuity; the corporate footer below
            carries the CogniVect parent-company attribution. */}
        <div className="mt-10 pt-8 border-t border-[#2A2A3A]/30 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs text-[#8B5CF6] hover:text-[#7C3AED] transition-colors"
          >
            <ArrowLeft size={14} />
            Back to {PRODUCT_NAME}
          </Link>
        </div>

        {/* Corporate parent attribution */}
        <CogniVectFooter />
      </div>
    </div>
  );
}
