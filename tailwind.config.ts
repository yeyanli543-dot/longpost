import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: [
    './client/src/**/*.{ts,tsx,css}',
  ],
  theme: {
    extend: {
      animationFillMode: {
        none: 'none',
        forwards: 'forwards',
        backwards: 'backwards',
        both: 'both',
      },
      animationDirection: {
        normal: 'normal',
        reverse: 'reverse',
        alternate: 'alternate',
        'alternate-reverse': 'alternate-reverse',
      },
      keyframes: {
        enter: {
          from: {
            opacity: 'var(--tw-enter-opacity, 1)',
            transform:
              'translate3d(var(--tw-enter-translate-x, 0), var(--tw-enter-translate-y, 0), 0) scale3d(var(--tw-enter-scale, 1), var(--tw-enter-scale, 1), var(--tw-enter-scale, 1)) rotate(var(--tw-enter-rotate, 0))',
          },
        },
        exit: {
          to: {
            opacity: 'var(--tw-exit-opacity, 1)',
            transform:
              'translate3d(var(--tw-exit-translate-x, 0), var(--tw-exit-translate-y, 0), 0) scale3d(var(--tw-exit-scale, 1), var(--tw-exit-scale, 1), var(--tw-exit-scale, 1)) rotate(var(--tw-exit-rotate, 0))',
          },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;