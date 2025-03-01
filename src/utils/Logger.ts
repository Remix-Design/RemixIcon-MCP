export interface ILogger {
	debug(message: string, context?: object): void;
	info(message: string, context?: object): void;
	warn(message: string, context?: object): void;
	error(message: string, context?: object): void;
}

export class Logger implements ILogger {
	constructor(private readonly context: string) {}

	debug(message: string, context?: object): void {
		console.debug(`[${this.context}] ${message}`, context);
	}

	info(message: string, context?: object): void {
		console.info(`[${this.context}] ${message}`, context);
	}

	warn(message: string, context?: object): void {
		console.warn(`[${this.context}] ${message}`, context);
	}

	error(message: string, context?: object): void {
		console.error(`[${this.context}] ${message}`, context);
	}
}
