let x = global.__abstract ? __abstract("boolean", "true") : true;
let calledGetter = false;
let ob = x
  ? { a: 1 }
  : {
      get a() {
        calledGetter = true;
        return 2;
      },
    };
let y = ob.a;
inspect = function() {
  return JSON.stringify({ y, calledGetter });
};
