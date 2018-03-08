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