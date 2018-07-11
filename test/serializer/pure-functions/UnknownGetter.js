if (!global.__evaluatePureFunction) {
  global.__evaluatePureFunction = f => f();
}

__evaluatePureFunction(() => {
  let c = global.__abstract ? __abstract("boolean", "(true)") : true;
  let unknown = global.__abstract ? __abstract("string", '("x")') : "x";
  let objWithGetter = {
    y: 1,
    get x() {
      this.y = 2;
      return 3;
    },
  };
  let objWithoutGetter = {
    y: 4,
    x: 5,
    get z() {},
  };
  let abstractObj = c ? objWithGetter : objWithoutGetter;
  function Foo() {}
  Foo.prototype = abstractObj;
  let objWithProto = new Foo();
  var x = objWithProto[unknown];
  var y1 = abstractObj.y;
  var y2 = objWithProto.y;

  inspect = function() {
    return JSON.stringify({ x, y1, y2 });
  };
});
