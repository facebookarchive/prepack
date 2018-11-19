var absx = global.__abstract ? __abstract("string", '("x")') : "x";
var absy = global.__abstract ? __abstract("string", '("y")') : "y";
var absz = global.__abstract ? __abstract("string", '("z")') : "z";

function Foo() {}
Foo.prototype.x = 111;
var obj = new Foo();
r0 = obj[absx];
obj[absy] = 123;
obj[absz] = 456;
r1 = obj.x;
r2 = obj.y;
r3 = obj.z;
r4 = obj[absx];
r5 = obj[absy];
r6 = obj[absz];
//obj[absx] = 777;
r7 = obj.x;

inspect = function() {
  return (
    JSON.stringify([global.r0, global.r1, global.r2, global.r3, global.r4, global.r5, global.r6, global.r7]) +
    JSON.stringify(obj)
  );
};
