var t1 = global.__abstract ? __abstract("boolean", "true") : true;
var t2 = global.__abstract ? __abstract("boolean", "(true)") : true;
var f1 = global.__abstract ? __abstract("boolean", "false") : false;
var f2 = global.__abstract ? __abstract("boolean", "(false)") : false;
var ob = global.__abstract ? __abstract({}, "({})") : {};

let c1 = t1 ? 1 : 2;
let c2 = t2 ? 3 : 4;
let alwayst = c1 < c2;
let alwaysf = c1 > c2;

let v1 = t1 && c1;
let v1a = t1 || c1;
let v1f = !t1 && c1;
let v1fa = !t1 || c1;
let v1ob = ob && c1;

let v2 = t1 && t2 && alwayst;
let v2a = t1 && (t2 || alwayst);
let v2f = !t1 && t2 && alwaysf;
let v2fa = !t1 && (t2 || alwaysf);
let v2fa2 = !t1 && (t2 && alwaysf);
let v2fa3 = !t1 && (c1 === 2 || f2);

let v3 = !t1;
let v4 = !(t1 ? t2 : f2);
let v5 = !(t1 ? alwayst : f2);
let v6 = !(t1 ? alwaysf : t2);
let v7 = t2 ? false : true;
let v8 = ob && {};

let v9 = alwayst && t1;
let v9a = alwaysf && t1;
let v10 = alwayst || t1;
let v10a = alwaysf || t1;

if (t1) {
  var x1 = v1;
  x1a = v1a;
  x1f = v1f;
  x1fa = v1fa;
  x1ob = v1ob;

  var x2 = v2;
  x2a = v2a;
  x2f = v2f;
  x2fa = v2fa;
  x2fa2 = v2fa2;
  x2fa3 = v2fa3;

  var x3 = v3;
  var x4 = v4;
  var x5 = v5;
  var x6 = v6;
  var x7 = v7;
  var x8 = v8;

  var x9 = v9;
  var x9a = v9a;
  var x10 = v10;
  var x10a = v10a;
}

inspect = function() {
  return "" + x1 + x2 + x3 + x4 + x5 + x6 + x7 + x8 + x9 + x9a + x10 + x10a;
};
