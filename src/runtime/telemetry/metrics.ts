export class Metrics {
  private readonly counters = new Map<string, number>();
  private readonly timings = new Map<string, number[]>();

  inc(name: string, value = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  observe(name: string, durationMs: number): void {
    const arr = this.timings.get(name) ?? [];
    arr.push(durationMs);
    this.timings.set(name, arr);
  }

  snapshot() {
    return {
      counters: Object.fromEntries(this.counters.entries()),
      timings: Object.fromEntries(
        [...this.timings.entries()].map(([k, values]) => [k, {
          count: values.length,
          avg: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0,
        }])
      ),
    };
  }
}

