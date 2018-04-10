
if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

if (typeof Bootloader === "undefined") {
  var Bootloader = {
    loadModules() {}
  }
}

__evaluatePureFunction(() => {
  var x = window.__abstract ? __abstract("boolean", "(true)") : true;
  var y;

  if (x) {
    Bootloader.loadModules(['Foo'], function() {}, "Bar");
  }
  
  window.foo = [x, y];
})


