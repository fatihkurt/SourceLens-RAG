export type QdrantClient = {
  connected: boolean;
};

export function createQdrantClient(): QdrantClient {
  return { connected: false };
}

