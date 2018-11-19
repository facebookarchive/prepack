// add at runtime: var ob = { x: { y: { z: {  } } } };
function render(ob) {
  var x = ob.x;
  if (x == null) return null;
  var y = x.y;
  if (y == null) return null;
  return y.z;
}
let absOb = global.__abstract ? __abstract("object", "ob") : { x: { y: { z: {} } } };
if (global.__makeSimple) __makeSimple(absOb, "transitive");
var prepackedRender = render(absOb);

inspect = function() {
  return JSON.stringify(prepackedRender);
};
