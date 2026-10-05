import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Zap, Brain, Repeat, Puzzle, MessageSquare, Rocket } from '@/components/icons';
import { LEGAL_COPYRIGHT_LINE } from '../../lib/branding';

const sections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: Rocket,
    content: (
      <>
        <p>
          BonaMind is an adaptive AI learning system. Drop in a PDF, a video, a lecture, or a topic and it
          builds your course — flashcards, quizzes, and lessons — then schedules your reviews with FSRS v5
          spaced repetition and tutors you with a model of what you actually know. This guide covers
          everything you need to get the most out of the app.
        </p>
        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Quick Start</h4>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Create an Account:</strong> Sign up with your email or Google/GitHub OAuth.</li>
          <li><strong className="text-[#F0EFFE]">Create a Deck:</strong> Organize your study material into decks (subjects, courses, topics).</li>
          <li><strong className="text-[#F0EFFE]">Add Cards:</strong> Manually create flashcards or upload PDFs/DOCX files to auto-generate them.</li>
          <li><strong className="text-[#F0EFFE]">Start Studying:</strong> Use Flashcard mode, Quiz mode, or the AI Chat to learn.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'decks-cards',
    title: 'Decks & Cards',
    icon: BookOpen,
    content: (
      <>
        <p>
          Decks are containers that hold your flashcards. Each deck represents a subject, course, or topic.
          Cards are the individual flashcards within a deck, each with a question (front) and answer (back).
        </p>
        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Creating Decks</h4>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>Click <strong className="text-[#F0EFFE]">"Create Deck"</strong> from the dashboard or sidebar.</li>
          <li>Give your deck a name and optional description.</li>
          <li>Decks support markdown in card content for rich formatting.</li>
        </ul>
        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Adding Cards</h4>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Manual:</strong> Type questions and answers directly.</li>
          <li><strong className="text-[#F0EFFE]">File Upload:</strong> Upload PDF, DOCX, PPTX, TXT, or Markdown files — AI generates flashcards automatically.</li>
          <li><strong className="text-[#F0EFFE]">Bulk Import:</strong> Import cards from CSV or JSON format.</li>
          <li><strong className="text-[#F0EFFE]">AI Generate:</strong> Describe a topic and Aura will create a full deck for you.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'study-modes',
    title: 'Study Modes',
    icon: Brain,
    content: (
      <>
        <p>BonaMind offers multiple study modes to suit your learning style:</p>
        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Flashcard Mode</h4>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>Classic front/back card review with self-rated recall.</li>
          <li>Rate your recall (Again, Hard, Good, Easy) and the FSRS spaced repetition algorithm schedules the next review.</li>
          <li>Supports rich markdown, code blocks, and images on cards.</li>
        </ul>
        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Quiz Mode</h4>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>AI-generated multiple choice or written response questions based on your cards.</li>
          <li>Instant feedback with explanations for each answer.</li>
          <li>Track your quiz scores over time.</li>
        </ul>
        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">AI Chat (Aura)</h4>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>Ask Aura questions about your study material.</li>
          <li>Get explanations, summaries, and connections between concepts.</li>
          <li>Choose between Groq cloud inference (fast) or local inference (private).</li>
        </ul>
      </>
    ),
  },
  {
    id: 'spaced-repetition',
    title: 'Spaced Repetition (FSRS)',
    icon: Repeat,
    content: (
      <>
        <p>
          BonaMind uses the <strong className="text-[#F0EFFE]">FSRS (Free Spaced Repetition Scheduler)</strong> algorithm,
          a modern, adaptive spaced repetition system that optimizes review schedules based on your individual memory patterns.
        </p>
        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">How It Works</h4>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>After each review, rate your recall (Again = forgot, Hard = difficult, Good = normal, Easy = effortless).</li>
          <li>FSRS adjusts the next review interval based on your rating and past performance.</li>
          <li>Cards you find difficult appear more frequently; cards you know well appear less often.</li>
          <li>Over time, FSRS learns your memory stability and builds a personalized optimal schedule.</li>
        </ul>
        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Dashboard Metrics</h4>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li><strong className="text-[#F0EFFE]">Due Cards:</strong> Cards scheduled for review today.</li>
          <li><strong className="text-[#F0EFFE]">Retention Rate:</strong> Percentage of cards you recalled correctly.</li>
          <li><strong className="text-[#F0EFFE]">Study Streak:</strong> Consecutive days with at least one review session.</li>
          <li><strong className="text-[#F0EFFE]">Cards Reviewed:</strong> Total cards reviewed across all sessions.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'integrations',
    title: 'Integrations',
    icon: Puzzle,
    content: (
      <>
        <p>BonaMind integrates with external platforms to streamline your study workflow.</p>
        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Schoology (LMS)</h4>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>Connect your Schoology account to import assignments and course materials.</li>
          <li>Automatically convert assignments and materials into flashcards.</li>
          <li>Navigate to <strong className="text-[#F0EFFE]">Settings → Integrations</strong> to connect.</li>
        </ul>
        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Notion</h4>
        <ul className="list-disc pl-5 space-y-1.5 text-[#9090A8]">
          <li>Import notes and study content directly from your Notion workspace.</li>
          <li>Sync selected pages as flashcards for review.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'shortcuts',
    title: 'Keyboard Shortcuts',
    icon: Zap,
    content: (
      <>
        <p>Speed up your study sessions with these keyboard shortcuts:</p>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-xs text-left">
            <thead className="text-[#7A7A96] border-b border-[#2A2A3A]">
              <tr>
                <th className="py-2 pr-4">Shortcut</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody className="text-[#9090A8]">
              <tr className="border-b border-[#2A2A3A]/50">
                <td className="py-2 pr-4"><kbd className="px-1.5 py-0.5 bg-[#1A1A24] border border-[#2A2A3A] rounded text-[#F0EFFE] text-[10px]">Space</kbd></td>
                <td className="py-2">Flip card</td>
              </tr>
              <tr className="border-b border-[#2A2A3A]/50">
                <td className="py-2 pr-4"><kbd className="px-1.5 py-0.5 bg-[#1A1A24] border border-[#2A2A3A] rounded text-[#F0EFFE] text-[10px]">1</kbd>-<kbd className="px-1.5 py-0.5 bg-[#1A1A24] border border-[#2A2A3A] rounded text-[#F0EFFE] text-[10px]">4</kbd></td>
                <td className="py-2">Rate recall (Again/Hard/Good/Easy)</td>
              </tr>
              <tr className="border-b border-[#2A2A3A]/50">
                <td className="py-2 pr-4"><kbd className="px-1.5 py-0.5 bg-[#1A1A24] border border-[#2A2A3A] rounded text-[#F0EFFE] text-[10px]">E</kbd></td>
                <td className="py-2">Edit current card</td>
              </tr>
              <tr className="border-b border-[#2A2A3A]/50">
                <td className="py-2 pr-4"><kbd className="px-1.5 py-0.5 bg-[#1A1A24] border border-[#2A2A3A] rounded text-[#F0EFFE] text-[10px]">Q</kbd></td>
                <td className="py-2">Start quiz mode</td>
              </tr>
              <tr className="border-b border-[#2A2A3A]/50">
                <td className="py-2 pr-4"><kbd className="px-1.5 py-0.5 bg-[#1A1A24] border border-[#2A2A3A] rounded text-[#F0EFFE] text-[10px]">/</kbd></td>
                <td className="py-2">Search cards</td>
              </tr>
              <tr className="border-b border-[#2A2A3A]/50">
                <td className="py-2 pr-4"><kbd className="px-1.5 py-0.5 bg-[#1A1A24] border border-[#2A2A3A] rounded text-[#F0EFFE] text-[10px]">Esc</kbd></td>
                <td className="py-2">Close modal / cancel</td>
              </tr>
              <tr>
                <td className="py-2 pr-4"><kbd className="px-1.5 py-0.5 bg-[#1A1A24] border border-[#2A2A3A] rounded text-[#F0EFFE] text-[10px]">?</kbd></td>
                <td className="py-2">Toggle shortcuts help</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: 'faq',
    title: 'FAQ',
    icon: MessageSquare,
    content: (
      <>
        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Is my data private?</h4>
        <p className="text-[#9090A8] mb-4">
          Yes. Your study content is encrypted at rest in our database. AI prompts are sent to Groq for inference only
          and are not used for training. For maximum privacy, enable local inference in settings.
        </p>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">What file formats are supported?</h4>
        <p className="text-[#9090A8] mb-4">
          PDF, DOCX, PPTX, TXT, Markdown, CSV, and JSON. Upload files to auto-generate flashcards from any of these formats.
        </p>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Can I use BonaMind offline?</h4>
        <p className="text-[#9090A8] mb-4">
          Flashcard reviews work offline. Reviews are queued and synced when you reconnect. AI chat requires an internet connection.
        </p>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">Is there a mobile app?</h4>
        <p className="text-[#9090A8] mb-4">
          BonaMind is available as a responsive web app and an Android app built with Capacitor. The Android build adds native back navigation, haptics, local study reminders, system sharing, and an Android-specific bottom navigation bar.
        </p>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">How do I delete my account?</h4>
        <p className="text-[#9090A8] mb-4">
          Go to <strong className="text-[#F0EFFE]">Settings → Account</strong> and click "Delete Account."
          All your data will be permanently removed within 30 days.
        </p>

        <h4 className="text-sm font-semibold text-[#F0EFFE] mt-4 mb-2">How do I export my data?</h4>
        <p className="text-[#9090A8]">
          Go to <strong className="text-[#F0EFFE]">Settings → Data</strong> and choose JSON or CSV export.
          You can download all your decks, cards, and study history.
        </p>
      </>
    ),
  },
];



export default function DocsPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <div className="sticky top-0 z-10 bg-[#0A0A0F]/80 backdrop-blur-xl border-b border-[#2A2A3A]/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Link to="/" className="p-2 -ml-2 text-[#7A7A96] hover:text-[#F0EFFE] rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-base font-medium text-[#F0EFFE]">Documentation</h1>
            <p className="text-[10px] text-[#7A7A96]">Learn how to use BonaMind effectively</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="space-y-6">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <section
                key={section.id}
                id={section.id}
                className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6"
              >
                <h2 className="text-sm font-semibold text-[#F0EFFE] mb-3 flex items-center gap-2">
                  <Icon className="w-4 h-4 text-[#7C3AED]" />
                  {section.title}
                </h2>
                <div className="text-xs text-[#9090A8] leading-relaxed space-y-2">
                  {section.content}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-10 pt-8 border-t border-[#2A2A3A]/30 text-center space-y-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs text-[#8B5CF6] hover:text-[#7C3AED] transition-colors"
          >
            <ArrowLeft size={14} />
            Back to BonaMind
          </Link>
          {/* CogniVect parent line + canonical copyright line in the legal
              footer. Variant 'footnote' keeps the long-form doc page from
              feeling marketing-heavy; the copyright line comes from the
              canonical LEGAL_COPYRIGHT_LINE in lib/branding.ts so any
              future rename touches exactly one file. */}
          <div className="flex flex-col items-center gap-2 opacity-70">
            <p className="text-[10px] text-[#3A3A4F] uppercase tracking-[0.2em]">
              {LEGAL_COPYRIGHT_LINE}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}