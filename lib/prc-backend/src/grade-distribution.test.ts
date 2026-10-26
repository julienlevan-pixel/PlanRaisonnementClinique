import test from "node:test";
import assert from "node:assert/strict";
import { gradeDistribution } from "./grade-distribution.js";

test("grade distribution includes true zeroes, handles maximum and boundaries, and excludes ungraded copies", () => {
  const result = gradeDistribution([
    ...[0, 2, 9, 10, 18, 20].map((score) => ({ state: "submitted", score })),
    { state: "draft", score: null },
    { state: "draft", score: 20 },
    { state: "submitted", score: null },
  ]);
  assert.equal(result.gradedCount, 6);
  assert.equal(result.excludedCount, 3);
  assert.equal(result.lowest, 0);
  assert.equal(result.highest, 20);
  assert.equal(result.median, 9.5);
  assert.equal(result.average, 59 / 6);
  assert.deepEqual(
    result.bins.map((bin) => bin.count),
    [1, 1, 0, 0, 1, 1, 0, 0, 0, 2],
  );
  assert.equal(
    result.bins.reduce((sum, bin) => sum + bin.count, 0),
    6,
  );
  assert.ok(
    Math.abs(result.bins.reduce((sum, bin) => sum + bin.percentage, 0) - 100) <
      1e-8,
  );
  assert.equal("scores" in result, false);
});

test("empty and single-copy distributions do not fabricate grades", () => {
  const empty = gradeDistribution([{ state: "draft", score: null }]);
  assert.equal(empty.average, null);
  assert.equal(empty.median, null);
  assert.equal(empty.gradedCount, 0);
  assert.equal(
    empty.bins.every((bin) => bin.count === 0),
    true,
  );
  const one = gradeDistribution([{ state: "submitted", score: "14.25" }]);
  assert.equal(one.average, 14.25);
  assert.equal(one.median, 14.25);
  assert.equal(one.bins[7].count, 1);
});
