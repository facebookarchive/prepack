// does contain:Prepack model invariant violation
(function() {
  let foo = global.__abstract ? __abstract({ x: __abstract("number") }, "({x : 1})") : { x: 1 };
  global.foox = foo.x;
  global.inspect = function() {};
})();
