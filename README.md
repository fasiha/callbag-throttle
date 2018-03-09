# callbag-throttle

Callbag operator that transforms either a pullable or listenable source into a listenable sink that waits for a fixed period of time before sending.

If the source is listenable and producing data faster than the delay, data is queued up internally.

Example usecase: a callbag source is generating URLs on a server with rate limits of, say, one request per second. This operator can be used to throttle the source to 1000 milliseconds:
```js
const throttle = require('callbag-throttle');
const forEach = require('callbag-for-each');

pipe(urlSource, throttle(1000), forEach(url => fetch(url)));
```

## Background

I feel I have to give *some* background on **callbags**, which is the name [André Staltz](https://staltz.com/why-we-need-callbags.html) gave to the framework for streams and iterables he invented (some might say "discovered" here). If you're like me and learn by seeing examples, the [`callbag-basics`](https://github.com/staltz/callbag-basics) module is probably the best place to start, then following the links therein, and finally by scanning the results for [searching GitHub for "callbag"](https://github.com/search?q=callbag&type=Repositories&utf8=%E2%9C%93), since Staltz has made `callbag-basics` very basic and wants to see functionality added through stand-alone modules that meet the basic callbag specification.

## Installation
On the command line in your Node.js app, run
```
$ npm install --save callbag-throttle
```
Then 
load it via
```js
const throttle = require('callbag-throttle');
```

## API
With `const throttle = require('callbag-throttle')`, insert the following operator between a source and a sink to make the source a throttled listenable, i.e., a source that enforces a delay (in milliseconds) between data. Even the termination signal from the original source is throttled (is that ok?).
```js
throttle(delayMilliseconds)
```

## Tutorial
This is my first callbag library, and my second day working with callbags. I am very much open to suggestions for improving this library.

In this section, I'd like to present some notes on how I got to this library, with the aim of showing callbag beginners how I started thinking about it. I knew I needed a throttle mechanism because I had an ES2015 generator ([cartesian-product-generator](https://github.com/fasiha/cartesian-product-generator)) that was eventually going to hit a REST endpoint enforcing rate limits, so I pasted the source code for a source, [callbag-from-iter](https://github.com/staltz/callbag-from-iter), an operator, [callbag-map](https://github.com/staltz/callbag-map), and a sink, [callbag-for-each](https://github.com/staltz/callbag-for-each), and stared at those for a while.

Then I gathered my courage to start tweaking `forEach`, which André [gives](https://github.com/staltz/callbag-for-each/blob/5f80175ae89c68375e0290d5acec2e57ed0d408f/readme.js#L40) as
```js
const forEach = operation => source => {
  let talkback;
  source(0, (t, d) => {
    if (t === 0) talkback = d;
    if (t === 1) operation(d);
    if (t === 1 || t === 0) talkback(1);
  });
};
```
in order to add throttling. To keep it simple, I aimed to get a throttled `forEach` that **only worked for listenables**. I got the following:
```js
const forEachThrottledListenables = (operation, milliseconds) => source => {
  let talkback;
  let stuffListenablesHaveGivenMe = [];
  let timeout;
  const runAfterCooldown = () => {
    timeout = null;
    if (stuffListenablesHaveGivenMe.length) {
      operation(stuffListenablesHaveGivenMe.shift());
      timeout = setTimeout(runAfterCooldown, milliseconds);
    }
  };
  source(0, (t, d) => {
    if (t === 0) talkback = d;
    if (t === 1) {
      if (timeout) {
        stuffListenablesHaveGivenMe.push(d);
      } else {
        operation(d);
        timeout = setTimeout(runAfterCooldown, milliseconds);
      }
    }
  });
};
```
The conceptual differences between `forEachThrottledListenables` and `forEach` is that when the sink receives data (`t===1`), it'll check if it's in a cooldown quiet period by checking for a `timeout` in progress. If there's no timeout counting down, it'll do the same thing as the original `forEach` and then kick off the timeout to enforce the throttle delay. If there *is* a timeout in progress, it'll push the data that the listenable source gave it to a FIFO stack (an array). The timeout triggers the `runAfterCooldown` function which clears the `timeout` variable (which would otherwise be a big Node object, even after completion), checks if any data had gotten queued up while it was counting down, and if so, emits that and kicks off the next time out. An important idea is, every time `operation` is called (i.e., the actual side-effect of the sink, e.g., `console.log`), a timeout has to be set.

You can try the above function:
```js
var { pipe, interval, take } = require('callbag-basics');
var bag = pipe(interval(100), take(5));
forEachThrottledListenables(x => { console.log('(not) throttled bag', x); }, 50)(bag);
forEachThrottledListenables(x => { console.log('REALLY throttled bag', x); }, 300)(bag);
```
Two listenable source callbags with an interval of 100 milliseconds are firing. The one is "throttled" to fifty milliseconds, which should be indistinguishable from the original source. The second is throttled three-fold (300 milliseconds), so while both sinks log at the same time, more of the first's messages are printed before the second's.

My next goal was the extend this to a throttled `forEach` that works for both listenable and pullables. It's freakish that the tweaks I had to add to get pullables to work are almost completely unrelated to anything involving listenables.

Here's the full code for `forEachThrottledBoth`, and then I'll show the diff between the two:
```js
const forEachThrottledBoth = (operation, milliseconds) => source => {
  let talkback;
  let stuffListenablesHaveGivenMe = [];
  let timeout;
  let terminated = false;
  const runAfterCooldown = () => {
    timeout = null;
    if (!terminated) { talkback(1); }
    if (stuffListenablesHaveGivenMe.length) {
      operation(stuffListenablesHaveGivenMe.shift());
      timeout = setTimeout(runAfterCooldown, milliseconds);
    }
  };
  source(0, (t, d) => {
    if (t === 0) {
      talkback = d;
      talkback(1);
    }
    if (t === 1) {
      if (timeout) {
        stuffListenablesHaveGivenMe.push(d);
      } else {
        operation(d);
        timeout = setTimeout(runAfterCooldown, milliseconds);
      }
    }
    if (t === 2) { terminated = true; }
  });
};
```
And now the diffs (omitting the change in function name):
```diff
4a5
>   let terminated = false;
6a8
>     if (!terminated) { talkback(1); }
13c15,18
<     if (t === 0) talkback = d;
---
>     if (t === 0) {
>       talkback = d;
>       talkback(1);
>     }
21a27
>     if (t === 2) { terminated = true; }
```
This diff should show you what I mean by freaky separation of concerns (which might have been coincidental). I didn't touch any of the existing code—I just added code to work with pullables, meaning, I now have to track it's termination, and I have to invoke its talkback after handshake and after every data message I get from it.

I think that's really cool! By this point, late at night, sick with cold and cough and chills, I'm hooked on callbags.

So I could have used just this throttled sink to accomplish my goal but I was also sufficiently enamored to try and make an operator, like callbag-map, to work with any sink. This needed a good bit more understanding:
- the one extra level of functional nesting, i.e., compare the above sink, `forEachThrottledBoth = (operation, milliseconds) => source => {}` to `throttle = milliseconds => source => (start, sink) => {}`,
- that I have to handshake the sink, not just the source, and track its termination too,
- convey both data and termination from the source to the sink, not just the data,
- and just in general get a better sense of what callbags are doing, before I arrived at the present library.

Maybe this can be helpful to someone who's starting out wondering how to make callbags do something new.