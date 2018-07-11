(function() {
  let o = { foo: 42 };
  Object.freeze(o);
  global.o = o;
  inspect = function() {
    return o.foo;
  };
})();
