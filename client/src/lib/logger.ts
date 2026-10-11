type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

class Logger {
  private prefix: string;

  constructor(prefix: string = 'LongPost') {
    this.prefix = prefix;
  }

  private format(level: LogLevel): string[] {
    return [`[${this.prefix}]`, `[${level.toUpperCase()}]`];
  }

  debug(message: any, ...args: any[]): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(...this.format('debug'), message, ...args);
    }
  }

  info(message: any, ...args: any[]): void {
    console.info(...this.format('info'), message, ...args);
  }

  warn(message: any, ...args: any[]): void {
    console.warn(...this.format('warn'), message, ...args);
  }

  error(message: any, ...args: any[]): void {
    console.error(...this.format('error'), message, ...args);
  }

  success(message: any, ...args: any[]): void {
    console.log(...this.format('success'), message, ...args);
  }

  log(options: { level: LogLevel; args: any[] }): void {
    const { level, args } = options;
    console.log(...this.format(level), ...args);
  }
}

export const logger = new Logger('LongPost');
