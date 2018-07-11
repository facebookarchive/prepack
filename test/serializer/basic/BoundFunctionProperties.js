global.func = function(a, b, c) {};
global.bound = global.func.bind(null);
global.bound.foo = 123;
inspect = function() {
  return global.func.length + "-" + global.bound.length + "-" + global.bound.foo;
};
