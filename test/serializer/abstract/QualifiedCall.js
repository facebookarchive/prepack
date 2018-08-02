// add at runtime: global.bar = {x: 1};
let bar = global.__abstract ? __makeSimple(__abstract({ x: 1 }, "global.bar")) : { x: 1 };

let foo = global.__abstract
  ? __abstract("function", "(function() { return this.x; })")
  : function() {
      return this.x;
    };
bar.foo = foo;
x = bar.foo();

let foo2 = global.__abstract
  ? __abstract("function", "(function(a) { return this.x + a; })")
  : function(a) {
      return this.x + a;
    };
bar[1] = foo2;
y = bar[1](100);

// Uncomment this when assignments to symbol properties are supported
// let fooSym = Symbol.for("foo");
// bar[fooSym] = foo2;
// y1 = bar[fooSym](150);

z = foo2(200);

var c = global.__abstract ? __abstract("boolean", "true") : true;
let foo3 = c ? foo2 : foo;

z1 = foo3(300);

inspect = function() {
  return "" + global.x + global.y + global.z + global.z1;
};
