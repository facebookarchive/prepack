// does not contain:dontSerialize

let objFromSet1 = global.__abstract ? __abstract({}, "({dontSerialize:1})") : {};
let objFromSet2 = global.__abstract ? __abstract({}, "({dontSerialize:2})") : {};
if (global.__abstract) {
  __widenIdentity(objFromSet1);
  __widenIdentity(objFromSet2);
}

// Two different objects of widened identities are considered to be
// from two sets and are never equal. This should be folded to false,
// no need to reference the objects.
let areEqual = objFromSet1 === objFromSet2;

inspect = function() {
  return areEqual;
};
