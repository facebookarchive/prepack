let x = global.__abstract ? __abstract("boolean", "true") : true;
let bar0 = { y: 0 };
let bar1 = { y: 1 };
let bar2 = { y: 2 };

function makeSet(b) {
  let s = new Set();
  if (b) {
    s.add(bar0);
    s.add(bar1);
    s.add(bar2);
  } else {
    s.add(bar0);
    s.add(bar2);
    s.add(bar1);
  }
  return s;
}

let s1 = makeSet(x);
let s2 = makeSet(!x);

var x1 = s1.add(bar0);
var x2 = s2.has(bar0);

var x3 = [];
for (let v of s1) {
  x3.push(v);
}

var x4 = [];
for (let v of s2) {
  x4.push(v);
}

var x5 = s1.delete(bar0);

var x6 = [];
for (let v of s1) {
  x6.push(v);
}

inspect = function() {
  return JSON.stringify([x1, x2, x3, x4, x5, x6]);
};
