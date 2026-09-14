import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { auraAiClient } from '../../services/api/auraAiService';
import { Quiz, FlashcardData } from '../../types';
import { useDashboardWorkspace } from '../../contexts/DashboardWorkspaceContext';
import { 
  SparklesIcon as Sparkles, 
  PlayIcon as Play,
  TargetIcon as Target,
  CheckCircle2Icon as CheckCircle,
  DownloadIcon as Save,
  EyeIcon as Eye,
  RotateCcwIcon as RotateCcw,
  PencilIcon as Pencil,
  Trash2Icon as Trash,
  XIcon as X,
  CheckIcon as Check,
  GlobeIcon as Globe,
  TypeIcon as Type,
  FileTextIcon as FileText,
  BookOpenIcon as BookOpen,
  Mic2Icon as Mic,
} from '../../components/icons/CustomIcons';
import { toast } from 'sonner';
import { localInference, getModelDisplayName, type InitProgress } from '../../services/api/localInferenceService';
import PresentationViewer from '../../components/study/PresentationViewer';
import { extractStudyAssetText } from '../../services/import/documentImportService';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { transcribeAudio } from '../../services/api/groqService';
import { supabase } from '../../services/database/supabase';
import { Capacitor } from '../../lib/nativeShim';
import { useAppPreference } from '../../lib/appPreferences';
import { usesLocalAI as useLocalAIEnabled } from '../../lib/aiProvider';

type GeneratorType = 'quiz' | 'flashcards' | 'presentation';
type InputSource = 'topic' | 'url' | 'youtube' | 'file' | 'audio';
type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';

