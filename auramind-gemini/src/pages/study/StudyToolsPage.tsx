/**
 * StudyToolsPage — the hub for BonaMind's "upload anything, get study
 * material" superpowers:
 *   - audio → flashcard deck (record or upload a lecture)
 *   - document → notes / slides / flashcards
 *
 * Both panels are self-contained and reuse the existing Groq + workspace
 * services, so this page is just layout. Wired into NovaHub as
 * /dashboard/study-tools.
 */
import React from 'react';
import { Mic2, FileText } from '@/components/icons';
import { DocumentToStudyTool } from '../../components/generator/DocumentToStudyTool';
import { AudioToFlashcardsPanel } from '../../components/generator/AudioToFlashcardsPanel';
import { useDashboardWorkspace } from '../../contexts/DashboardWorkspaceContext';

export default function StudyToolsPage() {
  const workspace = useDashboardWorkspace();
  const createDeck = workspace?.createDeck;
  const addCardsToDeck = workspace?.addCardsToDeck;

  return (
    <div className="space-y-6">
      <div>
        <p className="nova-label text-violet-200/80">Create</p>
        <h1 className="nova-display mt-1 text-3xl text-white sm:text-4xl">Study Tools</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Turn lectures and documents into study material in seconds.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Mic2 className="w-4 h-4 text-fuchsia-300" />
            <span className="text-xs font-semibold text-white uppercase tracking-widest">Audio</span>
          </div>
          <AudioToFlashcardsPanel
            createDeck={createDeck}
            addCardsToDeck={addCardsToDeck}
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-sky-300" />
            <span className="text-xs font-semibold text-white uppercase tracking-widest">Document</span>
          </div>
          <DocumentToStudyTool
            createDeck={createDeck}
            addCardsToDeck={addCardsToDeck}
          />
        </div>
      </div>
    </div>
  );
}
