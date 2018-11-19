// does not contain: bar
let _$G_derived = global.__abstractOrNull ? __abstractOrNull("object", "({ foo: 0 })") : {};
let _$H_derived = global.__abstractOrNull ? __abstractOrNull("object", "({ foo: 1 })") : {};
let _$I_derived = global.__abstractOrNull ? __abstractOrNull("object", "({ foo: 2 })") : {};
let _$J_derived = global.__abstractOrNull ? __abstractOrNull("object", "({ foo: 3 })") : {};
let _$K_derived = global.__abstractOrNull ? __abstractOrNull("object", "({ foo: 4 })") : {};

let _1Ex_ = _$G_derived != null;

let _1F0_ = _$H_derived != null;

let _1F3_ = _$I_derived != null;

let _1F6_ = _$J_derived != null;

let _1FD_ = _1F6_ ? _$K_derived : _$J_derived;

let _1FC_ = _1F3_ ? _1FD_ : _$I_derived;

let _1FB_ = _1F0_ ? _1FC_ : _$H_derived;

let _1FA_item = _1Ex_ ? _1FB_ : _$G_derived;

let _1F9_ = !_1FA_item;

let _1FW_ = {
  bar: 1,
};

let _1FV_rendered = _1F9_ ? null : _1FW_;

let _1FU_ = !_1FV_rendered;

if (!_1FU_) {
  var x = 123;
}
if (_1FU_) {
  var x = 456;
}

inspect = function() {
  return x;
};
