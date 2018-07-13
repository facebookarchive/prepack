let c = global.__abstract ? __abstract("boolean", "true") : true;
let l = c ? 1 : 2;
let sum = 0;
for (let i = 0; i < l; i++) sum++;

global.inspect = function() {
  return sum;
};
