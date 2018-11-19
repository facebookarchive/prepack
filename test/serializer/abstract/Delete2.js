let x = global.__abstract ? __abstract("boolean", "true") : true;

let ob1 = { x: 123 };
let ob2 = { x: 456 };
let o = x ? ob1 : ob2;

delete o.x;

z = o.x;
z1 = ob1.x;
z2 = ob2.x;

inspect = function() {
  return "" + global.z + global.z1 + global.z2;
};
