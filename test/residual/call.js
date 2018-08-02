// skip
let b = global.__abstract ? __abstract("boolean", "true") : true;

let y = 1;

function foo(x) {
  if (b) y += x;
  else throw x;
}

foo(2);

function bar(x) {
  if (x) return foo;
  else throw foo;
}

if (b) bar(b)(3);
else bar(false)(4);

if (b) {
} else {
  bar(b)(bar(false));
}

function alwaysThrow() {
  throw "always";
}

if (b) {
} else {
  bar(alwaysThrow());
}
bar(bar(b));

if (b) {
} else {
  alwaysThrow(bar(b), bar(b));
}

function plain() {
  y += 3;
}
plain();

var ob = { p: plain };
ob.p();

__result = y;