const GeneratorPage: React.FC = () => {
  const isAndroidApp = Capacitor.getPlatform() === 'android';
  // Provider is supplied by App for /dashboard/generator; stay null-safe so a
  // missing provider degrades to "sign in to save" instead of crashing the tree.
  const workspace = useDashboardWorkspace();
  const createDeck = workspace?.createDeck;
  const addCardsToDeck = workspace?.addCardsToDeck;
  const deleteDeck = workspace?.deleteDeck;
  const [generatorType, setGeneratorType] = useState<GeneratorType>('quiz');
  const [topic, setTopic] = useState('');
  const [numItems, setNumItems] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [cardsPerGeneration] = useAppPreference('auramind_cardsPerGen', '20');
  const [includeExamples] = useAppPreference('auramind_includeExamples', true);
  const [defaultLanguage] = useAppPreference('auramind_defaultLanguage', 'English');
  const [customNumItems, setCustomNumItems] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [inputSource, setInputSource] = useState<InputSource>('topic');
  const [extractedContent, setExtractedContent] = useState<string | null>(null);
  const [extractedTitle, setExtractedTitle] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const recorder = useAudioRecorder();
  const generationStartRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const [_genProgress, setGenProgress] = useState(0);
  const [generatedQuiz, setGeneratedQuiz] = useState<Quiz | null>(null);
  const [generatedFlashcards, setGeneratedFlashcards] = useState<FlashcardData[] | null>(null);
  const [generatedPresentation, setGeneratedPresentation] = useState<{ title: string; slides: { title: string; bullets: string[]; script: string }[] } | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [localAIProgress, setLocalAIProgress] = useState<InitProgress | null>(null);

  const useLocalAI = useLocalAIEnabled();
  const genEstimate = useLocalAI ? 45 : 10;

  useEffect(() => {
    const preferredCount = Number(cardsPerGeneration);
    if (Number.isFinite(preferredCount) && preferredCount > 0) {
      setNumItems(Math.min(30, Math.max(5, preferredCount)));
    }
  }, [cardsPerGeneration]);

  useEffect(() => {
    if (!useLocalAI) return;
    const unsub = localInference.subscribe(setLocalAIProgress);
    return unsub;
  }, [useLocalAI]);

  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(() => {
      const sec = Math.floor((Date.now() - generationStartRef.current) / 1000);
      setElapsed(sec);
      setGenProgress(Math.min(sec / genEstimate, 0.95));
    }, 200);
    return () => clearInterval(interval);
  }, [isGenerating, genEstimate]);

  const handleFetchUrl = async () => {
    if (!topic.trim()) return;
    setIsExtracting(true);
    setFetchError(null);
    try {
      const { data: { session } } = await supabase!.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/fetch-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ url: topic.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to fetch URL');
      if (!data.data.text) {
        setFetchError('No text content could be extracted from this URL');
        return;
      }
      setExtractedContent(data.data.text);
      setExtractedTitle(data.data.title || topic);
      toast.success(`Fetched ${data.data.text.length.toLocaleString()} characters from ${data.data.title || 'page'}`);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Failed to fetch URL');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFetchYoutube = async () => {
    if (!topic.trim()) return;
    setIsExtracting(true);
    setFetchError(null);
    try {
      const { data: { session } } = await supabase!.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/fetch-youtube-transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ url: topic.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to fetch transcript');
      if (!data.data.text) {
        setFetchError(data.data.error || 'No transcript available for this video');
        return;
      }
      setExtractedContent(data.data.text);
      setExtractedTitle(data.data.title || topic);
      toast.success(`Fetched transcript for "${data.data.title}" (${data.data.text.length.toLocaleString()} chars)`);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Failed to fetch YouTube transcript');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    setIsExtracting(true);
    setFetchError(null);
    try {
      const text = await extractStudyAssetText(file);
      if (!text.trim()) {
        setFetchError('No text could be extracted from this file');
        return;
      }
      setExtractedContent(text);
      setExtractedTitle(file.name);
      setTopic(file.name);
      toast.success(`Extracted ${text.length.toLocaleString()} characters from ${file.name}`);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Failed to extract file');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleAudioSelect = async (file: File) => {
    setIsExtracting(true);
    setFetchError(null);
    try {
      const text = await transcribeAudio(file, file.type);
      if (!text.trim()) {
        setFetchError('No speech detected in the audio. Try a clearer recording.');
        return;
      }
      setExtractedContent(text);
      setExtractedTitle(file.name.replace(/\.[^.]+$/, ''));
      setTopic(file.name.replace(/\.[^.]+$/, ''));
      toast.success(`Transcribed ${file.name} (${text.length.toLocaleString()} characters)`);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Failed to transcribe audio');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAudioRecorded = async () => {
    const blob = await recorder.stop();
    if (!blob) return;
    setIsExtracting(true);
    setFetchError(null);
    try {
      const text = await transcribeAudio(blob, blob.type);
      if (!text.trim()) {
        setFetchError('No speech detected. Please try again.');
        return;
      }
      setExtractedContent(text);
      setExtractedTitle('Voice Recording');
      setTopic('Voice Recording');
      recorder.clear();
      toast.success(`Transcribed your recording (${text.length.toLocaleString()} characters)`);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Failed to transcribe recording');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;

    const sourceLabel = extractedTitle || topic;
    const sourceContext = extractedContent
      ? `\n\nUse the following source content to generate the study material. Ground ALL content in this source:\n\n${extractedContent.slice(0, 30000)}`
      : '';

    setIsGenerating(true);
    generationStartRef.current = Date.now();
    setElapsed(0);
    setGenProgress(0);
    const finalNumItems = showCustomInput ? parseInt(customNumItems) || 10 : numItems;

    if (useLocalAI) {
      const model = await localInference.ensureModelFor(sourceLabel, finalNumItems, difficulty === 'mixed' ? 'medium' : difficulty);
      toast.info(`Using ${getModelDisplayName(model)} for this request`);
    }

    const isPres = generatorType === 'presentation';
    const diffDesc = difficulty === 'mixed'
      ? `mixed difficulty levels (include a balanced mix of easy, medium, and hard ${isPres ? 'slides' : generatorType === 'quiz' ? 'questions' : 'flashcards'})`
      : `${difficulty} difficulty level`;
    const languageInstruction = defaultLanguage.toLowerCase() === 'english'
      ? ''
      : ` Write all generated content in ${defaultLanguage}.`;
    const exampleInstruction = includeExamples
      ? ' Include a concise concrete example whenever it improves understanding.'
      : ' Prefer direct definitions and do not add optional examples.';
    const prompt = isPres
      ? `Generate a presentation on "${sourceLabel}" with ${finalNumItems} slides at ${diffDesc}. Each slide should have a title, 3-5 bullet points, and a narrator script for voiceover.${languageInstruction}${exampleInstruction}${sourceContext}\n\nRespond with valid JSON only. Format: { "title": "Presentation Title", "slides": [{ "title": "Slide Title", "bullets": ["Point 1", "Point 2", "Point 3"], "script": "Narrator script for this slide" }] }`
      : `Generate a ${generatorType} on "${sourceLabel}" with ${finalNumItems} ${generatorType === 'quiz' ? 'questions' : 'flashcards'} at ${diffDesc}. ${generatorType === 'quiz' ? 'Include explanations for each question.' : 'Include difficulty levels for each card.'}${languageInstruction}${exampleInstruction}${sourceContext}\n\nRespond with valid JSON only. ${generatorType === 'quiz' ? 'Format: { "questions": [{ "id": "1", "question": "...", "options": ["...", "..."], "correctAnswer": 0, "explanation": "..." }] }' : 'Format: { "cards": [{ "question": "...", "answer": "...", "difficulty": "easy|medium|hard" }] }'}`;

    try {
      const response = await auraAiClient.chatCompletion({
        messages: [
          { role: 'system', content: 'You are a study content generator. Always respond with valid JSON only, no markdown, no other text.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 3000,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content || '';
      if (!content.trim()) {
        toast.error('Empty response from AI. Please try again.');
        return;
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        toast.error('Failed to parse AI response. Please try again.');
        return;
      }

      let rawJson = jsonMatch[0];
      try {
        JSON.parse(rawJson);
      } catch {
        rawJson = rawJson
          .replace(/,\s*([\]}])/g, '$1')
          .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
      }

      const parsed = JSON.parse(rawJson);
      if (generatorType === 'quiz') {
        if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
          toast.error('Generated quiz has no questions. Please try again.');
          return;
        }
        setGeneratedQuiz({
          id: crypto.randomUUID(),
          title: `${topic} Quiz`,
          topic,
          difficulty: difficulty === 'mixed' ? 'medium' : difficulty,
          questions: parsed.questions
        });
      } else if (generatorType === 'presentation') {
        if (!parsed.slides || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
          toast.error('Generated presentation has no slides. Please try again.');
          return;
        }
        setGeneratedPresentation({
          title: parsed.title || `${topic} Presentation`,
          slides: parsed.slides
        });
      } else if (generatorType === 'flashcards') {
        if (!parsed.cards || !Array.isArray(parsed.cards) || parsed.cards.length === 0) {
          toast.error('Generated flashcards have no cards. Please try again.');
          return;
        }
        setGeneratedFlashcards(parsed.cards);
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast.error('Failed to generate content. Please check your connection and try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setTopic('');
    const preferredCount = Number(cardsPerGeneration);
    setNumItems(Number.isFinite(preferredCount) && preferredCount > 0
      ? Math.min(30, Math.max(5, preferredCount))
      : 10);
    setDifficulty('medium');
    setCustomNumItems('');
    setShowCustomInput(false);
    setGeneratedQuiz(null);
    setGeneratedFlashcards(null);
    setGeneratedPresentation(null);
    setEditingIndex(null);
    setEditForm({});
    setExtractedContent(null);
    setExtractedTitle('');
    setFetchError(null);
  };

  const handleSaveQuiz = async () => {
    if (!generatedQuiz) return;
    if (!createDeck || !addCardsToDeck) {
      toast.error('Please sign in to save decks');
      return;
    }
    setIsSaving(true);
    try {
      const deck = await createDeck(
        `${generatedQuiz.title} (Quiz)`,
        `__QUIZ__:${JSON.stringify(generatedQuiz)}`
      );
      if (!deck) { toast.error('Failed to create deck'); return; }
      const cards = generatedQuiz.questions.map(q => ({
        question: q.question,
        answer: `${q.options[q.correctAnswer]}${q.explanation ? ` — ${q.explanation}` : ''}`
      }));
      const savedCount = await addCardsToDeck(deck.id, cards);
      if (!savedCount) {
        toast.error('Failed to save quiz cards — cleaning up');
        await deleteDeck?.(deck.id);
        return;
      }
      toast.success(`Quiz saved as "${deck.title}" (${savedCount} cards)`);
      handleReset();
    } catch (error) {
      console.error('Failed to save quiz:', error);
      toast.error('Failed to save quiz');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendToQuizLab = () => {
    if (!generatedQuiz) return;
    const saved = JSON.parse(localStorage.getItem('auramind-saved-quizzes') || '[]');
    saved.push({ ...generatedQuiz, savedAt: Date.now() });
    localStorage.setItem('auramind-saved-quizzes', JSON.stringify(saved));
    toast.success('Quiz saved to Quiz Lab!');
  };

  const handleSavePresentation = async () => {
    if (!generatedPresentation) return;
    if (!createDeck || !addCardsToDeck) {
      toast.error('Please sign in to save decks');
      return;
    }
    setIsSaving(true);
    try {
      const slides = generatedPresentation.slides;
      const deck = await createDeck(
        `${generatedPresentation.title}`,
        `AI-generated presentation on ${generatedPresentation.title}. ${slides.length} slides.`
      );
      if (!deck) { toast.error('Failed to create deck'); return; }
      const cards = slides.map(s => ({
        question: s.title,
        answer: `${s.bullets.join('\n')}${s.script ? `\n\nScript: ${s.script}` : ''}`
      }));
      const savedCount = await addCardsToDeck(deck.id, cards);
      if (!savedCount) {
        toast.error('Failed to save presentation cards — cleaning up');
        await deleteDeck?.(deck.id);
        return;
      }
      toast.success(`Presentation saved as "${deck.title}" (${savedCount} cards)`);
      handleReset();
    } catch (error) {
      console.error('Failed to save presentation:', error);
      toast.error('Failed to save presentation');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveFlashcards = async () => {
    if (!generatedFlashcards || generatedFlashcards.length === 0) return;
    if (!createDeck || !addCardsToDeck) {
      toast.error('Please sign in to save decks');
      return;
    }
    setIsSaving(true);
    try {
      const deck = await createDeck(
        `${topic} Flashcards`,
        `AI-generated flashcards on ${topic} at ${difficulty} difficulty. ${generatedFlashcards.length} cards.`
      );
      if (!deck) { toast.error('Failed to create deck'); return; }
      const cards = generatedFlashcards.map(card => ({
        question: card.question,
        answer: card.answer
      }));
      const savedCount = await addCardsToDeck(deck.id, cards);
      if (!savedCount) {
        toast.error('Failed to save flashcards — cleaning up');
        await deleteDeck?.(deck.id);
        return;
      }
      toast.success(`Flashcards saved as "${deck.title}" (${savedCount} cards)`);
      handleReset();
    } catch (error) {
      console.error('Failed to save flashcards:', error);
      toast.error('Failed to save flashcards');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditQuestion = (index: number) => {
    if (!generatedQuiz) return;
    const q = generatedQuiz.questions[index];
    setEditForm({ question: q.question, options: [...q.options], correctAnswer: q.correctAnswer, explanation: q.explanation || '' });
    setEditingIndex(index);
  };

  const handleSaveQuestionEdit = () => {
    if (!generatedQuiz || editingIndex === null) return;
    setGeneratedQuiz({
      ...generatedQuiz,
      questions: generatedQuiz.questions.map((q, i) =>
        i === editingIndex ? { ...q, question: editForm.question, options: editForm.options, correctAnswer: editForm.correctAnswer, explanation: editForm.explanation } : q
      )
    });
    setEditingIndex(null);
    setEditForm({});
  };

  const handleDeleteQuestion = (index: number) => {
    if (!generatedQuiz) return;
    setGeneratedQuiz({
      ...generatedQuiz,
      questions: generatedQuiz.questions.filter((_, i) => i !== index)
    });
    toast.success('Question removed');
  };

  const handleEditCard = (index: number) => {
    if (!generatedFlashcards) return;
    const c = generatedFlashcards[index];
    setEditForm({ question: c.question, answer: c.answer, difficulty: c.difficulty || 'medium' });
    setEditingIndex(index);
  };

  const handleSaveCardEdit = () => {
    if (!generatedFlashcards || editingIndex === null) return;
    setGeneratedFlashcards(generatedFlashcards.map((c, i) =>
      i === editingIndex ? { ...c, question: editForm.question, answer: editForm.answer, difficulty: editForm.difficulty } : c
    ));
    setEditingIndex(null);
    setEditForm({});
  };

  const handleDeleteCard = (index: number) => {
    if (!generatedFlashcards) return;
    setGeneratedFlashcards(generatedFlashcards.filter((_, i) => i !== index));
    toast.success('Card removed');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditForm({});
  };

  const generatorCards = [
    { id: 'quiz', label: 'Quiz', description: 'Multiple choice questions', icon: Sparkles },
    { id: 'flashcards', label: 'Flashcards', description: 'Study cards', icon: CheckCircle },
    { id: 'presentation', label: 'Presentation', description: 'Slide decks with voiceover', icon: Sparkles },
  ] as const;

  const sourceOptions = [
    { value: 'topic' as InputSource, label: 'Topic', icon: Type },
    { value: 'url' as InputSource, label: 'URL', icon: Globe },
    { value: 'youtube' as InputSource, label: 'YouTube', icon: Play },
    { value: 'file' as InputSource, label: 'File', icon: FileText },
    { value: 'audio' as InputSource, label: 'Audio', icon: Mic },
  ];

  const difficultyOptions = [
    { value: 'easy', label: 'Easy', color: 'emerald' },
    { value: 'medium', label: 'Medium', color: 'amber' },
    { value: 'hard', label: 'Hard', color: 'red' },
    { value: 'mixed', label: 'Mixed', color: 'violet' },
  ];

  return (
      <div className={`space-y-8 ${isAndroidApp ? 'android-generator-page android-native-page' : ''}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-2"
      >
        <p className="nova-label text-violet-200/80">Create</p>
        <h1 className="nova-display mt-1 text-3xl text-white sm:text-4xl">Generator</h1>
        <p className="mt-2 text-sm text-zinc-400">Create quizzes, flashcards, and presentations with AI</p>
      </motion.div>

      {useLocalAI && localAIProgress && localAIProgress.status !== 'ready' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-[#111118] border border-[#2A2A3A] rounded-xl p-5"
        >
          {localAIProgress.status === 'downloading' && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-5 h-5 border-2 border-[#7C3AED]/30 border-t-[#7C3AED] rounded-full animate-spin" />
                <p className="text-[#F0EFFE] text-sm font-medium">Loading {getModelDisplayName(localInference.getModelId())}</p>
              </div>
              <div className="w-full h-1.5 bg-[#2A2A3A] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-[#7C3AED] rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(localAIProgress.progress * 100)}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-[#7A7A96] text-xs mt-2">{localAIProgress.text}</p>
            </div>
          )}
          {localAIProgress.status === 'error' && (
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-red-400 text-xs font-bold">!</span>
              </div>
              <div>
                <p className="text-red-400 text-sm font-medium mb-1">Failed to load local model</p>
                <p className="text-[#7A7A96] text-xs">{localAIProgress.error}</p>
                <p className="text-[#7A7A96] text-xs mt-2">The app will use the cloud API instead.</p>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Generator Type Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {generatorCards.map((card) => {
            const Icon = card.icon;
            const isActive = generatorType === card.id;
            return (
              <button
                key={card.id}
                onClick={() => {
                  setGeneratorType(card.id as GeneratorType);
                  handleReset();
                }}
                className={`p-5 rounded-xl border text-left transition-all ${
                  isActive
                    ? 'bg-[#7C3AED]/10 border-[#7C3AED]'
                    : 'bg-[#111118] border-[#2A2A3A] hover:border-[#3A3A4F]'
                }`}
              >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isActive ? 'bg-[#7C3AED]' : 'bg-[#1A1A24]'
                    }`}>
                      <Icon size={20} className={isActive ? 'text-white' : 'text-[#7A7A96]'} />
                    </div>
                    <div>
                      <h3 className={`text-sm font-medium ${isActive ? 'text-[#8B5CF6]' : 'text-[#F0EFFE]'}`}>{card.label}</h3>
                      <p className="text-xs text-[#7A7A96]">{card.description}</p>
                    </div>
                  </div>
              </button>
            );
          })}
        </div>
      </motion.div>

      {!generatedQuiz && !generatedFlashcards && !generatedPresentation && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-6"
        >
          <h2 className="text-sm font-medium text-[#F0EFFE] mb-6">
            Configure {generatorType === 'quiz' ? 'Quiz' : generatorType === 'presentation' ? 'Presentation' : 'Flashcards'}
          </h2>

          {/* Source Type Tabs */}
          <div className="mb-6">
            <label className="block text-[10px] font-medium uppercase tracking-widest text-[#7A7A96] mb-3">Source</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {sourceOptions.map((src) => (
                <button
                  key={src.value}
                  onClick={() => { setInputSource(src.value); setFetchError(null); }}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-xs transition-all ${
                    inputSource === src.value
                      ? 'bg-[#7C3AED]/10 border-[#7C3AED] text-[#8B5CF6]'
                      : 'bg-[#1A1A24] border-[#2A2A3A] text-[#7A7A96] hover:border-[#3A3A4F] hover:text-[#F0EFFE]'
                  }`}
                >
                  <src.icon size={14} />
                  <span className="font-medium">{src.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Topic Input */}
          {inputSource === 'topic' && (
            <div className="mb-6">
              <label className="block text-[10px] font-medium uppercase tracking-widest text-[#7A7A96] mb-3">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Biology, History, Mathematics"
                className="w-full p-4 bg-[#1A1A24] border border-[#2A2A3A] rounded-lg text-[#F0EFFE] placeholder-[#7A7A96] focus:outline-none focus:border-[#7C3AED]/50 transition-colors text-sm"
              />
            </div>
          )}

          {/* URL Input */}
          {inputSource === 'url' && (
            <div className="mb-6">
              <label className="block text-[10px] font-medium uppercase tracking-widest text-[#7A7A96] mb-3">Website URL</label>
              <div className="flex gap-3">
                <input
                  type="url"
                  value={topic}
                  onChange={(e) => { setTopic(e.target.value); setExtractedContent(null); }}
                  placeholder="https://example.com/article"
                  className="flex-1 p-4 bg-[#1A1A24] border border-[#2A2A3A] rounded-lg text-[#F0EFFE] placeholder-[#7A7A96] focus:outline-none focus:border-[#7C3AED]/50 transition-colors text-sm"
                />
                <button
                  onClick={handleFetchUrl}
                  disabled={!topic.trim() || isExtracting}
                  className="px-5 py-3 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isExtracting ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Fetch</>
                  ) : 'Fetch'}
                </button>
              </div>
              {extractedContent && (
                <div className="mt-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                  <p className="text-xs text-emerald-400 font-medium mb-1">Fetched: {extractedTitle}</p>
                  <p className="text-[10px] text-[#7A7A96]">{extractedContent.length.toLocaleString()} characters extracted</p>
                </div>
              )}
            </div>
          )}

          {/* YouTube Input */}
          {inputSource === 'youtube' && (
            <div className="mb-6">
              <label className="block text-[10px] font-medium uppercase tracking-widest text-[#7A7A96] mb-3">YouTube Video URL</label>
              <div className="flex gap-3">
                <input
                  type="url"
                  value={topic}
                  onChange={(e) => { setTopic(e.target.value); setExtractedContent(null); }}
                  placeholder="https://youtube.com/watch?v=..."
                  className="flex-1 p-4 bg-[#1A1A24] border border-[#2A2A3A] rounded-lg text-[#F0EFFE] placeholder-[#7A7A96] focus:outline-none focus:border-[#7C3AED]/50 transition-colors text-sm"
                />
                <button
                  onClick={handleFetchYoutube}
                  disabled={!topic.trim() || isExtracting}
                  className="px-5 py-3 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isExtracting ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Fetch</>
                  ) : 'Fetch'}
                </button>
              </div>
              {extractedContent && (
                <div className="mt-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                  <p className="text-xs text-emerald-400 font-medium mb-1">Transcript: {extractedTitle}</p>
                  <p className="text-[10px] text-[#7A7A96]">{extractedContent.length.toLocaleString()} characters</p>
                </div>
              )}
            </div>
          )}

          {/* File Upload */}
          {inputSource === 'file' && (
            <div className="mb-6">
              <label className="block text-[10px] font-medium uppercase tracking-widest text-[#7A7A96] mb-3">Upload Document</label>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-[#2A2A3A] hover:border-[#7C3AED]/50 rounded-xl p-12 text-center cursor-pointer transition-colors bg-[#1A1A24]/50"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.pptx,.txt,.md,.doc,.docx"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                {isExtracting ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-[#7C3AED]/30 border-t-[#7C3AED] rounded-full animate-spin" />
                    <p className="text-[#7A7A96] text-sm">Extracting text...</p>
                  </div>
                ) : extractedContent ? (
                  <div className="flex flex-col items-center gap-3">
                    <FileText size={32} className="text-emerald-400" />
                    <p className="text-emerald-400 font-medium text-sm">{extractedTitle}</p>
                    <p className="text-[10px] text-[#7A7A96]">{extractedContent.length.toLocaleString()} characters extracted</p>
                    <p className="text-[10px] text-[#7A7A96]">Click or drop a new file to replace</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <BookOpen size={32} className="text-[#7A7A96]" />
                    <p className="text-[#F0EFFE] font-medium text-sm">Drop a file here or click to browse</p>
                    <p className="text-[10px] text-[#7A7A96]">PDF, DOCX, TXT, MD, PPTX</p>
                  </div>
                )}
              </div>
              {fetchError && (
                <p className="mt-2 text-xs text-red-400">{fetchError}</p>
              )}
            </div>
          )}

          {/* Audio Input (record or upload) */}
          {inputSource === 'audio' && (
            <div className="mb-6">
              <label className="block text-[10px] font-medium uppercase tracking-widest text-[#7A7A96] mb-3">
                Audio (record a lecture or upload a recording)
              </label>

              {/* Record */}
              <div className="mb-3">
                {!recorder.recording && !recorder.blob ? (
                  <button
                    onClick={() => recorder.start()}
                    disabled={!recorder.supported}
                    className="flex items-center gap-3 w-full p-4 rounded-xl border border-dashed border-[#2A2A3A] hover:border-[#7C3AED]/50 transition-colors bg-[#1A1A24]/50 text-left disabled:opacity-40"
                  >
                    <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                      <Mic size={18} className="text-red-400" />
                    </div>
                    <div>
                      <p className="text-[#F0EFFE] text-sm font-medium">Record lecture</p>
                      <p className="text-[10px] text-[#7A7A96]">
                        {recorder.supported ? 'Tap to start recording from your mic' : 'Mic not available in this browser'}
                      </p>
                    </div>
                  </button>
                ) : recorder.recording ? (
                  <div className="flex items-center gap-3 w-full p-4 rounded-xl border border-red-500/30 bg-red-500/5">
                    <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
                      <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                    </div>
                    <div className="flex-1">
                      <p className="text-red-400 text-sm font-medium">Recording…</p>
                      <p className="text-[10px] text-[#7A7A96]">
                        {Math.floor(recorder.durationMs / 60000)}:{String(Math.floor((recorder.durationMs % 60000) / 1000)).padStart(2, '0')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAudioRecorded()}
                      className="px-4 py-2 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors"
                    >
                      Finish & Transcribe
                    </button>
                    <button
                      onClick={() => recorder.cancel()}
                      className="px-3 py-2 rounded-lg border border-[#2A2A3A] text-[#7A7A96] text-xs hover:text-[#F0EFFE] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 w-full p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                    <Mic size={18} className="text-emerald-400" />
                    <div className="flex-1">
                      <p className="text-emerald-400 text-sm font-medium">Recording ready</p>
                      <p className="text-[10px] text-[#7A7A96]">
                        {Math.floor(recorder.durationMs / 60000)}:{String(Math.floor((recorder.durationMs % 60000) / 1000)).padStart(2, '0')} captured
                      </p>
                    </div>
                    <button
                      onClick={() => handleAudioRecorded()}
                      className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors"
                    >
                      Transcribe
                    </button>
                    <button
                      onClick={() => recorder.clear()}
                      className="px-3 py-2 rounded-lg border border-[#2A2A3A] text-[#7A7A96] text-xs hover:text-[#F0EFFE] transition-colors"
                    >
                      Discard
                    </button>
                  </div>
                )}
              </div>

              {/* Upload */}
              <div
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleAudioSelect(file);
                }}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => audioInputRef.current?.click()}
                className="border border-dashed border-[#2A2A3A] hover:border-[#7C3AED]/50 rounded-xl p-8 text-center cursor-pointer transition-colors bg-[#1A1A24]/50"
              >
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAudioSelect(file);
                  }}
                  className="hidden"
                />
                {isExtracting ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-[#7C3AED]/30 border-t-[#7C3AED] rounded-full animate-spin" />
                    <p className="text-[#7A7A96] text-sm">Transcribing audio…</p>
                  </div>
                ) : extractedContent ? (
                  <div className="flex flex-col items-center gap-3">
                    <Mic size={32} className="text-emerald-400" />
                    <p className="text-emerald-400 font-medium text-sm">{extractedTitle}</p>
                    <p className="text-[10px] text-[#7A7A96]">{extractedContent.length.toLocaleString()} characters transcribed</p>
                    <p className="text-[10px] text-[#7A7A96]">Click or drop new audio to replace</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Mic size={32} className="text-[#7A7A96]" />
                    <p className="text-[#F0EFFE] font-medium text-sm">Drop audio here or click to browse</p>
                    <p className="text-[10px] text-[#7A7A96]">MP3, WAV, M4A, OGG, WEBM</p>
                  </div>
                )}
              </div>
              {fetchError && (
                <p className="mt-2 text-xs text-red-400">{fetchError}</p>
              )}
            </div>
          )}

          {fetchError && inputSource !== 'file' && inputSource !== 'audio' && (
            <p className="mb-6 text-xs text-red-400">{fetchError}</p>
          )}

          <div className="mb-6">
            <label className="block text-[10px] font-medium uppercase tracking-widest text-[#7A7A96] mb-3">
              Number of {generatorType === 'quiz' ? 'Questions' : generatorType === 'presentation' ? 'Slides' : 'Cards'}
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 md:gap-3">
              {[5, 10, 15, 20].map((num) => (
                <button
                  key={num}
                  onClick={() => {
                    setNumItems(num);
                    setShowCustomInput(false);
                    setCustomNumItems('');
                  }}
                  className={`p-4 rounded-lg border text-sm font-medium transition-all ${
                    numItems === num && !showCustomInput
                      ? 'bg-[#7C3AED]/10 border-[#7C3AED] text-[#8B5CF6]'
                      : 'bg-[#1A1A24] border-[#2A2A3A] text-[#7A7A96] hover:border-[#3A3A4F] hover:text-[#F0EFFE]'
                  }`}
                >
                  {num}
                </button>
              ))}
              <button
                onClick={() => setShowCustomInput(true)}
                className={`p-4 rounded-lg border text-sm font-medium transition-all ${
                  showCustomInput
                    ? 'bg-[#7C3AED]/10 border-[#7C3AED] text-[#8B5CF6]'
                    : 'bg-[#1A1A24] border-[#2A2A3A] text-[#7A7A96] hover:border-[#3A3A4F] hover:text-[#F0EFFE]'
                }`}
              >
                Custom
              </button>
            </div>

            {showCustomInput && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3"
              >
                <input
                  type="number"
                  value={customNumItems}
                  onChange={(e) => setCustomNumItems(e.target.value)}
                  placeholder="Enter custom number..."
                  className="w-full p-4 bg-[#1A1A24] border border-[#2A2A3A] rounded-lg text-[#F0EFFE] placeholder-[#7A7A96] focus:outline-none focus:border-[#7C3AED]/50 transition-colors text-sm"
                  min="1"
                  max="50"
                />
              </motion.div>
            )}
          </div>

          <div className="mb-8">
            <label className="block text-[10px] font-medium uppercase tracking-widest text-[#7A7A96] mb-3">Difficulty</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {difficultyOptions.map((diff) => (
                <button
                  key={diff.value}
                  onClick={() => setDifficulty(diff.value as Difficulty)}
                  className={`p-4 rounded-lg border text-sm font-medium transition-all ${
                    difficulty === diff.value
                      ? 'bg-[#7C3AED]/10 border-[#7C3AED] text-[#8B5CF6]'
                      : 'bg-[#1A1A24] border-[#2A2A3A] text-[#7A7A96] hover:border-[#3A3A4F] hover:text-[#F0EFFE]'
                  }`}
                >
                  {diff.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={!topic.trim() || isGenerating || isExtracting}
            className={`w-full flex items-center justify-center gap-3 p-4 rounded-lg text-sm font-medium transition-all ${
              !topic.trim() || isGenerating || isExtracting
                ? 'bg-[#1A1A24] text-[#7A7A96] cursor-not-allowed'
                : 'bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-[0_0_20px_rgba(124,58,237,0.2)]'
            }`}
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="flex flex-col items-start">
                  <span>Generating...</span>
                  <span className="text-[10px] font-normal opacity-60">
                    {elapsed < genEstimate
                      ? `~${genEstimate - elapsed}s remaining`
                      : `still working... (${elapsed}s)`}
                  </span>
                </span>
              </>
            ) : (
              <>
                <Play size={18} />
                Generate {generatorType === 'quiz' ? 'Quiz' : generatorType === 'presentation' ? 'Presentation' : 'Flashcards'}
              </>
            )}
          </button>
        </motion.div>
      )}

      <AnimatePresence>
        {(generatedQuiz || generatedFlashcards || generatedPresentation) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-medium text-[#F0EFFE]">
                  Generated {generatorType === 'quiz' ? 'Quiz' : generatorType === 'presentation' ? 'Presentation' : 'Flashcards'}
                </h2>
                <p className="text-xs text-[#7A7A96] mt-1">
                  {generatorType === 'quiz' ? (
                    <>Topic: {generatedQuiz?.topic} &middot; {generatedQuiz?.difficulty} &middot; {generatedQuiz?.questions.length} questions</>
                  ) : generatorType === 'presentation' ? (
                    <>{generatedPresentation?.title} &middot; {generatedPresentation?.slides.length} slides</>
                  ) : (
                    <>{topic} &middot; {difficulty} &middot; {generatedFlashcards?.length} cards</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#111118] border border-[#2A2A3A] text-[#7A7A96] hover:text-[#F0EFFE] hover:border-[#3A3A4F] transition-all text-xs font-medium"
                >
                  <RotateCcw size={14} />
                  Start Over
                </button>
              </div>
            </div>

            {generatedQuiz && (
              <div className="space-y-3 mb-8">
                {generatedQuiz.questions.map((q, i) => (
                  <div
                    key={q.id || i}
                    className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-5"
                  >
                    <div className="flex items-start gap-4">
                      <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#7C3AED]/10 border border-[#7C3AED]/20 flex items-center justify-center text-sm font-bold text-[#8B5CF6]">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        {editingIndex === i ? (
                          <div className="space-y-3">
                            <textarea
                              value={editForm.question}
                              onChange={e => setEditForm(f => ({ ...f, question: e.target.value }))}
                              className="w-full p-3 bg-[#1A1A24] border border-[#2A2A3A] rounded-lg text-[#F0EFFE] text-sm focus:outline-none focus:border-[#7C3AED]/50"
                              rows={2}
                            />
                            {editForm.options?.map((opt: string, oi: number) => (
                              <div key={oi} className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name={`correct-${i}`}
                                  checked={oi === editForm.correctAnswer}
                                  onChange={() => setEditForm(f => ({ ...f, correctAnswer: oi }))}
                                  className="accent-[#7C3AED]"
                                />
                                <input
                                  value={opt}
                                  onChange={e => {
                                    const opts = [...editForm.options];
                                    opts[oi] = e.target.value;
                                    setEditForm(f => ({ ...f, options: opts }));
                                  }}
                                  className="flex-1 p-2 bg-[#1A1A24] border border-[#2A2A3A] rounded-lg text-[#F0EFFE] text-sm focus:outline-none focus:border-[#7C3AED]/50"
                                />
                              </div>
                            ))}
                            <textarea
                              value={editForm.explanation || ''}
                              onChange={e => setEditForm(f => ({ ...f, explanation: e.target.value }))}
                              placeholder="Explanation (optional)"
                              className="w-full p-3 bg-[#1A1A24] border border-[#2A2A3A] rounded-lg text-[#F0EFFE] text-sm focus:outline-none focus:border-[#7C3AED]/50"
                              rows={2}
                            />
                            <div className="flex gap-2">
                              <button onClick={handleSaveQuestionEdit} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all">
                                <Check size={14} /> Save
                              </button>
                              <button onClick={handleCancelEdit} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A1A24] text-[#7A7A96] hover:text-[#F0EFFE] text-xs font-medium transition-all">
                                <X size={14} /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-[#F0EFFE] font-medium text-sm mb-3">{q.question}</p>
                            <div className="space-y-2">
                              {q.options.map((opt, oi) => {
                                const isCorrect = oi === q.correctAnswer;
                                return (
                                  <div
                                    key={oi}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm ${
                                      isCorrect
                                        ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                                        : 'border-[#2A2A3A] text-[#7A7A96]'
                                    }`}
                                  >
                                    <span className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                                      isCorrect
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : 'bg-[#1A1A24] text-[#7A7A96]'
                                    }`}>
                                      {String.fromCharCode(65 + oi)}
                                    </span>
                                    <span>{opt}</span>
                                    {isCorrect && <CheckCircle size={14} className="text-emerald-400 ml-auto" />}
                                  </div>
                                );
                              })}
                            </div>
                            {q.explanation && (
                              <div className="mt-3 px-4 py-3 rounded-lg bg-[#7C3AED]/5 border border-[#7C3AED]/10 text-sm text-[#7A7A96]">
                                <span className="text-[#8B5CF6] font-medium mr-2">Explanation:</span>
                                {q.explanation}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex flex-row sm:flex-col gap-1.5">
                        <button onClick={() => handleEditQuestion(i)} className="w-9 h-9 rounded-lg bg-[#1A1A24] text-[#7A7A96] hover:text-[#F0EFFE] flex items-center justify-center transition-all" title="Edit">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => handleDeleteQuestion(i)} className="w-9 h-9 rounded-lg bg-[#1A1A24] hover:bg-red-500/20 flex items-center justify-center text-[#7A7A96] hover:text-red-400 transition-all" title="Delete">
                          <Trash size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {generatedPresentation && (
              <div className="mb-8">
                <PresentationViewer title={generatedPresentation.title} slides={generatedPresentation.slides} />
              </div>
            )}

            {generatedFlashcards && (
              <div className="space-y-3 mb-8">
                {generatedFlashcards.map((card, i) => (
                  <FlashcardRow
                    key={i}
                    card={card}
                    index={i}
                    editingIndex={editingIndex}
                    editForm={editForm}
                    setEditForm={setEditForm}
                    onEdit={handleEditCard}
                    onSave={handleSaveCardEdit}
                    onCancel={handleCancelEdit}
                    onDelete={handleDeleteCard}
                  />
                ))}
              </div>
            )}

            <div className="sticky bottom-0 bg-[#0A0A0F]/90 backdrop-blur-xl border-t border-[#2A2A3A] -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 py-4 md:py-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 md:gap-4">
              <button
                onClick={handleReset}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-[#2A2A3A] text-[#7A7A96] hover:text-[#F0EFFE] hover:border-[#3A3A4F] transition-all text-xs font-medium"
              >
                <RotateCcw size={14} />
                Discard
              </button>
              {generatorType === 'quiz' && generatedQuiz && (
                <button
                  onClick={handleSendToQuizLab}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-[#7C3AED]/30 text-[#8B5CF6] hover:text-[#F0EFFE] hover:border-[#7C3AED]/60 transition-all text-xs font-medium"
                >
                  <Target size={16} />
                  Send to Quiz Lab
                </button>
              )}
              <button
                onClick={generatorType === 'presentation' ? handleSavePresentation : generatorType === 'quiz' ? handleSaveQuiz : handleSaveFlashcards}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white transition-all text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(124,58,237,0.2)]"
              >
                <Save size={18} />
                {isSaving ? 'Saving...' : `Save as Deck (${generatorType === 'presentation' ? generatedPresentation?.slides.length : generatorType === 'quiz' ? generatedQuiz?.questions.length : generatedFlashcards?.length} cards)`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FlashcardRow: React.FC<{
  card: FlashcardData;
  index: number;
  editingIndex: number | null;
  editForm: Record<string, any>;
  setEditForm: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  onEdit: (index: number) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: (index: number) => void;
}> = ({ card, index, editingIndex, editForm, setEditForm, onEdit, onSave, onCancel, onDelete }) => {
  const [showAnswer, setShowAnswer] = useState(false);

  const isEditing = editingIndex === index;

  return (
    <div className="bg-[#111118] border border-[#2A2A3A] rounded-xl p-5">
      <div className="flex items-start gap-4">
        <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-sm font-bold text-amber-400">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-3">
              <textarea
                value={editForm.question}
                onChange={e => setEditForm(f => ({ ...f, question: e.target.value }))}
                className="w-full p-3 bg-[#1A1A24] border border-[#2A2A3A] rounded-lg text-[#F0EFFE] text-sm focus:outline-none focus:border-[#7C3AED]/50"
                rows={2}
              />
              <textarea
                value={editForm.answer}
                onChange={e => setEditForm(f => ({ ...f, answer: e.target.value }))}
                className="w-full p-3 bg-[#1A1A24] border border-[#2A2A3A] rounded-lg text-[#F0EFFE] text-sm focus:outline-none focus:border-[#7C3AED]/50"
                rows={2}
              />
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-[#7A7A96] mb-1">Difficulty</label>
                <select
                  value={editForm.difficulty}
                  onChange={e => setEditForm(f => ({ ...f, difficulty: e.target.value }))}
                  className="w-full p-2 bg-[#1A1A24] border border-[#2A2A3A] rounded-lg text-[#F0EFFE] text-sm focus:outline-none focus:border-[#7C3AED]/50"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={onSave} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all">
                  <Check size={14} /> Save
                </button>
                <button onClick={onCancel} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A1A24] text-[#7A7A96] hover:text-[#F0EFFE] text-xs font-medium transition-all">
                  <X size={14} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[#F0EFFE] font-medium text-sm mb-2">{card.question}</p>
              <motion.div
                initial={false}
                animate={{ height: showAnswer ? 'auto' : 0, opacity: showAnswer ? 1 : 0 }}
                className="overflow-hidden"
              >
                <div className="pt-3 border-t border-[#2A2A3A]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-medium uppercase tracking-widest text-amber-500">Answer</span>
                    {card.difficulty && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${
                        card.difficulty === 'easy' ? 'bg-emerald-500/10 text-emerald-400' :
                        card.difficulty === 'hard' ? 'bg-red-500/10 text-red-400' :
                        'bg-amber-500/10 text-amber-400'
                      }`}>
                        {card.difficulty}
                      </span>
                    )}
                  </div>
                  <p className="text-[#7A7A96] text-sm">{card.answer}</p>
                </div>
              </motion.div>
            </>
          )}
        </div>
        <div className="flex-shrink-0 flex flex-row sm:flex-col gap-1.5">
          <button onClick={() => onEdit(index)} disabled={editingIndex !== null && editingIndex !== index} className="w-9 h-9 rounded-lg bg-[#1A1A24] text-[#7A7A96] hover:text-[#F0EFFE] flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed" title="Edit">
            <Pencil size={15} />
          </button>
          <button onClick={() => onDelete(index)} disabled={editingIndex !== null} className="w-9 h-9 rounded-lg bg-[#1A1A24] hover:bg-red-500/20 flex items-center justify-center text-[#7A7A96] hover:text-red-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed" title="Delete">
            <Trash size={15} />
          </button>
        </div>
      </div>
      {!isEditing && (
        <button
          onClick={() => setShowAnswer(!showAnswer)}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#1A1A24] hover:bg-[#2A2A3A] text-[#7A7A96] hover:text-[#F0EFFE] text-xs font-medium transition-all"
        >
          <Eye size={14} /> {showAnswer ? 'Hide' : 'Show'} Answer
        </button>
      )}
    </div>
  );
};

export default GeneratorPage;
