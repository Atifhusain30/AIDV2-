/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // ============================================
      // DESIGN SYSTEM - AID Premium Mobile App
      // ============================================

      // COLOR PALETTE
      colors: {
        // Background layers (deep space theme)
        'surface': {
          '950': '#030108', // Deepest background
          '900': '#05020F',
          '800': '#08041A',
          '700': '#0C0620',
          '600': '#100928',
          '500': '#151030',
          '400': '#1A1540',
          '300': '#222050',
          '200': '#2A2860',
          '100': '#353370',
        },
        // Primary brand (violet/iris)
        'primary': {
          '50': '#F5F3FF',
          '100': '#EDE9FE',
          '200': '#DDD6FE',
          '300': '#C4B5FD',
          '400': '#A78BFA',
          '500': '#8B5CF6', // Main brand
          '600': '#7C3AED',
          '700': '#6D28D9',
          '800': '#5B21B6',
          '900': '#4C1D95',
          '950': '#2E1065',
        },
        // Secondary/accent (emerald/teal for drivers + success)
        'accent': {
          '50': '#ECFDF5',
          '100': '#D1FAE5',
          '200': '#A7F3D0',
          '300': '#6EE7B7',
          '400': '#34D399',
          '500': '#10B981', // Main accent
          '600': '#059669',
          '700': '#047857',
          '800': '#065F46',
          '900': '#064E3B',
          '950': '#022C22',
        },
        // Status colors
        'success': '#10B981',
        'warning': '#F59E0B',
        'error': '#EF4444',
        'info': '#3B82F6',
        // Glass effects
        'glass': {
          'white': 'rgba(255, 255, 255, 0.08)',
          'white-strong': 'rgba(255, 255, 255, 0.12)',
          'primary': 'rgba(139, 92, 246, 0.12)',
          'primary-strong': 'rgba(139, 92, 246, 0.20)',
          'accent': 'rgba(16, 185, 129, 0.12)',
          'border': 'rgba(255, 255, 255, 0.10)',
          'border-strong': 'rgba(255, 255, 255, 0.15)',
        },
        // Legacy aliases for backwards compatibility
        'void': {
          950: '#030108',
          900: '#050210',
          800: '#080416',
          700: '#0a061c',
          600: '#0f0a1a',
          500: '#130d22',
        },
        'iris': {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
      },

      // TYPOGRAPHY SCALE
      fontSize: {
        // Display (hero text)
        'display': ['3.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        // Headings
        'h1': ['2rem', { lineHeight: '1.2', letterSpacing: '-0.015em', fontWeight: '700' }],
        'h2': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        'h3': ['1.25rem', { lineHeight: '1.4', fontWeight: '600' }],
        'h4': ['1.125rem', { lineHeight: '1.4', fontWeight: '600' }],
        // Body text
        'body-lg': ['1.0625rem', { lineHeight: '1.6', fontWeight: '400' }],
        'body': ['0.9375rem', { lineHeight: '1.6', fontWeight: '400' }],
        'body-sm': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
        // UI elements
        'ui': ['0.875rem', { lineHeight: '1', fontWeight: '500' }],
        'ui-sm': ['0.8125rem', { lineHeight: '1', fontWeight: '500' }],
        // Caption/labels
        'caption': ['0.75rem', { lineHeight: '1.4', fontWeight: '500' }],
        'overline': ['0.6875rem', { lineHeight: '1', letterSpacing: '0.08em', fontWeight: '600' }],
      },

      // FONT FAMILIES
      fontFamily: {
        'sans': ['SF Pro Display', '-apple-system', 'BlinkMacSystemFont', 'Inter', 'Segoe UI', 'sans-serif'],
        'mono': ['SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },

      // SPACING SYSTEM (4px base)
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '1.5': '6px',
        '2': '8px',
        '2.5': '10px',
        '3': '12px',
        '3.5': '14px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '7': '28px',
        '8': '32px',
        '9': '36px',
        '10': '40px',
        '11': '44px',
        '12': '48px',
        '14': '56px',
        '16': '64px',
        '18': '72px',
        '20': '80px',
        '24': '96px',
      },

      // BORDER RADIUS
      borderRadius: {
        'none': '0',
        'sm': '6px',
        'DEFAULT': '8px',
        'md': '10px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
        '3xl': '24px',
        '4xl': '32px',
        'full': '9999px',
      },

      // BOX SHADOWS
      boxShadow: {
        'sm': '0 1px 2px rgba(0, 0, 0, 0.3)',
        'DEFAULT': '0 2px 4px rgba(0, 0, 0, 0.3)',
        'md': '0 4px 12px rgba(0, 0, 0, 0.35)',
        'lg': '0 8px 24px rgba(0, 0, 0, 0.4)',
        'xl': '0 16px 40px rgba(0, 0, 0, 0.5)',
        '2xl': '0 24px 60px rgba(0, 0, 0, 0.55)',
        'inner': 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        // Glow effects
        'glow-primary': '0 0 20px rgba(139, 92, 246, 0.35)',
        'glow-primary-lg': '0 0 40px rgba(139, 92, 246, 0.5)',
        'glow-accent': '0 0 20px rgba(16, 185, 129, 0.35)',
        'glow-accent-lg': '0 0 40px rgba(16, 185, 129, 0.5)',
        'glow-error': '0 0 20px rgba(239, 68, 68, 0.35)',
        // Card shadows
        'card': '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        'card-hover': '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'modal': '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(139, 92, 246, 0.1)',
      },

      // ANIMATIONS
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-slower': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'float-delayed': 'float 6s ease-in-out infinite 1s',
        'shimmer': 'shimmer 2s linear infinite',
        'ping-slow': 'ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slide-down 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 0.3s ease-out',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        glow: {
          '0%': { 
            boxShadow: '0 0 20px rgba(139, 92, 246, 0.3), 0 0 40px rgba(139, 92, 246, 0.1)'
          },
          '100%': { 
            boxShadow: '0 0 30px rgba(139, 92, 246, 0.5), 0 0 60px rgba(139, 92, 246, 0.2)'
          },
        },
        'glow-pulse': {
          '0%, 100%': { 
            boxShadow: '0 0 0 0 rgba(139, 92, 246, 0.4)'
          },
          '50%': { 
            boxShadow: '0 0 0 12px rgba(139, 92, 246, 0)'
          },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-100%)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: 0 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },

      // BACKDROP BLUR
      backdropBlur: {
        'xs': '2px',
        'sm': '4px',
        'DEFAULT': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
        '2xl': '40px',
        '3xl': '64px',
      },

      // GRADIENTS
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
        'shine': 'linear-gradient(90deg, transparent 0%, transparent 40%, rgba(255, 255, 255, 0.15) 50%, transparent 60%, transparent 100%)',
        // Brand gradients
        'primary-gradient': 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
        'accent-gradient': 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
        'surface-gradient': 'linear-gradient(180deg, #0C0620 0%, #08041A 100%)',
      },

      // TRANSITIONS
      transitionTimingFunction: {
        'bounce-in': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'snappy': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        '250': '250ms',
        '350': '350ms',
        '400': '400ms',
      },
    },
  },
  plugins: [],
}
