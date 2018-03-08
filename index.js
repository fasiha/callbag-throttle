
// Recall how this is used (skip this if you know Haskell's calling patterns):
// - `throttle(100)` is a function that accepts a source callbag.
// - `throttle(100)(source)` is a callbag that throttles the `source` callbag.
// This resulting callbag is ready to be invoked by a sink, that is, a sink will call this callbag with arguments `(0,
// sinksTalkback)`.
const throttle = milliseconds => source => (start, sink) => {
  // If the sink fails to greet us (i.e., fails to meet the callbag spec), bail.
  if (start !== 0) { return; }

  // When we eventually greet the source, we'll get its talkback and put it here. This is the only way we can ask
  // pullable sources to give us more data. (We'll invoke this whether the source is pullable or listenable, but
  // listenables will just ignore it.)
  let talkbackToSource;

  // If we're dealing with a listenable source, it might produce data faster than the throttled callbag is allowed to
  // send. In that situation, we'll queue up the data here: this is a FIFO (first in first out) queue. If the source is
  // producing slow enough, or if the source is a pullable, this will always be empty.
  let stuffListenablesHaveGivenMe = [];

  // These two booleans are important because the source or the sink might terminate on us, which means we can't bother
  // it any more by calling the respective talkback.
  let sourceTerminated = false;
  let sinkTerminated = false;

  // It's no surprise that we need to use `setTimeout` to achieve the throttling. We'll store the timeout object here.
  // The plan is to set a after every time we send data to the sink; if more data should arrive before the timeout is
  // completed, it's queued. When the timeout expires, it'll (1) ask for more data (which only matters if the source is
  // pullable) and (2) it'll send any data that's been queued up in `stuffListenablesHaveGivenMe`. This is implemented
  // in `runAfterCooldown` here.
  let timeout;
  const runAfterCooldown = () => {
    // Clear the `timeout` variable so we know that we're not in the quiet time.
    timeout = null;
    // If the sink is terminated, well, we don't have anything to do. Don't bother asking pullable sources for anything
    // more. And in the talkback to the source that we define below, we'll just ignore anything listenable sources send
    // us after the sink has terminated, so no more timeouts.
    if (sinkTerminated) { return; }
    // Assuming the sink still cares, and so long as the source isn't terminated, ask if it has data for us. Again, this
    // only matters for pullable sources.
    if (!sourceTerminated) { talkbackToSource(1); }
    // The source might or might not send us some data later, so in the meantime, see if we have anything queued up in
    // our FIFO. We haven't specified what gets put into here, that's done below, but I'll just tell you: the FIFO will
    // contain 2-tuple arrays containing both arguments that the source sent us ("t" here is 1 or 2, and "d" is data).
    if (stuffListenablesHaveGivenMe.length) {
      // Here, the quiet period has expired, the source is still waiting, and we have some data from the source that we
      // haven't yet sent to the sink. Remove it from the queue and send it.
      const [t, d] = stuffListenablesHaveGivenMe.shift();
      sink(t, d);
      // If we got to this point, we've just sent something to the sink, soooo, we have to have another cooldown quiet
      // period! Reset the timeout if we got here.
      timeout = setTimeout(runAfterCooldown, milliseconds);
    }
  };

  // Ok, let's finish the handshake with the sink that called us by giving it a talkback to us that it can use to
  // terminate its relationship with us. We ignore the `t===1` case because we don't care if a sink tries to pull from
  // us: we're a listenable callback, and are only going to send when the throttle permits.
  sink(0, (t, d) => {
    if (t === 2) {
      cancelTimeout(timeout);
      sinkTerminated = true;
    }
  });

  // Let's start the handshake with the source by greeting it and giving it the talkback to send us data. About this
  // talkback function: if source is listenable, it'll call this talkback whenever it wants to send us data. If it's
  // pullable, it'll call this talkback in response to us calling `talkbackToSource(1)`, which we'll do in here and
  // after timeouts.
  source(0, (t, d) => {
    // The source will reply to our greeting by calling this function with `(0, talkbackToSource)` so cache the talkback
    // it gives us.
    if (t === 0) {
      talkbackToSource = d;
      // Now ask the source to send us some data: if it's pullable, it'll reply. If it's listenable, it'll ignore this.
      talkbackToSource(1);
    }
    // If the source gives us some data, we can either (1) ignore it, (2) queue it if we're still in the quiet cooldown
    // period, or (3) send it to the sink. Let's do all three here. (Note how we don't care whether the data is a
    // termination, it will all get throttled.)
    if (t === 1 || t === 2) {
      // #1. Ignore the source if we have no sink to convey data to
      if (sinkTerminated) { return; }
      // #2. We're still in the quiet cooldown period and can't send data right away. Queue up the data. (Recall this
      // can only happen with listenable sources, which send data whenever they want to.)
      if (timeout) {
        stuffListenablesHaveGivenMe.push([ t, d ]);
      } else {
        // #3. The cooldown period has expired, so send the data to the sink and initiate a timeout.
        sink(t, d);
        timeout = setTimeout(runAfterCooldown, milliseconds);
      }
    }
    // If the source terminates, then set the flag. The only place this flag is used is in the `runAfterCooldown`
    // function above: we won't bug the source if this flag is set.
    if (t === 2) { sourceTerminated = true; }
  });
};

module.exports = throttle;

const { forEach, fromIter, interval, map, filter, take, pipe } = require('callbag-basics');

// let bag1 = pipe(interval(100), map(x => x + 1), filter(x => x % 2), take(5), forEach(x => console.log('x', x)));
// let bag2 = pipe(interval(100), map(x => x + 1), filter(x => x % 2), take(5), throttle(50),
//     forEach(x => console.log('forEach50', x)));
// let bag3 = pipe(interval(100), map(x => x + 1), filter(x => x % 2), take(5), throttle(850),
//     forEach(x => console.log('major throttle', x)));

function* gen() {
  for (let i = 0; i < 6; i++) { yield i + .5; }
}
let genbag1 = pipe(fromIter(gen()), forEach(x => console.log('x', x)));
// let genbag2 = pipe(fromIter(gen()), throttle(50), forEach(x => console.log('x barely', x)));
let genbag2 = pipe(fromIter(gen()), throttle(850), forEach(x => console.log('x HEAVY', x)));
