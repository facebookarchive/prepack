var absx = global.__abstract ? __abstract('string', '("x")') : "x";
var absy = global.__abstract ? __abstract('string', '("y")') : "y";
var absz = global.__abstract ? __abstract('string', '("z")') : "z";

function Foo() { }
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

inspect = function() { return JSON.stringify([r0, r1, r2, r3, r4, r5, r6, r7]) + JSON.stringify(obj); }
