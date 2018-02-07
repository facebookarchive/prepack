x = 0;

var A = class {
  constructor(y) {
    x = y + 10;
  }
  render() {

  }
};

var b = new A();

var C = class extends b.constructor {
  constructor(y) {
    super(y);
  }
};

new C(1);

inspect = function() { return x; }