na = Object.create(Array.prototype);
a = [];

inspect = function() { a.push(123); na.push(123); return a[0] + na[0]; }
