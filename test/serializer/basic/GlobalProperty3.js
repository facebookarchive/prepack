Object.defineProperty(global, "foo", { configurable: true, enumerable: false, value: 41 });
Object.defineProperty(global, "bar", {
  configurable: true,
  enumerable: false,
  get: function() {
    return 43;
  },
});

inspect = function() {
  global.foo += 1;
  return global.foo === global.bar;
};
