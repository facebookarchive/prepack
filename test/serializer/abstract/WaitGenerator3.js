(function() {
  let x = global.__abstract ? __abstract("boolean", "true") : true;
  global.obj = { time: 99 };
  let dummy = {}; // Dummy closure binding to trigger global scope serialization in the middle of sub-generator.
  if (x) {
    global.obj.time = Date.now();
    expose = function() {
      return dummy;
    };
  } else {
    global.obj.time = 33;
  }
  inspect = function() {
    return global.obj.time > 0;
  };
})();
