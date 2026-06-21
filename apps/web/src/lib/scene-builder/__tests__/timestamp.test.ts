import { describe, expect, test } from "bun:test";
import { formatClock, parseClock, parseTimestampRange } from "../timestamp";

describe("parseClock", () => {
	test("parses seconds-only", () => {
		expect(parseClock("9")).toBe(9);
	});
	test("parses m:ss", () => {
		expect(parseClock("0:09")).toBe(9);
		expect(parseClock("1:32")).toBe(92);
	});
	test("parses h:mm:ss", () => {
		expect(parseClock("1:02:05")).toBe(3725);
	});
	test("parses fractional seconds", () => {
		expect(parseClock("0:01.5")).toBe(1.5);
	});
	test("rejects garbage", () => {
		expect(parseClock("abc")).toBeNull();
		expect(parseClock("")).toBeNull();
		expect(parseClock("1:2:3:4")).toBeNull();
	});
});

describe("parseTimestampRange", () => {
	test("parses a hyphen range with spaces", () => {
		expect(parseTimestampRange("0:09 - 0:11")).toEqual({
			startSeconds: 9,
			endSeconds: 11,
		});
	});
	test("parses minutes", () => {
		expect(parseTimestampRange("1:32 - 1:38")).toEqual({
			startSeconds: 92,
			endSeconds: 98,
		});
	});
	test("accepts en-dash and 'to'", () => {
		expect(parseTimestampRange("0:00–0:05")).toEqual({
			startSeconds: 0,
			endSeconds: 5,
		});
		expect(parseTimestampRange("0:00 to 0:05")).toEqual({
			startSeconds: 0,
			endSeconds: 5,
		});
	});
	test("rejects when end <= start", () => {
		expect(parseTimestampRange("0:10 - 0:10")).toBeNull();
		expect(parseTimestampRange("0:10 - 0:05")).toBeNull();
	});
	test("rejects a single time or junk", () => {
		expect(parseTimestampRange("0:09")).toBeNull();
		expect(parseTimestampRange("")).toBeNull();
		expect(parseTimestampRange("hello - world")).toBeNull();
	});
});

describe("formatClock", () => {
	test("formats under an hour", () => {
		expect(formatClock(9)).toBe("0:09");
		expect(formatClock(95)).toBe("1:35");
	});
	test("formats over an hour", () => {
		expect(formatClock(3725)).toBe("1:02:05");
	});
});
