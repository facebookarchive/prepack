// es6
// does contain:__not_dead_object_signature__

let obj1 = new Object();
let obj2 = new Object();
let obj3 = new String("__not_dead_object_signature__");
var m = new WeakMap();

m.set(obj1, obj3);
m.set(obj2, obj1);

inspect = function() {
  return "containsRootObject: " + global.s.has(obj2);
};
