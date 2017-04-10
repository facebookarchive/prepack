let o = global.__abstract ? __abstract({
    x: __abstract("number"),
  }, "({x: 42})") : ({x: 42});
a = o.x;
inspect = function() { return "" + a; }
