var obj =
  global.__abstract && global.__makePartial && global.__makeSimple
    ? __makeSimple(__makePartial(__abstract({}, "({foo:1})")))
    : { foo: 1 };

var copyOfObj = {};
var y = 0;
Object.assign(copyOfObj, obj);

var proto = {};
Object.defineProperty(proto, "foo", {
  enumerable: true,
  set() {
    y = 42;
  },
});
copyOfObj.__proto__ = proto;

inspect = function() {
  return JSON.stringify(y);
};
