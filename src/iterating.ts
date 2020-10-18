
// mapped types as in https://www.typescriptlang.org/docs/handbook/advanced-types.html#mapped-types
type IteratorTuple<T extends any[]> = { [K in keyof T]: Iterator<T[K]> }
type IteratorResultTuple<T extends any[]> = { [K in keyof T]: IteratorResult<T[K]> }
// IDEA add method to handle iterators with different length sequences
/**
 * combine in an iterator the outputs of a tuple of iterators as a tuple of their values
 * 
 * immitating types as seen in https://github.com/blakeembrey/iterative/blob/663fb13e05c9a589a981398cc4d86aca3021399c/src/index.ts#L338
 * @throws if some iterators are consumed before others
 * @param iterators 
 */
export function* zip<T extends any[]>(iterators: IteratorTuple<T>): IterableIterator<T> {

	var allHaveNext: boolean

	do {
		// determine next results
		const results = iterators.map(i => i.next()) as IteratorResultTuple<T>

		const resultHasNext = (result) => !result.done
		const someHaveNext = checkAnyFulfills(results.values(), resultHasNext)
		allHaveNext = checkAllFulfill(results.values(), resultHasNext)
		
		if (someHaveNext && !allHaveNext) {
			throw new Error("some iterators are consumed before others")
		}
		if (allHaveNext) {
			const values = results.map(result => result.value) as T
			yield values
		}
	} while (allHaveNext)
}

export function getIteratorFrom<T>(iterable: Iterable<T>): Iterator<T> {
	return iterable[Symbol.iterator]()
}

/**
 * tasks:
 * - add option to access next iterator value without consuming it
 */
export class PeekableIterator<T> implements IterableIterator<T> {

	private _iterator: Iterator<T>
	private _nextResult: IteratorResult<T>

	constructor(iterator: Iterator<T>) {
		this._iterator = iterator
		this._nextResult = this._iterator.next()
	}

	[Symbol.iterator](): IterableIterator<T> {
		return this
	}

	next(): IteratorResult<T>{
		const currentResult = this._nextResult
		this._nextResult = this._iterator.next()
		return currentResult
	}

	peek(): IteratorResult<T>{
		return this._nextResult
	}
}

export function* range(
	start: number, stop: number,
	stepSize: number=1,
	stopIncluded:boolean=false
): IterableIterator<number>
{
	// assuming stepSize != 0
	const isIncreasing = stepSize > 0
	const continuePredicate = (i: number, stop: number) => {
		if (isIncreasing) {
			return i < stop
		}
		else {
			return i > stop
		}
	}
	for (var i = start; continuePredicate(i, stop); i += stepSize) {
		yield i
	}
	if (stopIncluded) {
		yield stop
	}
}

export function* repeat<T>(value: T, times: number): IterableIterator<T> {
	for (const _ of range(1, times, 1, true)) {
		yield value
	}
}

class IterableIteratorWrapper<T> implements IterableIterator<T> {
	private _iterator: Iterator<T>

	constructor(iterator: Iterator<T>) {
		this._iterator = iterator
	}

	next(): IteratorResult<T> {
		return this._iterator.next()
	}

	[Symbol.iterator](): IterableIterator<T> {
		return this
	} 
}

function wrapWithIterable<T>(iterator: Iterator<T>): IterableIterator<T> {

	return new IterableIteratorWrapper(iterator)
}

type MappingFunctor<T, U> = (element: T) => U
export function* map<T, U>(iterator: Iterator<T>, functor: MappingFunctor<T, U>): IterableIterator<U> {
	
	for (const element of wrapWithIterable(iterator)) {
		yield functor(element)
	}
}

/**
 * creates an iterator that provides elements in reverse sequence.
 * 
 * We assume that:
 * - the sequence provided by given iterator is finite
 * - we have enough ressources to store all elements in the sequence of the given iterator
 * 
 * @param iterator which provides the original sequence
 */
export function* reverse<T>(iterator: Iterator<T>): IterableIterator<T> {

	var sequence = spread(iterator)

	while (sequence.length > 0){
		yield sequence.pop()
	}
}

type applyFunctor<T> = (element: T, breakAfterIteration: () => void) => void
export function applyOnEachOf<T>(iterator: Iterator<T>, functor: applyFunctor<T>) {
	
	var shouldBreakAfterIteration = false
	const breakAfterIteration = () => {
		shouldBreakAfterIteration = true
	}

	for (const element of wrapWithIterable(iterator)) {
		functor(element, breakAfterIteration)
		if (shouldBreakAfterIteration) {
			break
		}
	}
}

