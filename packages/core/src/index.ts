export * from './errors';
export * from './money';
export * from './dates';
export * from './crypto';
export * from './ids';
export * from './initdata';
export * from './permissions';
export * from './billing';
export * from './salary';
export * from './schedule';
export * from './insight';
export * from './docs';
export * from './testgen/types';
export * from './testgen/local';
export { TOPICS, type TopicKey } from './testgen/banks';

export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };
