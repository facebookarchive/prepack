let ob = global.__makePartial ? __makePartial({ x: 1 }) : { x: 1 };
str = JSON.stringify(ob);
ob.x = 3;
let ob2 = JSON.parse(str);
let ob2x = ob2.x;
ob2.x++;
x = ob2.x;
let ob3 = JSON.parse(str);
y = ob3.x;
z = ob2x;

inspect = function() { return "" + str + ob.x + ob2.x + ob3.x + z }
