const React = require("react");

function Gamma(props) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(Theta, {
      n: props.c,
      w: props.c,
      s: props.c,
      q: props.x,
      g: null,
      a: props.x,
      f: props.c,
    }),
    [
      React.createElement(
        "div",
        {
          key: "0",
          "data-c": props.c,
        },
        React.createElement(Iota, {
          d: props.c,
          w: props.x,
          u: props.c,
        })
      ),
      React.createElement(
        "div",
        {
          key: "1",
        },
        React.createElement(Xi, {
          v: props.x,
          c: props.x,
          e: props.c,
          a: props.c,
          z: props.x,
          s: 3,
          u: props.x,
          n: props.x,
          o: props.c,
          j: true,
        }),
        React.createElement(Zeta, {
          m: props.c,
          u: props.c,
          s: props.x,
        }),
        React.createElement(Epsilon, {
          s: props.x,
          c: props.c,
          r: props.c,
          q: props.c,
          e: props.x,
          g: props.c,
          o: props.x,
          h: props.c,
          x: props.x,
        })
      ),
    ],
    React.createElement(
      "div",
      {
        "data-x": props.x,
      },
      React.createElement(
        "div",
        {
          "data-x": props.x,
        },
        React.createElement(Delta, {
          l: null,
        }),
        React.createElement(Delta, {
          l: props.x,
        })
      ),
      React.createElement(Xi, {
        v: 1,
        c: props.c,
        e: props.c,
        a: props.x,
        z: props.x,
        s: props.x,
        u: props.c,
        n: props.c,
        o: props.c,
        j: props.x,
      }),
      React.createElement("div", {
        "data-x": props.x,
        "data-c": props.c,
      }),
      React.createElement(Xi, {
        v: props.c,
        c: props.c,
        e: props.c,
        a: props.c,
        z: null,
        s: props.x,
        u: props.x,
        n: 3,
        o: props.x,
        j: -3,
      })
    ),
    React.createElement(
      "div",
      {
        "data-c": props.c,
      },
      React.createElement(Iota, {
        d: props.c,
        w: props.c,
        u: true,
      }),
      React.createElement(Delta, {
        l: props.c,
      }),
      React.createElement(Iota, {
        d: props.c,
        w: -4,
        u: props.c,
      }),
      React.createElement(Xi, {
        v: props.c,
        c: props.x,
        e: props.x,
        a: props.c,
        z: props.c,
        s: props.c,
        u: props.c,
        n: props.c,
        o: null,
        j: props.x,
      })
    ),
    React.createElement("div", {
      "data-x": props.x,
    })
  );
}

function Delta(props) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "div",
      {},
      React.createElement(Iota, {
        d: props.l,
        w: props.l,
        u: props.l,
      }),
      React.createElement(Mu, {
        v: props.l,
        m: props.l,
      }),
      React.createElement(Epsilon, {
        s: 6,
        c: props.l,
        r: props.l,
        q: props.l,
        e: props.l,
        g: props.l,
        o: props.l,
        h: props.l,
        x: props.l,
      })
    ),
    React.createElement(Pi, {
      a: props.l,
      h: props.l,
      c: true,
      z: props.l,
    }),
    null
  );
}

function Iota(props) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "div",
        {},
        React.createElement(
          "div",
          {
            "data-w": props.w,
            "data-d": props.d,
          },
          [
            React.createElement(Pi, {
              key: "0",
              a: props.d,
              h: props.u,
              c: -13,
              z: props.w,
            }),
          ],
          React.createElement("div", {
            "data-d": props.d,
          })
        )
      )
    ),
    React.createElement(
      "div",
      {
        "data-u": props.u,
        "data-w": props.w,
        "data-d": props.d,
      },
      React.createElement(Lambda, {
        m: props.u,
        v: props.w,
        r: props.u,
      }),
      React.createElement(Xi, {
        v: props.u,
        c: props.d,
        e: props.d,
        a: -4,
        z: props.u,
        s: props.d,
        u: props.u,
        n: props.w,
        o: props.u,
        j: props.w,
      }),
      React.createElement(Xi, {
        v: props.d,
        c: 7,
        e: props.u,
        a: null,
        z: props.u,
        s: props.u,
        u: props.u,
        n: props.d,
        o: -10,
        j: props.w,
      })
    ),
    React.createElement(
      React.Fragment,
      null,
      React.createElement(Zeta, {
        m: props.d,
        u: props.d,
        s: props.u,
      })
    )
  );
}

function Lambda(props) {
  return React.createElement(Theta, {
    n: props.m,
    w: props.r,
    s: props.v,
    q: props.m,
    g: props.v,
    a: props.m,
    f: props.r,
  });
}

function Eta(props) {
  return React.createElement(Theta, {
    n: props.v,
    w: props.s,
    s: props.p,
    q: props.q,
    g: props.s,
    a: null,
    f: props.p,
  });
}

function Epsilon(props) {
  return React.createElement(
    "div",
    {
      "data-x": props.x,
      "data-e": props.e,
      "data-c": props.c,
      "data-s": props.s,
      "data-q": props.q,
      "data-h": props.h,
      "data-g": props.g,
      "data-o": props.o,
    },
    React.createElement("div", {
      "data-g": props.g,
    }),
    React.createElement(React.Fragment, null, null),
    React.createElement(Pi, {
      a: props.c,
      h: props.c,
      c: props.r,
      z: props.e,
    })
  );
}

function Pi(props) {
  return React.createElement(
    "div",
    {
      "data-a": props.a,
      "data-h": props.h,
      "data-c": props.c,
    },
    React.createElement("div", {
      "data-h": props.h,
      "data-z": props.z,
      "data-c": props.c,
      "data-a": props.a,
    }),
    React.createElement(Zeta, {
      m: props.z,
      u: props.z,
      s: props.c,
    })
  );
}

function Theta(props) {
  return React.createElement(React.Fragment, null, null);
}

function Xi(props) {
  return React.createElement(
    "div",
    {
      "data-j": props.j,
      "data-v": props.v,
    },
    React.createElement(
      "div",
      {
        "data-v": props.v,
        "data-c": props.c,
        "data-e": props.e,
        "data-n": props.n,
        "data-u": props.u,
        "data-s": props.s,
        "data-o": props.o,
      },
      React.createElement(
        React.Fragment,
        null,
        React.createElement("div", {
          "data-j": props.j,
          "data-n": props.n,
        })
      )
    )
  );
}

function Zeta(props) {
  return React.createElement(
    "div",
    {
      "data-u": props.u,
    },
    React.createElement("div", {
      "data-u": props.u,
      "data-s": props.s,
    }),
    React.createElement(
      "div",
      {},
      React.createElement(
        "div",
        {},
        React.createElement(Mu, {
          v: props.s,
          m: props.s,
        }),
        React.createElement(Mu, {
          v: props.u,
          m: props.m,
        }),
        React.createElement(Mu, {
          v: props.u,
          m: props.s,
        })
      )
    ),
    React.createElement(
      "div",
      {
        "data-m": props.m,
        "data-s": props.s,
      },
      React.createElement("div", {}),
      React.createElement(
        "div",
        {},
        React.createElement(
          "div",
          {
            "data-s": props.s,
          },
          []
        )
      )
    )
  );
}

function Mu(props) {
  return React.createElement("div", {}, null, React.createElement("div", {}, null));
}

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(Gamma);
}

Gamma.getTrials = function(renderer, Gamma) {
  let results = [];
  renderer.update(<Gamma c={null} x={12} />);
  results.push(["render pathological case", renderer.toJSON()]);
  return results;
};

module.exports = Gamma;
