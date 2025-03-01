/**
 * Generic result type
 * Represents the result of an operation that can succeed or fail
 */
export class Result<T> {
	/**
	 * Whether the operation was successful
	 */
	readonly success: boolean;

	/**
	 * Result data (only available if success is true)
	 */
	readonly data?: T;

	/**
	 * Error information (only available if success is false)
	 */
	readonly error?: Error;

	/**
	 * Creates a new result
	 * @param success - Whether the operation was successful
	 * @param data - Result data (for successful operations)
	 * @param error - Error information (for failed operations)
	 * @private
	 */
	private constructor(success: boolean, data?: T, error?: Error) {
		this.success = success;
		this.data = data;
		this.error = error;
	}

	/**
	 * Creates a successful result
	 * @param data - Result data
	 * @returns Successful result
	 */
	static success<T>(data: T): Result<T> {
		return new Result<T>(true, data);
	}

	/**
	 * Creates a failed result
	 * @param error - Error information
	 * @returns Failed result
	 */
	static failure<T>(error: Error): Result<T> {
		return new Result<T>(false, undefined, error);
	}

	/**
	 * Maps the result data to a new type
	 * @param fn - Mapping function
	 * @returns Mapped result
	 */
	map<U>(fn: (data: T) => U): Result<U> {
		if (this.success && this.data !== undefined) {
			return Result.success(fn(this.data));
		}
		return Result.failure<U>(this.error || new Error('Unknown error'));
	}

	/**
	 * Executes a callback if the result is successful
	 * @param fn - Callback function
	 * @returns This result
	 */
	onSuccess(fn: (data: T) => void): Result<T> {
		if (this.success && this.data !== undefined) {
			fn(this.data);
		}
		return this;
	}

	/**
	 * Executes a callback if the result is a failure
	 * @param fn - Callback function
	 * @returns This result
	 */
	onFailure(fn: (error: Error) => void): Result<T> {
		if (!this.success && this.error) {
			fn(this.error);
		}
		return this;
	}
}
