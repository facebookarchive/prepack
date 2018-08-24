// does not contain:// this function should be inlined
// arrayNestedOptimizedFunctionsEnabled

(function() {
  function add(a, b) {
    // this function should be inlined
    return a + b;
  }

  function fn(x) {
    var arr = Array.from(x);
    return arr.map(function(item) {
      return add(item.a, item.b) + 1 + 2;
    });
  }

  this.__optimize && __optimize(fn);

  inspect = function() {
    return JSON.stringify(fn([{ a: 1, b: 2 }, { a: 5, b: 6 }]));
  };
})();
