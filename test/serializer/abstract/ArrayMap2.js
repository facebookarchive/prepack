let c = global.__abstract ? __abstract("boolean", "true") : true;

let a = [1];
if (c) a.push(2);
let x;
try {
  x = a.map(x => {
    if (x === 2) throw x;
    else return x + 42;
  });
} catch (e) {
  x = e;
}

global.inspect = function() {
  JSON.stringify(x);
};
