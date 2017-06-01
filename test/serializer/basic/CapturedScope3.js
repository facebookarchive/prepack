// serialized function clone count: 0
function p(object, name, desc) {
  var value;
  var valueSet = false;

  function get() {
    if(!valueSet) {
      valueSet = true;
      set(desc.get());
    }
    return value;
  }

  function set(newValue){
    value = newValue;
    valueSet = true;

    Object.defineProperty(object,name,{
      value: newValue,
      configurable: true,
      enumerable: true,
      writable: true
    });
  }

  Object.defineProperty(object, name, {
    get: get,
    set: set,
    configurable: true,
    enumerable: true
  });
}

var x = {};
var y = {};

p(x, "foo", { get: function get() { return 5; } });
p(x, "foo", { get: function get() { return 7; } });
p(y, "bar", { get: function get() { return 8; } });

inspect = function() {
  return x.foo + " " + y.bar;
}
