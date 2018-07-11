// add at runtime: global.fun = console.log;
var result = [];
global.log = function(arg) {
  result.push(arg);
};
if (global.__assumeDataProperty) {
  __assumeDataProperty(
    global,
    "fun",
    function(arg1) {
      __residual(
        "void",
        function(arg1, console) {
          console.log(arg1);
        },
        arg1,
        console
      );
    },
    "VALUE_DEFINED_INVARIANT"
  );
}

global.fun("literal");

inspect = function() {
  return undefined;
};
