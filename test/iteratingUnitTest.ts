import { assert, unimplemented } from 'https://deno.land/std/testing/asserts.ts'
import { checkAnyFulfills } from '../src/iterating.ts'

Deno.test('checkAnyFulfills finds single fulfilling value', () => {

	assert(checkAnyFulfills(
		[1, 2, 3].values(),
		(e: number) => e === 2
	))
})
