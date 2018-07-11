(function() {
  function fn() {
    var self = global.__abstract ? global.__abstract("object", "this") : this;

    var fn2 = function(item) {
      return [item, self];
    };

    if (global.__optimize) __optimize(fn2);
    return { fn2, self };
  }

  if (global.__optimize) __optimize(fn);
  global.inspect = function() {
    var result = fn.call({ a: 1 });
    return JSON.stringify(result.fn2());
  };
})();
