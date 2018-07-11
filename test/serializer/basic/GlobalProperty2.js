global.foo = 42;

inspect = function() {
  global.foo += 1;
  return global.foo;
};
