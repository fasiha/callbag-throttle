"use strict";

const throttle = milliseconds => source => (start, sink) => {
  if (start !== 0) { return; }
  let talkbackToSource;
  let sourceTerminated = false;
  let sinkTerminated = false;
  let timeout;
  sink(0, (t, d) => {
    if (t === 2) { sinkTerminated = true; }
  });
  source(0, (t, d) => {
    if (t === 0) {
      talkbackToSource = d;
      talkbackToSource(1);
    } else if (sinkTerminated) {
      return;
    } else if (t === 1) {
      if (!timeout) {
        sink(t, d);
        timeout = setTimeout(() => {
          timeout = undefined;
          // If we just got something from the source, that means it shouldn't be terminated but it might be buggy and
          // emitting even after it terminated, so we'll be defensive here.
          if (!sourceTerminated) { talkbackToSource(1); }
        }, milliseconds);
      }
    } else if (t === 2) {
      sourceTerminated = true;
      sink(t, d);
    }
  });
};

module.exports = throttle;
