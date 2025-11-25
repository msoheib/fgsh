/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          start: '#1a0933',
          end: '#0f0520',
          solid: '#7c3aed',
          light: '#a78bfa',
          dark: '#6d28d9',
        },
        secondary: {
          main: '#06b6d4',
          light: '#22d3ee',
          dark: '#0891b2',
        },
        accent: {
          main: '#ec4899',
          light: '#f472b6',
          dark: '#db2777',
        },
        background: {
          dark: '#1a0933',
          darkPurple: '#0f0520',
        },
        text: {
          primary: '#ffffff',
          secondary: '#e5e7eb',
          muted: '#9ca3af',
        },
        status: {
          success: '#10b981',
          error: '#ef4444',
          warning: '#f59e0b',
          info: '#3b82f6',
        },
        rank: {
          gold: {
            start: '#ffd700',
            end: '#ffed4e',
          },
          silver: {
            start: '#c0c0c0',
            end: '#e8e8e8',
          },
          bronze: {
            start: '#cd7f32',
            end: '#e8a25c',
          },
        },
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        xxl: '48px',
        xxxl: '64px',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        xxl: '32px',
      },
      fontFamily: {
        arabic: ['AraHamahZanki', 'Tajawal'],
      },
      fontSize: {
        xs: '12px',
        sm: '14px',
        base: '16px',
        lg: '18px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '30px',
        '4xl': '36px',
        '5xl': '48px',
        '6xl': '60px',
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
        extrabold: '800',
      },
    },
  },
  plugins: [],
};
