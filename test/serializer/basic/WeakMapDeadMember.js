// es6
// does not contain:__dead_object_signature__

let alive = new Object();
let dead = new String("__dead_object_signature__");

var s = new WeakMap();

s.set(alive, 1);
s.set(dead, 1);

inspect = function() {
  return "containsAlive: " + s.has(alive);
};
