import { Router } from 'express';

const PROMPT_BANK = [
  {
    theme: 'finance',
    text: 'Should investors treat AI infrastructure spending as a durable moat or a near-term margin risk?',
  },
  {
    theme: 'tech',
    text: 'How should a software company explain slower growth if it is deliberately shifting toward higher-quality revenue?',
  },
  {
    theme: 'professional',
    text: 'When should a team escalate a small operational problem before it becomes a strategic risk?',
  },
];

export function createPromptsRouter(): Router {
  const router = Router();

  router.get('/today', (_req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const prompt = PROMPT_BANK[Math.abs(hashDate(today)) % PROMPT_BANK.length];
    res.json({ date: today, ...prompt });
  });

  return router;
}

function hashDate(date: string): number {
  return Array.from(date).reduce((acc, char) => acc + char.charCodeAt(0), 0);
}
