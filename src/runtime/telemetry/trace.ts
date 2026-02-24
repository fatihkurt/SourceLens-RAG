export type TraceSpan = {
  name: string;
  startMs: number;
  endMs?: number;
  attrs?: Record<string, unknown>;
};

export class TraceCollector {
  private readonly spans: TraceSpan[] = [];

  start(name: string, attrs?: Record<string, unknown>): TraceSpan {
    const span: TraceSpan = { name, startMs: Date.now(), attrs };
    this.spans.push(span);
    return span;
  }

  end(span: TraceSpan, attrs?: Record<string, unknown>): void {
    span.endMs = Date.now();
    span.attrs = { ...(span.attrs ?? {}), ...(attrs ?? {}) };
  }

  all(): TraceSpan[] {
    return this.spans.map((s) => ({ ...s }));
  }
}

