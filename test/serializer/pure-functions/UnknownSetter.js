if (!global.__evaluatePureFunction) {
  global.__evaluatePureFunction = f => f();
}

var result = __evaluatePureFunction(() => {
  let c = global.__abstract ? __abstract("boolean", "(true)") : true;
  let unknown = global.__abstract ? __abstract("string", '("x")') : "x";
  var knownObject = { a: 0 };
  let objWithSetter = {
    y: 1,
    set x(v) {
      this.y = 2;
      v.a++;
    },
  };
  let objWithDifferentSetter = {
    y: 4,
    x: 5,
    set z(v) {},
  };
  let abstractObj = c ? objWithSetter : objWithDifferentSetter;
  function Foo() {}
  Foo.prototype = abstractObj;
  let objWithProto = new Foo();
  objWithProto[unknown] = knownObject;
  let y1 = abstractObj.y;
  let y2 = objWithProto.y;
  let a = knownObject.a;
  return { a, y1, y2 };
});

inspect = function() {
  return JSON.stringify(result);
};
