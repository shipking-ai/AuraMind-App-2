import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from '@/components/icons';
import { BRAND, PRODUCT_NAME, PARENT_COMPANY_LEGAL, PARENT_COMPANY_NAME } from '../../lib/branding';
import { CogniVectFooter } from '../../components/shared/CogniVectFooter';

const sections = [
  {
    id: 'acceptance',
    title: '1. Acceptance of Terms',
    content: (
      <>
        <p>
          By accessing or using BonaMind ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Service.
        </p>
        <p>
          These Terms apply to all users, including free trial users, paid subscribers, and educational institutions. We may update these Terms from time to time; material changes will be notified via email or through the Service.
        </p>
      </>
    ),
  },
  {
    id: 'eligibility',
    title: '2. Eligibility',
    content: (
      <>
        <p>By using the Service, you represent and warrant that:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>You are at least 13 years of age (or the age of digital consent in your jurisdiction).</li>
          <li>If you are between 13 and 18, you have obtained parental or guardian consent.</li>
          <li>You have the legal capacity to enter into these Terms.</li>
          <li>Your use of the Service complies with all applicable laws and regulations.</li>
        </ul>
        <p>
          If you are using the Service on behalf of an educational institution, you represent that you have the authority to bind that institution to these Terms.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: '3. Account Registration & Security',
    content: (
      <>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>You must provide accurate, current, and complete information during registration.</li>
          <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
          <li>You are responsible for all activity that occurs under your account.</li>
          <li>You must notify us immediately of any unauthorized use of your account at <strong className="text-[#F0EFFE]">{BRAND.contactEmail}</strong>.</li>
          <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
          <li>You may not create accounts by automated means or create multiple accounts for abusive purposes.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'subscriptions',
    title: '4. Subscriptions & Payments',
    content: (
      <>
        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Plans</h4>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Free Trial:</strong> New users receive a 7-day free trial with full access to the Service.</li>
          <li><strong className="text-[#F0EFFE]">Monthly:</strong> $7.99/month, billed monthly.</li>
          <li><strong className="text-[#F0EFFE]">Annual:</strong> $3.99/month ($47.88/year), billed annually.</li>
        </ul>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Payment Terms</h4>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>All payments are processed securely by Stripe. We do not store full credit card details.</li>
          <li>Subscriptions automatically renew at the end of each billing period unless cancelled.</li>
          <li>You may cancel at any time. Access continues through the end of the current billing period.</li>
          <li>Refunds are provided on a case-by-case basis. Contact <strong className="text-[#F0EFFE]">{BRAND.contactEmail}</strong> for refund requests.</li>
          <li>Prices are in USD and may be subject to applicable taxes.</li>
        </ul>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Cancellation</h4>
        <p>
          You can cancel your subscription at any time from your account settings. Upon cancellation, your subscription will remain active until the end of the current billing period, after which your access will be downgraded. Your data will be retained per our Privacy Policy.
        </p>
      </>
    ),
  },
  {
    id: 'ai-features',
    title: '5. AI Features & Disclaimer',
    content: (
      <>
        <p>
          BonaMind provides AI-powered features including an AI study assistant ("Aura"), flashcard generation, quiz generation, research packs, fact-checking, and homework assistance. These features use large language models from third-party providers.
        </p>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">AI Output Disclaimer</h4>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>AI-generated content may contain errors, inaccuracies, or omissions.</li>
          <li>AI outputs reflect the training data of underlying models and do not represent the views of BonaMind.</li>
          <li>You are solely responsible for reviewing, verifying, and editing AI-generated content before relying on it.</li>
          <li>AI responses should not be used as a substitute for professional advice (medical, legal, financial, or otherwise).</li>
          <li>The fact-checking feature provides confidence scores based on AI analysis and does not guarantee factual accuracy.</li>
        </ul>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Third-Party Providers</h4>
        <p>
          Our AI features use Groq for cloud inference and in-browser WebLLM for local inference. These providers process your inputs solely to generate responses. They do not use your data for model training. See our Privacy Policy for full details.
        </p>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">No Training on User Data</h4>
        <p>
          We do not use your prompts, study content, or interactions to train or fine-tune AI models. Your data is used solely to provide the Service to you.
        </p>
      </>
    ),
  },
  {
    id: 'user-content',
    title: '6. User Content & Ownership',
    content: (
      <>
        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Your Content</h4>
        <p>
          You retain all ownership rights to the content you create, upload, or generate using the Service ("User Content"), including flashcards, decks, notes, and documents.
        </p>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">License to Us</h4>
        <p>
          By using the Service, you grant BonaMind a limited, non-exclusive, worldwide license to store, process, and display your User Content solely for the purpose of providing the Service to you. This license does not grant us the right to use your content for any other purpose, including AI model training.
        </p>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">AI-Generated Content</h4>
        <p>
          Content generated by AI at your direction belongs to you, subject to the same limitations and disclaimers described in Section 5. You assume all responsibility for how you use AI-generated content.
        </p>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">No Responsibility for User Content</h4>
        <p>
          We do not pre-screen User Content but reserve the right to remove content that violates these Terms or applicable law.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: '7. Acceptable Use Policy',
    content: (
      <>
        <p>You agree not to use the Service to:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>Generate, upload, or share content that is illegal, harmful, threatening, abusive, harassing, defamatory, or discriminatory.</li>
          <li>Generate content that infringes on intellectual property rights of others.</li>
          <li>Upload malicious code, viruses, or attempt to compromise the security of the Service.</li>
          <li>Attempt to reverse-engineer, decompile, or extract the source code of our AI models or application.</li>
          <li>Use automated scripts, bots, or scrapers to access the Service without our permission.</li>
          <li>Interfere with other users' access to the Service.</li>
          <li>Use the Service for any high-risk activity where failure could cause harm (medical systems, critical infrastructure, etc.).</li>
          <li>Submit personal information of third parties without their consent.</li>
          <li>Attempt to circumvent subscription restrictions or access paid features without authorization.</li>
        </ul>
        <p className="mt-3">
          Violation of this Acceptable Use Policy may result in immediate suspension or termination of your account without refund.
        </p>
      </>
    ),
  },
  {
    id: 'intellectual-property',
    title: '8. Intellectual Property',
    content: (
      <>
        <p>
          The Service, including its code, design, branding, algorithms (including FSRS spaced repetition implementation), and proprietary features, is owned by {PARENT_COMPANY_LEGAL} and operated as the {PRODUCT_NAME} product, with the underlying code, design, and proprietary features protected by copyright, trademark, and other intellectual property laws.
        </p>
        <p>
          The {PRODUCT_NAME} name, logo, and related marks are trademarks of {PARENT_COMPANY_LEGAL}. You may not use those marks without our prior written permission.
        </p>
        <p>
          No license is granted to you under any of our intellectual property rights except as expressly stated in these Terms.
        </p>
      </>
    ),
  },
  {
    id: 'third-party',
    title: '9. Third-Party Services & Integrations',
    content: (
      <>
        <p>
          The Service integrates with third-party platforms and services, including:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Notion:</strong> Import content from Notion via OAuth. Notion's terms apply to data accessed through this integration.</li>
          <li><strong className="text-[#F0EFFE]">Schoology:</strong> Import courses and materials via OAuth. Schoology's terms apply to data accessed through this integration.</li>
          <li><strong className="text-[#F0EFFE]">Obsidian:</strong> Import markdown files from Obsidian vaults. Requires user-initiated file upload.</li>
          <li><strong className="text-[#F0EFFE]">Anki:</strong> Import Anki deck files (APKG format) via user-initiated file upload.</li>
        </ul>
        <p>
          These integrations are provided for your convenience. We are not responsible for the privacy practices, terms, or security of third-party platforms.
        </p>
      </>
    ),
  },
  {
    id: 'limitation-liability',
    title: '10. Limitation of Liability',
    content: (
      <>
        <p>To the maximum extent permitted by applicable law:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>{PARENT_COMPANY_NAME} and its affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.</li>
          <li>Our total liability for any claim arising from these Terms or the Service shall not exceed the amount you have paid us in the 12 months preceding the claim.</li>
          <li>AI outputs are provided "as is" without warranty of any kind. We do not guarantee the accuracy, completeness, or reliability of AI-generated content.</li>
          <li>We are not liable for decisions made in reliance on AI-generated content without independent verification.</li>
          <li>We are not liable for any damages resulting from unauthorized access to your account or data due to your failure to safeguard your credentials.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'disclaimer-warranties',
    title: '11. Disclaimer of Warranties',
    content: (
      <>
        <p>
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        </p>
        <p>We do not warrant that:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>The Service will be uninterrupted, timely, secure, or error-free.</li>
          <li>AI-generated content will be accurate, reliable, or complete.</li>
          <li>The quality of any content obtained through the Service will meet your expectations.</li>
          <li>Any errors in the Service will be corrected.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'termination',
    title: '12. Termination',
    content: (
      <>
        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">By You</h4>
        <p>
          You may terminate your account at any time by deleting your account in settings or by contacting us. Your data will be handled per our Privacy Policy.
        </p>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">By Us</h4>
        <p>We may suspend or terminate your access to the Service immediately if:</p>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>You violate these Terms or our Acceptable Use Policy.</li>
          <li>Your conduct could harm other users, third parties, or BonaMind.</li>
          <li>You fail to pay subscription fees when due.</li>
          <li>We are required to do so by law.</li>
        </ul>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Effect of Termination</h4>
        <p>
          Upon termination, your right to use the Service ceases immediately. Your data will be retained for 30 days per our Privacy Policy, after which it will be permanently deleted.
        </p>
      </>
    ),
  },
  {
    id: 'governing-law',
    title: '13. Governing Law & Disputes',
    content: (
      <>
        <p>
          These Terms are governed by the laws of the State of California, United States, without regard to its conflict of law provisions.
        </p>
        <p>
          Any disputes arising from these Terms or the Service shall be resolved through binding arbitration in San Francisco, California, in accordance with the rules of the American Arbitration Association. You agree to waive any right to participate in a class-action lawsuit or class-wide arbitration.
        </p>
        <p>
          If you are a consumer in the EEA or UK, nothing in this section affects your right to bring claims in your local courts or to use applicable consumer protection mechanisms.
        </p>
      </>
    ),
  },
  {
    id: 'dmca',
    title: '14. DMCA Compliance',
    content: (
      <>
        <p>
          We respect intellectual property rights and comply with the Digital Millennium Copyright Act (DMCA). If you believe content on our Service infringes your copyright, please contact us at:
        </p>
        <ul className="list-none space-y-1 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Email:</strong> {BRAND.contactEmail}</li>
          <li><strong className="text-[#F0EFFE]">Address:</strong> {BRAND.legalAddress}</li>
        </ul>
        <p className="mt-2">
          Your notice must include: identification of the copyrighted work, the infringing material, your contact information, a statement of good faith belief, and your signature. We may terminate accounts of repeat infringers.
        </p>
      </>
    ),
  },
  {
    id: 'changes-to-terms',
    title: '15. Changes to These Terms',
    content: (
      <>
        <p>
          We may modify these Terms at any time. Material changes will be notified via email or through the Service at least 30 days before taking effect.
        </p>
        <p>
          If you do not agree to the updated Terms, you may terminate your account before the changes take effect. Continued use after the effective date constitutes acceptance of the updated Terms.
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
        <p>For questions about these Terms, please contact us:</p>
        <ul className="list-none space-y-1 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Email:</strong> {BRAND.contactEmail}</li>
          <li><strong className="text-[#F0EFFE]">Address:</strong> {BRAND.legalAddress}</li>
        </ul>
      </>
    ),
  },
];

export default function TermsOfServicePage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0A0A0F]/80 backdrop-blur-xl border-b border-[#2A2A3A]/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Link to="/" className="p-2 -ml-2 text-[#7A7A96] hover:text-[#F0EFFE] rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-base font-medium text-[#F0EFFE]">Terms of Service</h1>
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
