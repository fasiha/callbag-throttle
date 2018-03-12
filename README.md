# callbag-throttle

Like RxJS' [`throttleTime`](http://reactivex.io/rxjs/class/es6/Observable.js~Observable.html#instance-method-throttleTime), this callbag operator transforms a pullable or listenable source into a listenable that enforces a fixed-time cooldown period. Any data that arrives during the quiet time is ignored.

(See [`callbag-lossless-throttle`](https://github.com/fasiha/callbag-lossless-throttle) for a lossless version that queues up arrivals during the cooldown quiet period. This repo originally implemented lossless throttling but was changed to match RxJS users' intuition.)

## Background

- [`callbag-basics`](https://github.com/staltz/callbag-basics) and links to articles therein
- [GitHub's search results for "callbag"](https://github.com/search?q=callbag&type=Repositories&utf8=%E2%9C%93)
- André Staltz's ["Why we need callbags"](https://staltz.com/why-we-need-callbags.html)

## Installation
On the command line in your Node.js app, run
```
$ npm install --save callbag-throttle
```
Then load it via
```js
const throttle = require('callbag-throttle');
```

## API
With `const throttle = require('callbag-throttle')`, insert the following operator between a source and a sink to make the source a throttled listenable, i.e., a source that enforces a delay (in milliseconds) between data:
```js
throttle(delayMilliseconds)
```
The termination signal from the original source is not throttled if the original source was listenable, i.e., a sink will be notified immediately of a listenable's termination. However, this is not the case for a pullable: a sink will be notified of a throttled pullable's termination only after the delay (since the pullable is asked for more data only after the cooldown quiet time expires; it's possible that a better design can obviate this caveat?).

## Examples
All examples use the following setup code, and use Node's [`process.hrtime`](https://nodejs.org/api/process.html#process_process_hrtime_time):
```js
// SETUP CODE
const throttle = require('callbag-lossless-throttle');
const { fromIter, interval, take, pipe } = require('callbag-basics');
// Let's define a slightly different forEach that shows us when the source terminates:
const forEachWithFinal = operation => source => {
  let talkback;
  source(0, (t, d) => {
    if (t === 0) talkback = d;
    if (t === 1) operation(d);
    if (t === 1 || t === 0) talkback(1);
    if (t === 2) { operation("TERMINATED"); }
  });
};
function elapsed(start) {
  const end = process.hrtime(start);
  return Math.round(end[0] * 1000 + end[1] / 1e6);
}
```

If we gently throttle an already-slow listenable, the resulting callbag is indistinguishable from the unthrottled case:
```js
var tic = process.hrtime();
pipe(interval(100), take(5), forEachWithFinal(x => console.log(`${x}: ${elapsed(tic)} ms: original`)));
pipe(interval(100), take(5), throttle(90),
    forEachWithFinal(x => console.log(`${x}: ${elapsed(tic)} ms: (not really) throttled`)));
// 0: 107 ms: original
// 0: 110 ms: (not really) throttled
// 1: 211 ms: original
// 1: 211 ms: (not really) throttled
// 2: 313 ms: original
// 2: 313 ms: (not really) throttled
// 3: 413 ms: original
// 3: 413 ms: (not really) throttled
// 4: 514 ms: original
// TERMINATED: 514 ms: original
// 4: 515 ms: (not really) throttled
// TERMINATED: 515 ms: (not really) throttled
```

This next example shows real throttling: only three of five data points from the source are seen after throttling. This is a listenable example again:
```js
var tic = process.hrtime();
pipe(interval(100), take(5), forEach(x => console.log(`${x}: ${elapsed(tic)} ms: original`)));
pipe(interval(100), take(5), throttle(150), forEach(x => console.log(`${x}: ${elapsed(tic)} ms: throttled to 150 ms`)));
// 0: 102 ms: original
// 0: 105 ms: throttled to 150 ms
// 1: 206 ms: original
// 2: 306 ms: original
// 2: 306 ms: throttled to 150 ms
// 3: 408 ms: original
// 4: 513 ms: original
// TERMINATED: 513 ms: original
// 4: 513 ms: throttled to 150 ms
// TERMINATED: 514 ms: throttled to 150 ms
```
Notice how in both these examples, the original source's termination is passed on without delay.

This is in contrast to a pullable source. After throttling, it becomes a listenable source, but the delay has to be applied between the last non-terminate data and the termination:
```js
var tic = process.hrtime();
pipe(fromIter([ 10, 20, 30, 40 ]), forEach(x => console.log(`${x}: ${elapsed(tic)} ms: original`)));
pipe(fromIter([ 10, 20, 30, 40 ]), throttle(50), forEach(x => console.log(`${x}: ${elapsed(tic)} ms: throttled`)));
// 10: 1 ms: original
// 20: 2 ms: original
// 30: 3 ms: original
// 40: 3 ms: original
// TERMINATED: 3 ms: original
// 10: 3 ms: throttled
// 20: 55 ms: throttled
// 30: 107 ms: throttled
// 40: 159 ms: throttled
// TERMINATED: 211 ms: throttled
```
