// does not contain:{}
let x = global.__abstract ? __abstract("boolean", "(1 === 1)") : true;
let y = global.__abstract ? __abstract("boolean", "(2 === 2)") : true;
let a = x ? null : {};
let b = y ? null : a;
var c = b === null;
let a1 = x ? undefined : {};
let b1 = y ? undefined : a1;
var c1 = b1 === undefined;
let a2 = x ? undefined : {};
let b2 = y ? null : a2;
var c2 = b2 == undefined;
var c3 = b2 == null;

inspect = function() {
  return [c, c1, c2, c3].join(" ");
};
