// skip this test for now
(function() {
  var fn2 = function(item, self) {
    return [item, self];
  };

  function fn() {
    var self = global.__abstract ? global.__abstract("object", "this") : this;

    var fn3 = fn2.bind(self);

    if (global.__optimize) __optimize(fn3);
    return { fn3, self };
  }

  if (global.__optimize) __optimize(fn);
  global.inspect = function() {
    var result = fn.call({ a: 1 });
    return JSON.stringify(result.fn2());
  };
})();
