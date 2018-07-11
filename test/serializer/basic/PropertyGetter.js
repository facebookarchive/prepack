var s = {};
Object.defineProperty(s, "p", {
  configurable: true,
  enumerable: true,
  get: function() {
    throw new Error("42");
  },
});

inspect = function() {
  try {
    return s.p;
  } catch (e) {
    return e.message;
  }
};
