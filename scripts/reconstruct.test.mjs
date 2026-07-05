// Synthetic tests for the running-max reconstruction — the core value engine.
// Focus: the FAAB waiver path, which we can't exercise against the QA league (it isn't FAAB and
// it's the offseason, so no real waiver bids exist yet). Run: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconstructValues } from '../src/engine.js';

// helpers to build synthetic Sleeper-shaped data
const pick = (id, amount) => ({ player_id: id, metadata: { amount: String(amount) } });
const waiver = (adds, bid, status = 'complete') => ({ type: 'waiver', status, settings: { waiver_bid: bid }, adds });

test('auction pick seeds the value', () => {
  const { val, src } = reconstructValues([pick('A', 50)], []);
  assert.equal(val.get('A'), 50);
  assert.equal(src.get('A'), 'auction');
});

test('FAAB bid above the current value raises it (running-max UP)', () => {
  const { val, src, waiverRaises } = reconstructValues([pick('A', 10)], [[waiver({ A: 3 }, 40)]]);
  assert.equal(val.get('A'), 40);       // raised to the bid
  assert.equal(src.get('A'), 'faab');
  assert.equal(waiverRaises, 1);
});

test('FAAB bid below the current value does NOT lower it', () => {
  const { val, src, waiverRaises } = reconstructValues([pick('A', 60)], [[waiver({ A: 5 }, 5)]]);
  assert.equal(val.get('A'), 60);       // unchanged
  assert.equal(src.get('A'), 'auction'); // source unchanged
  assert.equal(waiverRaises, 0);
});

test('running-max holds across weeks — a cheap re-pickup cannot lower it', () => {
  // drafted $20, bid up to $45 (raise), later re-claimed for $2 (must not drop)
  const weeks = [[waiver({ A: 45 }, 45)], [waiver({ A: 2 }, 2)]];
  const { val } = reconstructValues([pick('A', 20)], weeks);
  assert.equal(val.get('A'), 45);
});

test('a never-drafted player picked up on waivers is worth the bid', () => {
  const { val, src } = reconstructValues([], [[waiver({ Z: 12 }, 12)]]);
  assert.equal(val.get('Z'), 12);
  assert.equal(src.get('Z'), 'faab');
});

test('ignores incomplete waivers and non-waiver (FA / trade) transactions', () => {
  const weeks = [[
    waiver({ A: 99 }, 99, 'failed'),                              // not complete -> ignored
    { type: 'free_agent', status: 'complete', adds: { A: 1 } },   // FA add, no bid  -> no new cost
    { type: 'trade', status: 'complete', adds: { A: 1 } },        // trade, no cost  -> value carries
  ]];
  const { val, src } = reconstructValues([pick('A', 30)], weeks);
  assert.equal(val.get('A'), 30);        // stays at the auction value
  assert.equal(src.get('A'), 'auction');
});

test('each add in a multi-add waiver gets the bid', () => {
  const { val } = reconstructValues([], [[waiver({ A: 7, B: 7 }, 7)]]);
  assert.equal(val.get('A'), 7);
  assert.equal(val.get('B'), 7);
});

test('$0 waiver bid is handled (no crash, value can stay 0)', () => {
  const { val, src } = reconstructValues([], [[waiver({ A: 0 }, 0)]]);
  assert.equal(val.get('A'), 0);
  assert.equal(src.get('A'), 'faab');
});
