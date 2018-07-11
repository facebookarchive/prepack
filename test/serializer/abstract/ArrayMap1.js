let c = global.__abstract ? __abstract("boolean", "true") : true;

let a = [1];
let sum = 0;
if (c) a.push(2);
let x = a.map(x => {
  sum += x;
  return x + 42;
});

global.inspect = function() {
  sum + JSON.stringify(x);
};
