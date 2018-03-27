class C {}
C.prototype.foo = 42;

inspect = function() { return JSON.stringify(C); }