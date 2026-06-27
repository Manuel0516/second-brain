/* @ds-bundle: {"format":3,"namespace":"ZeroFiveDesignSystem_2398b8","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"baaf934d0a9b","components/core/Button.jsx":"a51a6c20471f","components/core/Card.jsx":"8f1a55431b0b","components/core/Input.jsx":"983263353250","components/core/Tag.jsx":"e94cc04455df"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.ZeroFiveDesignSystem_2398b8 = window.ZeroFiveDesignSystem_2398b8 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  style: styleProp,
  ...props
}) {
  const variantMap = {
    neutral: {
      bg: '#18181C',
      color: '#AAA8BB',
      border: '1px solid rgba(255,255,255,0.09)'
    },
    accent: {
      bg: 'rgba(34,211,238,0.08)',
      color: '#22D3EE',
      border: '1px solid rgba(34,211,238,0.22)'
    },
    success: {
      bg: 'rgba(74,222,128,0.08)',
      color: '#4ADE80',
      border: '1px solid rgba(74,222,128,0.22)'
    },
    warning: {
      bg: 'rgba(245,158,11,0.08)',
      color: '#F59E0B',
      border: '1px solid rgba(245,158,11,0.22)'
    },
    danger: {
      bg: 'rgba(244,63,94,0.08)',
      color: '#F43F5E',
      border: '1px solid rgba(244,63,94,0.22)'
    },
    info: {
      bg: 'rgba(129,140,248,0.08)',
      color: '#818CF8',
      border: '1px solid rgba(129,140,248,0.22)'
    }
  };
  const sizeMap = {
    sm: {
      fontSize: '10px',
      padding: '2px 7px',
      gap: '4px'
    },
    md: {
      fontSize: '11px',
      padding: '3px 8px',
      gap: '5px'
    },
    lg: {
      fontSize: '13px',
      padding: '4px 10px',
      gap: '6px'
    }
  };
  const v = variantMap[variant] || variantMap.neutral;
  const s = sizeMap[size] || sizeMap.md;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: s.gap,
      background: v.bg,
      color: v.color,
      border: v.border,
      borderRadius: '9999px',
      fontFamily: "'JetBrainsMono Nerd Font', 'JetBrains Mono', monospace",
      fontSize: s.fontSize,
      fontWeight: '500',
      letterSpacing: '0.03em',
      padding: s.padding,
      lineHeight: 1,
      whiteSpace: 'nowrap',
      ...styleProp
    }
  }, props), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: '5px',
      height: '5px',
      borderRadius: '50%',
      background: v.color,
      flexShrink: 0,
      display: 'inline-block'
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  leftIcon,
  rightIcon,
  onClick,
  type = 'button',
  style: styleProp,
  ...props
}) {
  const [hovered, setHovered] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);
  const sizeMap = {
    sm: {
      fontSize: '13px',
      padding: '5px 12px',
      height: '30px',
      gap: '5px',
      borderRadius: '4px'
    },
    md: {
      fontSize: '14px',
      padding: '7px 16px',
      height: '36px',
      gap: '6px',
      borderRadius: '6px'
    },
    lg: {
      fontSize: '15px',
      padding: '10px 22px',
      height: '44px',
      gap: '8px',
      borderRadius: '6px'
    }
  };
  const variantMap = {
    primary: {
      base: {
        background: '#22D3EE',
        color: '#09090B',
        border: 'none'
      },
      hover: {
        background: '#38BDF8'
      },
      press: {
        background: '#0EA5E9',
        color: '#09090B'
      }
    },
    secondary: {
      base: {
        background: 'transparent',
        color: '#F0EFF8',
        border: '1px solid rgba(255,255,255,0.12)'
      },
      hover: {
        background: 'rgba(255,255,255,0.06)',
        borderColor: 'rgba(255,255,255,0.18)'
      },
      press: {
        background: 'rgba(255,255,255,0.09)'
      }
    },
    ghost: {
      base: {
        background: 'transparent',
        color: '#AAA8BB',
        border: 'none'
      },
      hover: {
        background: 'rgba(255,255,255,0.06)',
        color: '#F0EFF8'
      },
      press: {
        background: 'rgba(255,255,255,0.09)'
      }
    },
    danger: {
      base: {
        background: 'rgba(244,63,94,0.10)',
        color: '#F43F5E',
        border: '1px solid rgba(244,63,94,0.28)'
      },
      hover: {
        background: 'rgba(244,63,94,0.18)',
        borderColor: 'rgba(244,63,94,0.45)'
      },
      press: {
        background: 'rgba(244,63,94,0.24)'
      }
    }
  };
  const v = variantMap[variant] || variantMap.primary;
  const s = sizeMap[size] || sizeMap.md;
  const iconSize = size === 'sm' ? '14px' : size === 'lg' ? '17px' : '15px';
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif",
    fontWeight: '500',
    letterSpacing: '-0.01em',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transition: 'background-color 120ms ease, color 120ms ease, border-color 120ms ease',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    outline: 'none',
    textDecoration: 'none',
    lineHeight: '1',
    flexShrink: 0,
    ...s,
    ...v.base,
    ...(hovered && !disabled ? v.hover : {}),
    ...(pressed && !disabled ? v.press : {}),
    ...styleProp
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    style: style,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => {
      setHovered(false);
      setPressed(false);
    },
    onMouseDown: () => setPressed(true),
    onMouseUp: () => setPressed(false)
  }, props), leftIcon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      lineHeight: 0,
      fontSize: iconSize
    }
  }, leftIcon), children, rightIcon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      lineHeight: 0,
      fontSize: iconSize
    }
  }, rightIcon));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  children,
  variant = 'default',
  padding = 'md',
  style: styleProp,
  ...props
}) {
  const variantMap = {
    default: {
      background: '#171820',
      border: '1px solid #21222C',
      boxShadow: '0 2px 6px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.50)'
    },
    elevated: {
      background: '#21222C',
      border: '1px solid #2B2C38',
      boxShadow: '0 4px 16px rgba(0,0,0,0.50), 0 2px 4px rgba(0,0,0,0.45)'
    },
    outlined: {
      background: 'transparent',
      border: '1px solid #2B2C38',
      boxShadow: 'none'
    },
    ghost: {
      background: 'rgba(242,242,248,0.04)',
      border: 'none',
      boxShadow: 'none'
    }
  };
  const paddingMap = {
    none: '0',
    sm: '12px',
    md: '20px',
    lg: '32px'
  };
  const v = variantMap[variant] || variantMap.default;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      borderRadius: '8px',
      padding: paddingMap[padding] ?? paddingMap.md,
      ...v,
      ...styleProp
    }
  }, props), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  label,
  placeholder,
  value,
  onChange,
  error,
  hint,
  disabled = false,
  type = 'text',
  prefix,
  suffix,
  id,
  style: styleProp,
  ...props
}) {
  const [focused, setFocused] = React.useState(false);
  const inputId = id || (label ? 'input-' + label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const borderColor = error ? '#F43F5E' : focused ? '#22D3EE' : 'rgba(255,255,255,0.10)';
  const focusRing = focused ? error ? '0 0 0 2px rgba(244,63,94,0.18)' : '0 0 0 2px rgba(34,211,238,0.16)' : 'none';
  const affixStyle = {
    padding: '0 10px',
    color: '#6B6880',
    fontFamily: "'JetBrainsMono Nerd Font', 'JetBrains Mono', monospace",
    fontSize: '12px',
    background: '#18181C',
    display: 'flex',
    alignItems: 'center',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    alignSelf: 'stretch',
    flexShrink: 0
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      ...styleProp
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontFamily: "'JetBrainsMono Nerd Font', 'JetBrains Mono', monospace",
      fontSize: '10px',
      fontWeight: '500',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: error ? '#F43F5E' : '#6B6880',
      userSelect: 'none'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      background: '#202024',
      border: `1px solid ${borderColor}`,
      borderRadius: '6px',
      boxShadow: focusRing,
      transition: 'border-color 120ms ease, box-shadow 120ms ease',
      opacity: disabled ? 0.5 : 1,
      overflow: 'hidden'
    }
  }, prefix && /*#__PURE__*/React.createElement("div", {
    style: {
      ...affixStyle,
      borderRight: '1px solid rgba(255,255,255,0.08)'
    }
  }, prefix), /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    type: type,
    placeholder: placeholder,
    value: value,
    onChange: onChange,
    disabled: disabled,
    style: {
      flex: 1,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif",
      fontSize: '14px',
      color: '#F0EFF8',
      padding: '9px 12px',
      lineHeight: '1.5',
      minWidth: 0
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false)
  }, props)), suffix && /*#__PURE__*/React.createElement("div", {
    style: {
      ...affixStyle,
      borderLeft: '1px solid rgba(255,255,255,0.08)'
    }
  }, suffix)), (hint || error) && /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
      fontSize: '13px',
      color: error ? '#F43F5E' : '#6B6880',
      lineHeight: '1.5',
      margin: 0
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Tag({
  children,
  onRemove,
  style: styleProp,
  ...props
}) {
  const [closeHovered, setCloseHovered] = React.useState(false);
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      background: '#21222C',
      border: '1px solid #2B2C38',
      borderRadius: '9999px',
      fontFamily: "'DM Sans', sans-serif",
      fontSize: '13px',
      fontWeight: '400',
      color: '#A8A9C2',
      padding: '5px 10px',
      lineHeight: 1,
      userSelect: 'none',
      ...styleProp
    }
  }, props), children, onRemove && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '15px',
      height: '15px',
      borderRadius: '50%',
      background: closeHovered ? 'rgba(242,242,248,0.12)' : 'transparent',
      cursor: 'pointer',
      color: closeHovered ? '#F2F2F8' : '#52536A',
      fontSize: '13px',
      lineHeight: 1,
      transition: 'background 120ms, color 120ms',
      flexShrink: 0
    },
    onMouseEnter: () => setCloseHovered(true),
    onMouseLeave: () => setCloseHovered(false),
    onClick: e => {
      e.stopPropagation();
      onRemove();
    }
  }, "\xD7"));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Tag = __ds_scope.Tag;

})();
