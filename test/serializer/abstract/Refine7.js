// add at runtime:var global=this;this.nativePerformanceNow = Date.now;
if (global.__assumeDataProperty)
  __assumeDataProperty(
    this,
    "nativePerformanceNow",
    function() {
      if (this.__residual)
        return this.__residual(
          "number",
          function(global) {
            return global.nativePerformanceNow();
          },
          global
        );
      else return this.nativePerformanceNow();
    },
    "SKIP_INVARIANT"
  );
let performanceNow = nativePerformanceNow;

let timespans = {};

function addTimespan(key) {
  timespans[key] = {};
}

function startTimespan(key) {
  if (timespans[key]) return;
  timespans[key] = { startTime: performanceNow() };
}

function stopTimespan(key) {
  const timespan = timespans[key];
  if (timespan && timespan.startTime) {
    timespan.endTime = performanceNow();
    // Following line has a problem
    timespan.totalTime = timespan.endTime - (timespan.startTime || 0);
  }
}

startTimespan("hello");
stopTimespan("hello");

inspect = function() {
  return true;
};
