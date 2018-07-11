// add at runtime: global.z = { 0: "test string" };
if (global.__assumeDataProperty)
  __assumeDataProperty(
    this,
    "z",
    __abstract({
      0: __abstract("string"),
    })
  );
let check = z && typeof z[0] === "string" && z[0];
inspect = function() {
  return check;
};
