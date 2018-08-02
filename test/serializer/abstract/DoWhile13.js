let template = global.__abstract
  ? __abstract({ x: __abstract("number") }, "({ set x(v) { console.log(v); } })")
  : {
      set x(v) {
        console.log(v);
      },
    };
let n = global.__abstract ? __abstract("number", "(2)") : 2;
let i = 0;
do {
  template.x = 3;
} while (++i < n);

inspect = function() {
  return template.x;
};
