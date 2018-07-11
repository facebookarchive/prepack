var s = String;
Object.defineProperty(s, "p", {
  configurable: true,
  enumerable: true,
  set: function() {
    throw new Error("42");
  },
});
try {
  s.p = "gotcha";
} catch (e) {
  Object.defineProperty(s, "p", {
    get: function() {
      return 42;
    },
    set: function() {},
  });
}
s.p = "ok now";

inspect = function() {
  return s.p;
};
