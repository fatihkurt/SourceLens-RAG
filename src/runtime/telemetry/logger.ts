type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Logger = {
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void;
};

export class ConsoleLogger implements Logger {
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    const payload = fields ? ` ${JSON.stringify(fields)}` : '';
    const line = `[${level}] ${message}${payload}`;
    if (level === 'error') {
      console.error(line);
      return;
    }
    if (level === 'warn') {
      console.warn(line);
      return;
    }
    console.log(line);
  }
}

