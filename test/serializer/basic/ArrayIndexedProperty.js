var a = [1, 2, 3];
Object.defineProperty(a, 2, {
  configurable: true,
  enumerable: true,
  get: function() {
    throw new Error();
  },
});
inspect = function() {
  return a.length + typeof Object.getOwnPropertyDescriptor(a, 2).get;
};
