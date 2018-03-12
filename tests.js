"use strict";
const test = require("tape");
const throttle = require('./index');
const { forEach, fromIter, interval, take, pipe } = require('callbag-basics');

// If `start = process.hrtime()`, `elapsed(start)` returns the elapsed milliseconds since `start`.
function elapsed(start) {
  const end = process.hrtime(start);
  return end[0] * 1000 + end[1] / 1e6;
}

// The following tests create vectors of times that messages arrived at sinks. This helper takes such a vector
// `{t:number}[]` (in TypeScript notation) and returns an array of time deltas, in milliseconds. Because it's working
// with deltas, its output will be one element shorter than the input.
const resultsArrToTimeDelta = results => (results.map((x, i, arr) => x.t - (arr[i - 1] || arr[0]).t)).slice(1);

test("lightly throttling a slow listenable shouldn't matter", t => {
  let res1 = [];
  let res2 = [];
  let int = 100;
  let delay = 90;
  let start = process.hrtime();
  let bag1 = pipe(interval(int), take(5), forEach(x => res1.push({ x, t : elapsed(start) })));
  let bag2 = pipe(interval(int), take(5), throttle(delay), forEach(x => res2.push({ x, t : elapsed(start) })));
  setTimeout(() => {
    let tdelta1 = resultsArrToTimeDelta(res1);
    let tdelta2 = resultsArrToTimeDelta(res2);
    // Make sure both callbags fired within 20% of the original interval.
    t.ok(tdelta1.every(x => x > int && x <= 1.2 * int), "unthrottled receipts as expected");
    t.ok(tdelta2.every(x => x > int && x <= 1.2 * int), "throttling doesn't matter");
    t.end();
  }, 1000);
});

test("throttled listenable should emit as soon as allowed", t => {
  let res1 = [];
  let res2 = [];
  let start = process.hrtime();
  let int = 100;
  let delay = 150;
  let bag1 = pipe(interval(int), take(5), forEach(x => res1.push({ x, t : elapsed(start) })));
  let bag2 = pipe(interval(int), take(5), throttle(delay), forEach(x => res2.push({ x, t : elapsed(start) })));
  setTimeout(() => {
    let gold = [ res1[0] ];
    for (let elt of res1) {
      if (elt.t >= delay + gold[gold.length - 1].t) { gold.push(elt); }
    }
    t.equal(gold.length, res2.length, "throttled length matches expected");
    t.ok(gold.every(({ x }, i) => x === res2[i].x), "throttled values match expected");
    t.ok(gold.every(({ t }, i) => res2[i].t >= t && res2[i].t <= (t + 10)), "throttled times very close to original");
    t.end();
  }, 700);
});

test("listenable termination shouldn't be throttled", t => {
  const forEachWithFinal = operation => source => {
    let talkback;
    source(0, (t, d) => {
      if (t === 0) talkback = d;
      if (t === 1) operation(d);
      if (t === 1 || t === 0) talkback(1);
      if (t === 2) { operation('TERMINATED'); }
    });
  };
  let int = 100;
  let delay = 150;
  let res = [];
  let start = process.hrtime();
  let bag = pipe(interval(int), take(5), throttle(delay), forEachWithFinal(x => res.push({ x, t : elapsed(start) })));
  setTimeout(() => {
    const tFinal = res[res.length - 1].t;
    const tPenultimate = res[res.length - 2].t;
    t.ok(tFinal >= tPenultimate && tFinal <= tPenultimate + 10, 'final and penultimate are close');
    t.end();
  }, 700);
});

test("throttled pullable", t => {
  function* gen() {
    for (let i = 0; i < 5; i++) { yield i; }
  }
  let delay = 50;
  let res1 = [];
  let res2 = [];
  let start = process.hrtime();
  let bag1 = pipe(fromIter(gen()), forEach(x => res1.push({ x, t : elapsed(start) })));
  let bag2 = pipe(fromIter(gen()), throttle(delay), forEach(x => res2.push({ x, t : elapsed(start) })));
  setTimeout(() => {
    t.ok(res1.every(({ x }, i) => x === res2[i].x), 'sanity check: values agree between two callbags');
    let tdelta1 = resultsArrToTimeDelta(res1);
    let tdelta2 = resultsArrToTimeDelta(res2);
    // Make sure the unthrottled source was pulled in very rapid succession, i.e., sub-millisecond.
    t.ok(tdelta1.every(x => x < 0.5), "delay between unthrottled receipts was small");
    // Make sure the throttled source was pulled within 20% of the throttle delay.
    t.ok(tdelta2.every(x => x > delay && x <= 1.2 * delay), "throttled delays as expected")
    t.end();
  }, 500);
})