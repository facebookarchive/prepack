// does not contain:1 + 2
(function() {
  let f = (global.__abstract
  ? __abstract("boolean", "true")
  : true)
    ? {
        g: function g() {
          return 1 + 2;
        },
      }
    : {};
  if (global.__optimize) __optimize(f.g);
  global.inspect = function() {
    return f.g();
  };
})();
