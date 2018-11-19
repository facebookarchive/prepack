// add at runtime: let t = { x: 1 };
let ob = global.__abstract ? __abstract({ x: 1 }, "t") : { x: 1 };
var str = JSON.stringify(ob);
ob.x = 3;
let ob2 = JSON.parse(str);
let ob2x = ob2.x;
ob2.x++;
x = ob2.x;
let ob3 = JSON.parse(str);
y = ob3.x;
var z = ob2x;

inspect = function() {
  return "" + str + ob.x + ob2.x + ob3.x + z;
};
