import { Router, type Request, type Response } from 'express';
import { handleAI, handleAISpeech, handleAITranscribe } from '../_aiHandler.js';

const router = Router();

// Mounted at /api/ai BEFORE the Vercel catch-all proxy in server.js so the
// real Express response object (with streaming write/end) is used. On Vercel
// the catch-all in index.ts handles these paths instead.
router.post('/chat', async (req: Request, res: Response) => {
  await handleAI(req, res, 'chat');
});

router.post('/chat/stream', async (req: Request, res: Response) => {
  await handleAI(req, res, 'chat/stream');
});

router.post('/transcribe', async (req: Request, res: Response) => {
  await handleAITranscribe(req, res);
});

router.post('/speech', async (req: Request, res: Response) => {
  await handleAISpeech(req, res);
});

export default router;