/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Material Design 3 - Caule Theme
        surface: {
          DEFAULT: '#0c1322',
          dim: '#0c1322',
          bright: '#323949',
          variant: '#2e3545',
          tint: '#4edea3',
        },
        'surface-container': {
          DEFAULT: '#191f2f',
          low: '#141b2b',
          lowest: '#070e1d',
          high: '#232a3a',
          highest: '#2e3545',
        },
        'surface-card': '#1F2937',
        background: '#0c1322',
        foreground: '#dce2f7',
        primary: {
          DEFAULT: '#4edea3',
          container: '#10b981',
          fixed: '#6ffbbe',
          'fixed-dim': '#4edea3',
        },
        secondary: {
          DEFAULT: '#45dfa4',
          container: '#00bd85',
          fixed: '#68fcbf',
          'fixed-dim': '#45dfa4',
        },
        tertiary: {
          DEFAULT: '#ffb3af',
          container: '#fc7c78',
          fixed: '#ffdad7',
          'fixed-dim': '#ffb3af',
        },
        pitanga: '#ff5c33',
        'text-body': '#D1D5DB',
        'text-muted': '#9CA3AF',
        outline: {
          DEFAULT: '#86948a',
          variant: '#3c4a42',
        },
        // On-colors
        'on-primary': '#003824',
        'on-primary-container': '#00422b',
        'on-primary-fixed': '#002113',
        'on-secondary': '#003825',
        'on-secondary-container': '#00452e',
        'on-secondary-fixed': '#002114',
        'on-tertiary': '#650911',
        'on-tertiary-container': '#711419',
        'on-tertiary-fixed': '#410005',
        'on-surface': '#dce2f7',
        'on-surface-variant': '#bbcabf',
        'on-background': '#dce2f7',
        'on-error': '#690005',
        'on-error-container': '#ffdad6',
        // Inverse colors
        'inverse-surface': '#dce2f7',
        'inverse-on-surface': '#293040',
        'inverse-primary': '#006c49',
        // Error
        error: {
          DEFAULT: '#ffb4ab',
          container: '#93000a',
        },
        // Legacy shadcn/ui tokens
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        'headline': ['Plus Jakarta Sans', 'sans-serif'],
        'headline-lg': ['Plus Jakarta Sans', 'sans-serif'],
        'section-heading': ['Plus Jakarta Sans', 'sans-serif'],
        'body-md': ['Plus Jakarta Sans', 'sans-serif'],
        'label-sm': ['Inter', 'sans-serif'],
        'caption': ['Inter', 'sans-serif'],
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'headline-lg': ['36px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg-mobile': ['32px', { lineHeight: '1.2', fontWeight: '700' }],
        'section-heading': ['24px', { lineHeight: '1.3', fontWeight: '700' }],
        'body-md': ['16px', { lineHeight: '1.6', fontWeight: '400' }],
        'label-sm': ['14px', { lineHeight: '1.4', fontWeight: '500' }],
        'caption': ['12px', { lineHeight: '1.4', fontWeight: '400' }],
      },
      spacing: {
        'gutter-grid': '1rem',
        'margin-page': '1.5rem',
        'stack-sm': '0.5rem',
        'stack-md': '1rem',
        'stack-lg': '2rem',
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        'glass': '0 4px 24px rgba(0, 0, 0, 0.15)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
