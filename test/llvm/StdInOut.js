// stdout: hello world? no

(function() {
  let getchar = __abstract(":integral", "getchar");
  let putchar = __abstract(":integral", "putchar");

  function ucs2toutf8(charCode) {
    if (charCode <= 0x80) {
      return [charCode | 0];
    } else if (charCode <= 0x800) {
      return [(charCode >> 6) | 0xc0, (charCode & 0x3f) | 0x80];
    } else if (charCode < 0xffff) {
      return [(charCode >> 12) | 0xe0, ((charCode >> 6) & 0x3f) | 0x80, (charCode & 0x3f) | 0x80];
    } else {
      return [
        0xf0 | (charCode >> 18),
        0x80 | ((charCode >> 12) & 0x3f),
        0x80 | ((charCode >> 6) & 0x3f),
        0x80 | (charCode & 0x3f),
      ];
    }
  }

  function print(ucs2str) {
    // convert ucs2 to utf8
    for (let c of ucs2str) {
      let charCode = c.charCodeAt(0);
      let chars = ucs2toutf8(charCode);
      for (let c of chars) {
        putchar(c);
      }
    }
  }

  let y = ucs2toutf8("y".charCodeAt(0))[0];

  print("hello world? ");

  if (getchar() == y) {
    print("YEA!");
  } else {
    print("no");
  }
})();
