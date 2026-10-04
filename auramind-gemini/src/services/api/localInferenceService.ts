// Type-only import: erased at build time, so @mlc-ai/web-llm contributes
// nothing to the bundle unless a user actually opts into local inference.
// The runtime `CreateMLCEngine` is pulled in via dynamic import inside
// `initialize()` below — it is a multi-megabyte WASM/WebGPU runtime and
// must never land in the main chunk.
import type { MLCEngine } from '@mlc-ai/web-llm';

export interface ModelInfo {
  id: string;
  vram: number;
  name: string;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', vram: 879, name: 'BonaMind Lite' },
  { id: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC', vram: 697, name: 'BonaMind Mini' },
  { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', vram: 376, name: 'BonaMind Nano' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', vram: 945, name: 'BonaMind Micro' },
  { id: 'gemma3-1b-it-q4f16_1-MLC', vram: 711, name: 'BonaMind Core' },
  { id: 'gemma-2-2b-it-q4f16_1-MLC', vram: 1200, name: 'BonaMind Plus' },
  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC-1k', vram: 5400, name: 'BonaMind Pro' },
  { id: 'Qwen2.5-Coder-14B-Instruct-q4f16_1-MLC', vram: 8700, name: 'BonaMind Pro Max' },
];

export function getModelDisplayName(modelId: string): string {
  const found = AVAILABLE_MODELS.find(m => m.id === modelId);
  if (found) return found.name;
  const clean = modelId.replace(/-(Instruct|it)-q4f16_1-MLC.*$/, '').replace(/-/g, ' ');
  return `BonaMind ${clean}`;
}

// All model IDs that WebLLM recognizes — union of AVAILABLE_MODELS and TIER_MODELS
const VALID_LOCAL_MODEL_IDS = new Set([
  ...AVAILABLE_MODELS.map(m => m.id),
  ...['TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC', 'SmolLM2-360M-Instruct-q4f16_1-MLC', 'Llama-3.2-1B-Instruct-q4f16_1-MLC', 'gemma-2-2b-it-q4f16_1-MLC', 'Llama-3.1-8B-Instruct-q4f16_1-MLC-1k', 'Qwen2.5-Coder-14B-Instruct-q4f16_1-MLC'],
]);

export type LocalInferenceStatus = 'unloaded' | 'downloading' | 'ready' | 'error';

export interface InitProgress {
  status: LocalInferenceStatus;
  progress: number;
  text: string;
  error?: string;
}

const MAX_BUF_LOW = 536_870_912;   // 512MB
const MAX_BUF_MED = 1_073_741_824; // 1GB
const _MAX_BUF_HIGH = 2_147_483_648; // 2GB

export type GPUTier = 1 | 2 | 3 | 4;

const TIER_MODELS: Record<GPUTier, string[]> = {
  1: ['SmolLM2-360M-Instruct-q4f16_1-MLC', 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC'],
  2: ['Llama-3.2-1B-Instruct-q4f16_1-MLC', 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC'],
  3: ['gemma-2-2b-it-q4f16_1-MLC', 'Llama-3.2-1B-Instruct-q4f16_1-MLC'],
  4: ['Qwen2.5-Coder-14B-Instruct-q4f16_1-MLC', 'Llama-3.1-8B-Instruct-q4f16_1-MLC-1k'],
};

class LocalInferenceService {
  private engine: MLCEngine | null = null;
  private modelId: string;
  private status: LocalInferenceStatus = 'unloaded';
  private progressListeners: Array<(p: InitProgress) => void> = [];
  private initPromise: Promise<void> | null = null;
  private gpuTier: GPUTier = 2;

  constructor(modelId?: string) {
    const envModel = typeof (import.meta as any)?.env?.VITE_AI_MODEL === 'string'
      ? (import.meta as any).env.VITE_AI_MODEL
      : undefined;
    this.modelId = modelId || (envModel && VALID_LOCAL_MODEL_IDS.has(envModel) ? envModel : '') || '';
  }

  getGPUTier() {
    return this.gpuTier;
  }

  static async detectGPUTier(): Promise<GPUTier> {
    if (!(navigator as any).gpu) return 1;
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (!adapter) return 1;

      const info = adapter.info;
      const limits = adapter.limits;
      const maxBuf = limits.maxStorageBufferBindingSize;
      const arch = (info.architecture || '').toLowerCase();
      const vendor = (info.vendor || '').toLowerCase();

      const isAppleSilicon = arch.includes('apple') || vendor.includes('apple');
      const isIntegrated = arch.includes('gen') || arch.includes('uhd') || vendor.includes('intel');

      console.warn('[BonaMind WebLLM] GPU:', { vendor: info.vendor, arch, maxBuf, isAppleSilicon, isIntegrated });

      if (isAppleSilicon) return 4;
      if (maxBuf >= MAX_BUF_MED && !isIntegrated) return 3;
      if (maxBuf >= MAX_BUF_LOW) return 2;
      return 1;
    } catch {
      return 1;
    }
  }

  getOptimalModel(topic: string, numItems: number, difficulty: string): string {
    const diffMult = difficulty === 'easy' ? 0.5 : difficulty === 'hard' ? 1.5 : 1;
    const score = numItems * diffMult + topic.length / 50;
    const tier = Math.min(this.gpuTier, score > 20 ? 4 : score > 10 ? 3 : score > 5 ? 2 : 1) as GPUTier;
    return TIER_MODELS[tier][0];
  }

  async ensureModelFor(topic: string, numItems: number, difficulty: string): Promise<string> {
    const needed = this.getOptimalModel(topic, numItems, difficulty);
    if (this.modelId === needed && this.engine) return needed;
    await this.resetModel();
    this.modelId = needed;
    this.notify({ status: 'downloading', progress: 0, text: `Switching to ${getModelDisplayName(needed)}...` });
    await this.ensureInitialized();
    return needed;
  }

  getModelId() {
    return this.modelId;
  }

  subscribe(listener: (p: InitProgress) => void) {
    this.progressListeners.push(listener);
    return () => {
      this.progressListeners = this.progressListeners.filter(l => l !== listener);
    };
  }

  private notify(progress: InitProgress) {
    this.progressListeners.forEach(l => l(progress));
  }

  getStatus() {
    return this.status;
  }

  getEngine() {
    return this.engine;
  }

  async ensureInitialized(): Promise<void> {
    if (this.engine) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.initialize();
    return this.initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      this.status = 'downloading';

      if (!this.modelId) {
        this.notify({ status: 'downloading', progress: 0, text: 'Detecting GPU capabilities...' });
        this.gpuTier = await LocalInferenceService.detectGPUTier();
        this.modelId = TIER_MODELS[this.gpuTier][0];
      } else {
        this.gpuTier = await LocalInferenceService.detectGPUTier();
      }

      console.warn('[BonaMind WebLLM] Selected:', { tier: this.gpuTier, model: this.modelId });

      if (!(navigator as any).gpu) {
        throw new Error('WebGPU not supported. Please use Chrome or Edge.');
      }

      const displayName = getModelDisplayName(this.modelId);
      // Loaded on demand — see the type-only import note at the top of
      // this file. This is the single runtime entry point into web-llm.
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
      this.engine = await CreateMLCEngine(this.modelId, {
        initProgressCallback: (report) => {
          const percent = Math.round(report.progress * 100);
          const cleaned = report.text ? report.text.replace(this.modelId, displayName) : '';
          this.notify({
            status: 'downloading',
            progress: report.progress,
            text: cleaned || `Loading ${displayName} (${percent}%)...`,
          });
        },
      });

      this.status = 'ready';
      this.notify({ status: 'ready', progress: 1, text: 'Model ready' });
    } catch (err: any) {
      this.status = 'error';
      this.engine = null;
      this.initPromise = null;
      const msg = err?.message || 'Failed to load local model';
      this.notify({ status: 'error', progress: 0, text: msg, error: msg });
      throw err;
    }
  }

  async chatCompletion(options: {
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    max_tokens?: number;
  }) {
    await this.ensureInitialized();
    if (!this.engine) throw new Error('Local model not loaded');

    const response = await this.engine.chat.completions.create({
      messages: options.messages as any,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 2000,
      stream: false,
    });

    return {
      id: response.id || crypto.randomUUID(),
      object: 'chat.completion',
      created: Date.now(),
      model: this.modelId,
      choices: (response as any).choices?.map((c: any, i: number) => ({
        index: i,
        message: { role: 'assistant', content: c.message?.content || '' },
        finish_reason: c.finish_reason || 'stop',
      })) || [],
      usage: (response as any).usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  async resetModel() {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
    }
    this.status = 'unloaded';
    this.initPromise = null;
  }
}

export const localInference = new LocalInferenceService();



