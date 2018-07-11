// es6
// We use the name "console" because it already exists.
// Adding a non-existing property will break our test-runner in Node 7.x.x.
Object.defineProperty(global, "console", {
  configurable: true,
  enumerable: true,
  get: function() {
    throw new Error("42");
  },
});

inspect = function() {
  try {
    return console;
  } catch (e) {
    return e.message;
  }
};
