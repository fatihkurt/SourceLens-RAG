export type MemoryScope = 'session' | 'global';

export type MemoryItem = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  scope: MemoryScope;
  createdAt: number;
};

