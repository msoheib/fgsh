/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
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
      },
      fontFamily: {
        arabic: ['Ara Hamah Zanki', 'Tajawal', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(180deg, #1a0933 0%, #0f0520 100%)',
        'gradient-primary-alt': 'linear-gradient(135deg, #1a0933 0%, #0f0520 100%)',
        'gradient-gold': 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
        'gradient-silver': 'linear-gradient(135deg, #e5e7eb 0%, #9ca3af 100%)',
        'gradient-bronze': 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
      },
      backdropBlur: {
        glass: '10px',
      },
      boxShadow: {
        glow: '0 0 20px rgba(124, 58, 237, 0.5)',
        'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.5)',
        'glow-pink': '0 0 20px rgba(236, 72, 153, 0.5)',
      },
      animation: {
        'slide-up': 'slideUp 0.5s ease-out',
        celebrate: 'celebrate 1s ease-in-out infinite',
        'count-up': 'countUp 0.5s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(50px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        celebrate: {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)' },
          '25%': { transform: 'scale(1.1) rotate(5deg)' },
          '75%': { transform: 'scale(1.1) rotate(-5deg)' },
        },
        countUp: {
          '0%': { transform: 'scale(0.5)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
