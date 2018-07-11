// es6
// does not contain:__dead_object_signature__

let alive = new Object();
let dead = new String("__dead_object_signature__");

var s = new WeakSet([alive, dead]);

inspect = function() {
  return "containsAlive: " + s.has(alive);
};
