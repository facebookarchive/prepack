function fn(x) {
  return x[Symbol.hasInstance];
}

this.__optimize && __optimize(fn);

inspect = function() {
  class Array1 {
    static [Symbol.hasInstance](instance) {
      return Array.isArray(instance);
    }
  }

  return fn(Array1)([]);
};