// TODO find proper name
// something between map and reduce
// e.g., for cumulative sums, moving averages, consecutive differences
type SmearFunctor<T, U, V> = (givenOn: U, element: T) => {giveOn: U, yield: V}
export function* smear<T, U, V>(iterator: Iterator<T>, functor: SmearFunctor<T, U, V>, initialValue: U): IterableIterator<V> {

	var valueToGiveOn = initialValue

	for (const element of wrapWithIterable(iterator)){

		var result = functor(valueToGiveOn, element)

		valueToGiveOn = result.giveOn
		var valueToYield = result.yield

		yield valueToYield
	}
}

export function sumCumulatively(iterator: Iterator<number>): IterableIterator<number>{

	const functor = (givenOn, element) => {

		const cumulativeSum = givenOn + element

		return {
			giveOn: cumulativeSum,
			yield: cumulativeSum
		}
	}

	return smear<number, number, number>(iterator, functor, 0)
}

type ReduceFunctor<T, U> = (accumulator: U, element: T, breakAfterIteration: () => void) => U
export function reduce<T, U>(iterator: Iterator<T>, functor: ReduceFunctor<T, U>, initialValue: U): U {

	var accumulator = initialValue
	const applyFunctor = (element, breakAfterIteration) => {
		accumulator = functor(accumulator, element, breakAfterIteration)
	}

	applyOnEachOf(iterator, applyFunctor)
	return accumulator
}

export function checkAllFulfill<T>(iterator: Iterator<T>, predicate: (element: T) => boolean): boolean {

	const reduceFunctor = (accumulator, element, breakAfterIteration) => {
		const elementFulfillsPredicate = predicate(element)

		// break early if it is clear that not all elements fulfill predicate
		if (!elementFulfillsPredicate) {
			breakAfterIteration()
		}

		return accumulator && elementFulfillsPredicate
	}

	return reduce<T, boolean>(iterator, reduceFunctor, true)
}

export function checkAnyFulfills<T>(iterator: Iterator<T>, predicate: (element: T) => boolean): boolean {
	// as we look for ∃ x: p(x)
	// and ∃ x: p(x) ≡ ¬¬∃ x: p(x) ≡ ¬∀ x: ¬p(x)
	const negatedPredicate = (element) => !predicate(element)
	return !checkAllFulfill(iterator, negatedPredicate)
}

/**
 * creates an array from the elements of the given iterator
 */
export function spread<T>(iterator: Iterator<T>): T[]{
	return [...wrapWithIterable(iterator)]
}

// TODO find better name
/**
 * tasks:
 * - (provide object oriented facade to) apply common iteration functions  
 *   e.g., `iterator.mapWith(mappingFunctor)` instead of `map(iterator, mappingFunctor)`
 */
export class IteratorObject<T> implements IterableIterator<T> {

	private _iterator: Iterator<T>

	constructor(iterator: Iterator<T>) {
		this._iterator = iterator
	}

	next(): IteratorResult<T> {
		return this._iterator.next()
	}

	[Symbol.iterator](): IterableIterator<T> {
		return this
	}

	map<U>(functor: MappingFunctor<T, U>): IteratorObject<U> {

		const iterator = map(this._iterator, functor)
		return new IteratorObject(iterator)
	}

	reverse(): IteratorObject<T> {

		const iterator = reverse(this._iterator)
		return new IteratorObject(iterator)
	}

	smear<U, V>(functor: SmearFunctor<T, U, V>, initialValue: U): IteratorObject<V>{

		const iterator = smear(this._iterator, functor, initialValue)
		return new IteratorObject(iterator)
	}

	apply(functor: applyFunctor<T>) {

		applyOnEachOf(this._iterator, functor)
	}

	reduce<U>(functor: ReduceFunctor<T, U>, initialValue: U): U {

		return reduce(this._iterator, functor, initialValue)
	}

	checkAllFulfill(predicate: (element: T) => boolean): boolean {

		return checkAllFulfill(this._iterator, predicate)
	}

	checkAnyFulfills(predicate: (element: T) => boolean): boolean {

		return checkAnyFulfills(this._iterator, predicate)
	}

	spread(): T[]{
		return spread(this._iterator)
	}

	// TODO zip method with proper types that combines <T, U extends any[]> to [T, ...U]
	static createZipping<U extends any[]>(iterators: IteratorTuple<U>): IteratorObject<U>{

		var zippingIterator = zip(iterators)
		return new IteratorObject(zippingIterator)
	}

	static createSummingCumulatively(iterator: Iterator<number>): IteratorObject<number>{

		var summingIterator = sumCumulatively(iterator)
		return new IteratorObject(summingIterator)
	}
}
