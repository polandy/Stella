import { describe, expect, it } from 'bun:test';
import { STRIP_HEIGHT, stripFan } from './strip-fan';

/*
 * The People card's map strip on a wide card (docs/05 §5.5): the people entered in a wide fan
 * either side of this person, each under or over a first name. The strip is short, so the fan
 * runs sideways in two staggered rows, and the width is what keeps the names legible.
 */

describe('stripFan', () => {
	it('puts this person in the middle of a strip as tall as the card gives it', () => {
		const fan = stripFan(4);
		expect(fan.height).toBe(STRIP_HEIGHT);
		expect(fan.center).toEqual({ x: fan.width / 2, y: STRIP_HEIGHT / 2 });
	});

	it('fans half the people out to the left and the rest to the right', () => {
		const fan = stripFan(5);
		const left = fan.nodes.filter((node) => node.x < fan.center.x);
		expect(fan.nodes.slice(0, 3)).toEqual(left);
		expect(fan.nodes.slice(3).every((node) => node.x > fan.center.x)).toBe(true);
	});

	it('staggers each side in two rows, names over the upper one and under the lower one', () => {
		const fan = stripFan(6);
		for (const node of fan.nodes) {
			if (node.y < fan.center.y) expect(node.labelY).toBeLessThan(node.y);
			else expect(node.labelY).toBeGreaterThan(node.y);
		}
		expect(new Set(fan.nodes.map((node) => node.y)).size).toBe(2);
	});

	it('keeps the names in a row apart, so a first name never runs into the next', () => {
		const fan = stripFan(20);
		for (const row of [true, false]) {
			const xs = fan.nodes
				.filter((node) => node.y < fan.center.y === row)
				.map((node) => node.x)
				.sort((a, b) => a - b);
			for (let i = 1; i < xs.length; i++) {
				expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(fan.labelWidth);
			}
		}
	});

	it('grows as wide as the people need, with room for a name at either end', () => {
		const fan = stripFan(12);
		const xs = fan.nodes.map((node) => node.x);
		expect(Math.min(...xs)).toBeGreaterThanOrEqual(fan.labelWidth / 2);
		expect(Math.max(...xs)).toBeLessThanOrEqual(fan.width - fan.labelWidth / 2);
		expect(stripFan(20).width).toBeGreaterThan(fan.width);
	});

	it('draws nobody around a person with no links', () => {
		expect(stripFan(0).nodes).toEqual([]);
	});
});
