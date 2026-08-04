import { useState } from 'react';

/**
 * A password <input> with a show/hide eye toggle — used on Login, Sign Up, and Reset
 * Password so people can double-check what they typed instead of guessing blind.
 */
export default function PasswordField({ value, onChange, placeholder, style, autoComplete, required = true }) {
  const [show, setShow] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        style={{ ...style, paddingRight: 38 }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        title={show ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 15,
          padding: 4,
          lineHeight: 1,
          opacity: 0.75,
        }}
      >
        {show ? '🙈' : '👁️'}
      </button>
    </div>
  );
}
