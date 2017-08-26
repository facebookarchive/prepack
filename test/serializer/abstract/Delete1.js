var obj = global.__makePartial ? __makePartial({ p: 41 }) : { p: 41 };
delete obj.p;
z = obj.p;

inspect = function() { return z; }
