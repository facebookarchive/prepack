let ob = global.__abstract ? __makeSimple(__abstract("object", "({a: 1})")) : { a: 1 };
let a = ob.a;

let _1aw_ = !a;

let _1bx_ = _1aw_ ? null : ob;

let _1bw_ = !_1bx_;

if (!_1bw_) {
  var y = _1bw_ ? 123 : 456;
}

inspect = function() {
  return y;
};
