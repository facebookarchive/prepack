let x = global.__abstract ? __abstract("boolean", "true") : true;

function makeMap(b) {
  let m = new Map();
  if (b) {
    m.set("a", 1);
    m.set("foo", 1);
    m.set("bar", 2);
  } else {
    m.set("a", 2);
    m.set("bar", 2);
    m.set("foo", 1);
  }
  return m;
}

let m1 = makeMap(x);
let m2 = makeMap(!x);

var x1 = m1.get("a");

var x2 = [];
for (let [k, v] of m1) {
  x2.push([k, v]);
}

var x3 = [];
for (let [k, v] of m2) {
  x3.push([k, v]);
}

inspect = function() {
  return JSON.stringify([x1, x2, x3]);
};
