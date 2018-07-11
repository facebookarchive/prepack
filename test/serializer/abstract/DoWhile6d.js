let n = global.__abstract ? __abstract("number", "1") : 1;
let i = 0;
let ob = { j: 1 };
do {
  i++;
  if (i == 1) delete ob.j;
  else ob.j = undefined;
} while (i < n);
let k = ob.j;

inspect = function() {
  return k + " " + JSON.stringify(Reflect.ownKeys(ob));
};
