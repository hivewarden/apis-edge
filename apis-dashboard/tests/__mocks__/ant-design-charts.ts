/**
 * Mock for @ant-design/charts
 * Heavy charting library that causes slow resolution in vitest.
 */
const noop = () => null;

export const Area = noop;
export const Line = noop;
export const Column = noop;
export const Radar = noop;
export const Scatter = noop;
export const Bar = noop;
export const Pie = noop;
export default {};
