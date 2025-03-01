export class Result<T> {
	private constructor(public readonly success: boolean, public readonly data?: T, public readonly error?: Error) {}

	static success<T>(data: T): Result<T> {
		return new Result(true, data);
	}

	static failure<T>(error: Error): Result<T> {
		return new Result<T>(false, undefined, error);
	}
}
