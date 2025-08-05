/**
 * Bloom Filter implementation for fast icon name pre-filtering
 * Provides O(1) membership testing with configurable false positive rate
 */
export class BloomFilter {
	private bitArray: Uint8Array;
	private size: number;
	private hashFunctions: number;
	private itemCount: number = 0;

	/**
	 * Create a Bloom filter
	 * @param expectedItems - Expected number of items to store
	 * @param falsePositiveRate - Desired false positive rate (0.01 = 1%)
	 */
	constructor(expectedItems: number, falsePositiveRate: number = 0.01) {
		// Calculate optimal size and hash functions
		this.size = Math.ceil((-expectedItems * Math.log(falsePositiveRate)) / (Math.log(2) ** 2));
		this.hashFunctions = Math.ceil((this.size / expectedItems) * Math.log(2));
		
		// Initialize bit array
		this.bitArray = new Uint8Array(Math.ceil(this.size / 8));
		
		// Clamp hash functions to reasonable range
		this.hashFunctions = Math.min(this.hashFunctions, 10);
	}

	/**
	 * Add an item to the Bloom filter
	 * @param item - Item to add
	 */
	add(item: string): void {
		const hashes = this.getHashes(item);
		for (const hash of hashes) {
			const index = hash % this.size;
			const byteIndex = Math.floor(index / 8);
			const bitIndex = index % 8;
			this.bitArray[byteIndex] |= (1 << bitIndex);
		}
		this.itemCount++;
	}

	/**
	 * Test if an item might be in the set
	 * @param item - Item to test
	 * @returns true if item might be in set, false if definitely not
	 */
	mightContain(item: string): boolean {
		const hashes = this.getHashes(item);
		for (const hash of hashes) {
			const index = hash % this.size;
			const byteIndex = Math.floor(index / 8);
			const bitIndex = index % 8;
			if ((this.bitArray[byteIndex] & (1 << bitIndex)) === 0) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Get current false positive probability
	 */
	getCurrentFalsePositiveRate(): number {
		const ratio = this.itemCount / this.size;
		return Math.pow(1 - Math.exp(-this.hashFunctions * ratio), this.hashFunctions);
	}

	/**
	 * Get filter statistics
	 */
	getStats(): {
		size: number;
		itemCount: number;
		hashFunctions: number;
		estimatedFalsePositiveRate: number;
		memoryUsage: number;
	} {
		return {
			size: this.size,
			itemCount: this.itemCount,
			hashFunctions: this.hashFunctions,
			estimatedFalsePositiveRate: this.getCurrentFalsePositiveRate(),
			memoryUsage: this.bitArray.length
		};
	}

	/**
	 * Clear the filter
	 */
	clear(): void {
		this.bitArray.fill(0);
		this.itemCount = 0;
	}

	/**
	 * Generate multiple hash values for an item
	 * Uses double hashing technique for efficiency
	 */
	private getHashes(item: string): number[] {
		const hash1 = this.hash1(item);
		const hash2 = this.hash2(item);
		const hashes: number[] = [];

		for (let i = 0; i < this.hashFunctions; i++) {
			hashes.push(Math.abs((hash1 + i * hash2) % this.size));
		}

		return hashes;
	}

	/**
	 * First hash function (FNV-1a variant)
	 */
	private hash1(str: string): number {
		let hash = 2166136261;
		for (let i = 0; i < str.length; i++) {
			hash ^= str.charCodeAt(i);
			hash = (hash * 16777619) >>> 0;
		}
		return hash;
	}

	/**
	 * Second hash function (djb2 variant)
	 */
	private hash2(str: string): number {
		let hash = 5381;
		for (let i = 0; i < str.length; i++) {
			hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
		}
		return hash;
	}

	/**
	 * Serialize the Bloom filter for storage
	 */
	serialize(): {
		bitArray: number[];
		size: number;
		hashFunctions: number;
		itemCount: number;
	} {
		return {
			bitArray: Array.from(this.bitArray),
			size: this.size,
			hashFunctions: this.hashFunctions,
			itemCount: this.itemCount
		};
	}

	/**
	 * Deserialize a Bloom filter from storage
	 */
	static deserialize(data: {
		bitArray: number[];
		size: number;
		hashFunctions: number;
		itemCount: number;
	}): BloomFilter {
		const filter = new BloomFilter(1, 0.01); // Temporary values
		filter.bitArray = new Uint8Array(data.bitArray);
		filter.size = data.size;
		filter.hashFunctions = data.hashFunctions;
		filter.itemCount = data.itemCount;
		return filter;
	}
}