let c = global.__abstract ? __abstract("boolean", "true") : true;

let a = [1];
if (c) a.push(2);
let x = a.map(x => x + 42);

global.inspect = function() {
  JSON.stringify(x);
};
