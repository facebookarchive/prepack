// does contain:// this function should not be inlined
// arrayNestedOptimizedFunctionsEnabled

(function() {
  var obj = {
    c: 5,
    d: 11,
  };

  function add(a, b) {
    // this function should not be inlined
    return a + b;
  }

  function fn(x) {
    var arr = Array.from(x);
    return arr.map(function(item) {
      obj.c++;
      return add(item.a, item.b) + obj.c + obj.d;
    });
  }

  this.__optimize && __optimize(fn);

  inspect = function() {
    return JSON.stringify(fn([{ a: 1, b: 2 }, { a: 5, b: 6 }]));
  };
})();
