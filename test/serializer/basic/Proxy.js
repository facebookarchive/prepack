let p = new Proxy(
  {},
  {
    get: function() {
      return 42;
    },
  }
);
inspect = function() {
  return p.x;
};
