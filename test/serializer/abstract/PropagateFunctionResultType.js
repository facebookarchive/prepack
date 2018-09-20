// add at runtime: let __obj = {f: function() { return 19; }};
let obj = global.__abstract
  ? __abstract({ f: __abstract(":number") }, "__obj")
  : {
      f: function() {
        return 19;
      },
    };
let result = obj.f() + 23;
global.inspect = function() {
  return 42;
};
