if (!global.__evaluatePureFunction) {
  global.__evaluatePureFunction = f => f();
}

__evaluatePureFunction(() => {
  let c = global.__abstract ? __abstract("boolean", '(true)') : true;
  let unknown = global.__abstract ? __abstract("string", '("x")') : "x";
  let objWithSetter = {
    y: 1,
    set x(v) {
      this.y = 2;
    }
  };
  let objWithDifferentSetter = {
    y: 4,
    x: 5,
    set z(v) {
    }
  };
  let abstractObj = c ? objWithSetter : objWithDifferentSetter;
  function Foo() {
  }
  Foo.prototype = abstractObj;
  let objWithProto = new Foo();
  objWithProto[unknown] = 123;
  y1 = abstractObj.y;
  y2 = objWithProto.y;

  inspect = function() { return JSON.stringify({x,y1,y2}); }
});