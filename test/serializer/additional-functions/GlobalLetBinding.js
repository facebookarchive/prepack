let x = undefined;
let y = undefined;
global.f = function() {
    x = {};
};

global.f1 = function() {
    y = {};
};
  
if (global.__optimize) __optimize(f);
global.inspect = function() { f(); f1(); return x !== y; }