// recover-from-errors
// expected errors: [{"location":{"start":{"line":12,"column":4},"end":{"line":12,"column":13},"source":"test/error-handler/call2.js"},"severity":"RecoverableError","errorCode":"PP0017"}]

let bar = { x: 1 };
let foo = global.__abstract
  ? __abstract("function", "(function() { return this.x; })")
  : function() {
      return this.x;
    };

bar.foo = foo;
x = bar.foo();
bar.foo = function() {
  return "abc";
};
y = bar.foo();

inspect = function() {
  return "" + x + y;
};
