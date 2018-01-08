method1 = Symbol();
y = Symbol();

class Foo {
  constructor(x) {
    this.x = x;
  }
  ['method'](y) {
    return this.x + y;
  }
}

class Bar extends Foo {
  constructor() {
    super(10);
  }
  [method1](z) {
    return this.x + this[y] + z;
  }
  get [y]() {
    return 10;
  }
  set [y](x) {
    // NO-OP
  }
}

inspect = function() { 
  var foo = new Bar(); 
  return [foo, foo[method1](10)]
}