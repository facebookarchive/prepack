global.method1 = Symbol();
global.y = Symbol();

class Foo {
  constructor(x) {
    this.x = x;
  }
  ["method"](y) {
    return this.x + y;
  }
}

global.Bar = class extends Foo {
  constructor() {
    super(10);
  }
  [global.method1](z) {
    return this.x + this[global.y] + z;
  }
  get [global.y]() {
    return 10;
  }
  set [global.y](x) {
    // NO-OP
  }
};

inspect = function() {
  var foo = new global.Bar();
  return [foo, foo[global.method1](10)];
};
