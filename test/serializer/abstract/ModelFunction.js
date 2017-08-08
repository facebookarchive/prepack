var result = [];
global.log = function (arg) { result.push(arg); };
if (global.__assumeDataProperty) {
  __assumeDataProperty(global, "fun", 
    function (arg1) {
      __residual("void", function(arg1, global) {
        global.log(arg1);
      }, arg1, global);
    }, true);
} else {
  global.fun = global.log;
}

global.fun("literal");

inspect = function() { return "" + result; };
