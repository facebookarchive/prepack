global.func = function(a, b, c) {};
Object.defineProperty(global.func, "length", { configurable: true, enumerable: false, writable: true, value: 42 });
global.bound = global.func.bind(null);
global.bound.foo = 123;
Object.defineProperty(global.bound, "length", { configurable: true, enumerable: false, writable: true, value: 84 });
inspect = function() {
  return global.func.length + "-" + global.bound.length + "-" + global.bound.foo;
};
