// abstract effects

var __evaluatePureFunction = this.__evaluatePureFunction || (f => f());
let props = global.__abstract
  ? __makeSimple(__abstract("object", "({ item : { profile: { id: 123 }, sponsored_data: null } })"))
  : { item: { profile: { id: 123 }, sponsored_data: null } };

let x;
function foo() {
  var profile = props.item.profile;
  if (!profile) {
    return null;
  }
  var profileId = profile.id;
  if (profileId) {
    return profileId;
  }
  var isSponsored = props.item.sponsored_data == null ? false : true;
  return isSponsored;
}
x = __evaluatePureFunction(() => {
  return foo();
});

inspect = function() {
  return x;
};
