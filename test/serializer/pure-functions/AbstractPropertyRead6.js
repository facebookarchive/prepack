// abstract effects

var __evaluatePureFunction = this.__evaluatePureFunction || (f => f());
let props = global.__abstract
  ? __makeSimple(__abstract("object", "({ profile: { id: 123 } })"))
  : { profile: { id: 123 } };

let x;
function foo() {
  if (props.profile) return;
  if (props.profile.id) return;
}
x = __evaluatePureFunction(() => {
  return foo();
});

inspect = function() {
  return x;
};
