let obj1 = global.__abstract
  ? __abstract("object", "({valueOf() { this.x = 10; return 42; }})")
  : {
      valueOf() {
        this.x = 10;
        return 42;
      },
    };

function additional1() {
  var y = Object.create(obj1);
  y + "";
  return y.x;
}

function additional2() {
  var x = {
    valueOf: global.__abstract
      ? __abstract("function", "(function() { this.foo++; return 10; })")
      : function() {
          this.foo++;
          return 10;
        },
    foo: 0,
  };
  return x + "" + x.foo;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  return additional1() + "" + additional2();
};
