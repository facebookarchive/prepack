let o = global.__makePartial ? __makeIntrinsic("({x: 42})", __makePartial({
    x: __abstract("number"),
  })) : ({x: 42});
a = o.x;
inspect = function() { return "" + a; }
