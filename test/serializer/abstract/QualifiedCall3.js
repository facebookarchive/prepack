let bar = { x: 1 };
let foo = global.__abstract
  ? __abstract(function() {
      return this.x;
    }, "(function() { return this.x; })")
  : function() {
      return this.x;
    };

bar.foo = foo;
Object.freeze(bar);
var x = bar.foo();
bar.foo = function() {
  return "abc";
};
var y = bar.foo();

inspect = function() {
  return "" + x + y;
};
