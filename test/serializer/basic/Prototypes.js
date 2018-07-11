// es6
(function() {
  var a = [
    "Object",
    "Array",
    "Function",
    "Symbol",
    "String",
    "Number",
    "Boolean",
    "Date",
    "RegExp",
    "Set",
    "Map",
    "DataView",
    "ArrayBuffer",
    "WeakMap",
    "WeakSet",
  ];
  a = a.map(name => Object.create(global[name].prototype));
  inspect = function() {
    a.map(p => p.__proto__.constructor.name).join(",");
  };
})();
